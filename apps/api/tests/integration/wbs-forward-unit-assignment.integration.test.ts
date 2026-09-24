/**
 * WBS forwarding binds the destination role to the *assignment's* unit — real
 * PostgreSQL.
 *
 * The eligibility check used to read `User.unitId`, a single home unit, while
 * `buildScopeWhere` resolves the actor's unit from the **active role
 * assignment** (`tokenUnitId`). A person can hold the same role in several units
 * through `UserRoleAssignment.unitId`, so a recipient whose matching assignment
 * sat in the report's unit but whose home unit was elsewhere was accepted and
 * then could not list or open the report — it landed in a queue its new owner
 * could not read. The inverse also leaked: a matching home unit was accepted
 * even when the destination assignment lived in another unit.
 *
 * A mock cannot show this: it is the *assignment* row the scope query joins, and
 * the decision and the write must share one locked read. This suite drives the
 * real `wbsService.forwardReport` and the real `getReportsForUser` against a
 * real PostgreSQL.
 *
 * Opt-in via RUN_DB_TESTS=1, like the other DB suites.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import type { WbsActor } from '../../src/modules/pengawasan/wbs.service';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const SEED = `
INSERT INTO units (id, name, type, address, updated_at) VALUES
  ('unit-sdit', 'SD IT', 'SD_IT', 'Alamat', now()),
  ('unit-smpit', 'SMP IT', 'SMP_IT', 'Alamat', now());

INSERT INTO users (id, name, email, is_active, unit_id, updated_at) VALUES
  ('user-pengawas', 'Pengawas', 'pengawas@example.com', true, NULL, now()),
  ('user-multi',    'Multi',   'multi@example.com',    true, 'unit-smpit', now()),
  ('user-home-match','Home',   'home@example.com',     true, 'unit-sdit', now()),
  ('user-elsewhere','Else',    'else@example.com',     true, 'unit-smpit', now());

INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-pengawas', 'YAYASAN_PENGAWAS', 'Pengawas Yayasan', 'YAYASAN', '[]'::jsonb, now()),
  ('role-sdit-admin', 'SDIT_ADMIN', 'Admin SD IT', 'SD_IT', '[]'::jsonb, now());

-- The multi-unit holder: the destination role lives in BOTH units, so only the
-- assignment matching the report's unit should open it.
INSERT INTO user_role_assignments (id, user_id, role_id, unit_id, is_primary, is_active, updated_at) VALUES
  ('a-pengawas',    'user-pengawas', 'role-pengawas',   NULL,        true, true, now()),
  ('a-multi-smpit', 'user-multi',    'role-sdit-admin', 'unit-smpit', false, true, now()),
  ('a-multi-sdit',  'user-multi',    'role-sdit-admin', 'unit-sdit',  false, true, now()),
  -- Home unit matches the report, but the destination assignment is elsewhere.
  ('a-home-smpit',  'user-home-match','role-sdit-admin','unit-smpit', false, true, now()),
  -- The only assignment is for another unit.
  ('a-elsewhere',   'user-elsewhere','role-sdit-admin', 'unit-smpit', false, true, now());

INSERT INTO wbs_reports
  (id, ticket_code, tracking_token, category, target_level, subject, description,
   unit_id, primary_handler_role, status, assigned_user_id, updated_at)
VALUES
  ('r-unit', 'WBS-202601-UNIT01', '${'c'.repeat(64)}', 'KEUANGAN_ASET', 'KEPALA_UNIT',
   'Subjek', 'Deskripsi laporan yang cukup panjang.', 'unit-sdit', 'YAYASAN_PENGAWAS',
   'DALAM_PENYELIDIKAN', 'user-pengawas', now()),
  -- A unit's own STAFF/SISWA report, escalated up to the Pengawas. Its
  -- target_level is still SISWA_SANTRI but its routing has moved off the unit.
  ('r-escalated', 'WBS-202601-UNIT02', '${'d'.repeat(64)}', 'ETIKA_PERILAKU', 'SISWA_SANTRI',
   'Subjek', 'Deskripsi laporan yang cukup panjang.', 'unit-sdit', 'YAYASAN_PENGAWAS',
   'DALAM_PENYELIDIKAN', 'user-pengawas', now());
`;

async function withClient<T>(url: string, fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

describeDb('WBS forward recipient unit-assignment eligibility (real PostgreSQL)', () => {
  const dbName = `cipansor_wbs_unit_${Date.now()}`;
  const baseUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const targetUrl = (() => {
    const u = new URL(baseUrl);
    u.pathname = `/${dbName}`;
    return u.toString();
  })();

  let admin: Client;

  async function resetState(): Promise<void> {
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM wbs_forward_logs WHERE report_id = 'r-unit'`);
      await db.query(`DELETE FROM wbs_comments WHERE report_id = 'r-unit'`);
      await db.query(
        `UPDATE wbs_reports
         SET unit_id = 'unit-sdit', status = 'DALAM_PENYELIDIKAN',
             assigned_user_id = 'user-pengawas', primary_handler_role = 'YAYASAN_PENGAWAS'
         WHERE id = 'r-unit'`
      );
      await db.query(
        `UPDATE user_role_assignments SET is_active = true, expires_at = NULL
         WHERE user_id IN ('user-multi', 'user-home-match', 'user-elsewhere')`
      );
    });
  }

  beforeAll(async () => {
    admin = new Client({ connectionString: baseUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);

    await withClient(targetUrl, async (db) => {
      const dirs = readdirSync(MIGRATIONS)
        .filter((d) => d !== 'migration_lock.toml')
        .sort();
      for (const dir of dirs) {
        await db.query(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'));
      }
      await db.query(SEED);
    });
  }, 180_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  beforeEach(async () => {
    vi.resetModules();
    await resetState();
  });

  const actor = {
    id: 'user-pengawas',
    name: 'Pengawas',
    roleCode: 'YAYASAN_PENGAWAS',
    unitId: null,
  };

  const loadService = async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl;
    vi.resetModules();
    const mod = await import('../../src/modules/pengawasan/wbs.service');
    return { service: mod.wbsService, previousUrl };
  };

  const unloadService = async (previousUrl: string | undefined) => {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  };

  /** A handler token for the recipient, unit resolved the way `tokenUnitId` does. */
  const recipientActor = (unitId: string | null): WbsActor => ({
    id: 'user-multi',
    name: 'Multi',
    roleCode: 'SDIT_ADMIN',
    unitId,
  });

  it('refuses a recipient whose destination assignment is only in another unit', async () => {
    const { service, previousUrl } = await loadService();
    try {
      await expect(
        service.forwardReport(
          'r-unit',
          {
            toRole: 'UNIT_ADMIN',
            reason: 'Terkait pelanggaran kepala unit.',
            toUserId: 'user-elsewhere',
          },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await unloadService(previousUrl);
    }

    await withClient(targetUrl, async (db) => {
      const row = await db.query(`SELECT assigned_user_id FROM wbs_reports WHERE id = 'r-unit'`);
      expect(row.rows[0].assigned_user_id).toBe('user-pengawas');
    });
  });

  it('refuses when User.unitId matches but the destination assignment unit does not', async () => {
    // `user-home-match.unit_id` is the report's unit, and its only destination
    // assignment is in unit-smpit. Judging by the home unit would admit it; the
    // assignment unit must not.
    const { service, previousUrl } = await loadService();
    try {
      await expect(
        service.forwardReport(
          'r-unit',
          {
            toRole: 'UNIT_ADMIN',
            reason: 'Terkait pelanggaran kepala unit.',
            toUserId: 'user-home-match',
          },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('accepts a multi-unit holder when one assignment matches the report unit', async () => {
    const { service, previousUrl } = await loadService();
    try {
      const updated = await service.forwardReport(
        'r-unit',
        {
          toRole: 'UNIT_ADMIN',
          reason: 'Terkait pelanggaran kepala unit.',
          toUserId: 'user-multi',
        },
        actor
      );
      expect(updated.assignedUserId).toBe('user-multi');
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('a forwarded recipient can list, read and mutate the report with the destination role', async () => {
    const { service, previousUrl } = await loadService();
    try {
      await service.forwardReport(
        'r-unit',
        {
          toRole: 'UNIT_ADMIN',
          reason: 'Terkait pelanggaran kepala unit.',
          toUserId: 'user-multi',
        },
        actor
      );

      // The recipient's token unit for the SDIT_ADMIN role is unit-sdit (their
      // matching assignment), even though their home unit is unit-smpit.
      const recipient = recipientActor('unit-sdit');

      // A forward to a named recipient is proven reachable by the list query,
      // which is the endpoint the web actually consumes. The per-report
      // `GET /wbs/reports/:id` endpoint was removed as orphaned, so the list
      // query is the contract this proves.
      const listed = await service.getReportsForUser(recipient);
      expect(listed.map((r) => r.id)).toContain('r-unit');

      const updated = await service.updateReportStatus(
        'r-unit',
        { status: 'DITINDAKLANJUTI' },
        recipient
      );
      expect(updated.status).toBe('DITINDAKLANJUTI');
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('does not reopen access for a recipient whose matching assignment is revoked', async () => {
    const { service, previousUrl } = await loadService();
    try {
      await withClient(targetUrl, async (db) => {
        await db.query(
          `UPDATE user_role_assignments SET is_active = false WHERE id = 'a-multi-sdit'`
        );
      });

      await expect(
        service.forwardReport(
          'r-unit',
          {
            toRole: 'UNIT_ADMIN',
            reason: 'Terkait pelanggaran kepala unit.',
            toUserId: 'user-multi',
          },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('keeps a KEPALA_UNIT report readable by the unit after a role-level forward', async () => {
    // `forwardReport` with `toRole: 'UNIT_ADMIN'` and no `toUserId` routes the
    // report to the unit queue without naming a person. It sets
    // `primaryHandlerRole` but leaves `targetLevel` alone, so the unit scope
    // branch must match the routing — otherwise a KEPALA_UNIT report routed
    // this way is readable by nobody in the unit it was sent to.
    const { service, previousUrl } = await loadService();
    try {
      await withClient(targetUrl, async (db) => {
        await db.query(
          `UPDATE wbs_reports
           SET unit_id = 'unit-sdit', target_level = 'KEPALA_UNIT',
               status = 'DALAM_PENYELIDIKAN',
               assigned_user_id = 'user-pengawas',
               primary_handler_role = 'YAYASAN_KETUA'
           WHERE id = 'r-unit'`
        );
      });

      const forwarded = await service.forwardReport(
        'r-unit',
        { toRole: 'UNIT_ADMIN', reason: 'Diteruskan ke kepala unit terkait.' },
        actor
      );
      expect(forwarded.assignedUserId).toBeNull();

      const unitHandler: WbsActor = {
        id: 'user-multi',
        name: 'Multi',
        roleCode: 'SDIT_ADMIN',
        unitId: 'unit-sdit',
      };

      // The routed report is reachable by the unit's list query — the
      // per-report endpoint was removed as orphaned.
      const listed = await service.getReportsForUser(unitHandler);
      expect(listed.map((r) => r.id)).toContain('r-unit');
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('hides and refuses a STAFF/SISWA report the unit escalated to the Pengawas', async () => {
    // SECURITY: the unit branch of `buildScopeWhere` matched `targetLevel`
    // STAF_PEGAWAI/SISWA_SANTRI as well as the routing, so a report the unit
    // itself forwarded up to a yayasan bucket stayed listable and mutable by the
    // originating unit — the escalation was cosmetic. The branch now keys on
    // `primaryHandlerRole` alone, and `forwardReport` overwrites it.
    const { service, previousUrl } = await loadService();
    try {
      const unitHandler: WbsActor = {
        id: 'user-multi',
        name: 'Multi',
        roleCode: 'SDIT_ADMIN',
        unitId: 'unit-sdit',
      };

      // Positive control: route the unit's own report back to the unit queue.
      // That sets `primary_handler_role = 'UNIT_ADMIN'`, so it stays visible —
      // the fix narrows the grant to the routing, it does not break the unit's
      // own queue.
      await service.forwardReport(
        'r-unit',
        { toRole: 'UNIT_ADMIN', reason: 'Diteruskan ke kepala unit terkait.' },
        actor
      );

      const listed = await service.getReportsForUser(unitHandler);
      const ids = listed.map((r) => r.id);
      expect(ids).toContain('r-unit');
      expect(ids).not.toContain('r-escalated');

      // Every mutation path must refuse the out-of-scope report. It exists, so
      // the refusal is 403 (not 404).
      await expect(
        service.updateReportStatus(
          'r-escalated',
          { status: 'DALAM_PENYELIDIKAN', resolution: undefined } as any,
          unitHandler
        )
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        service.forwardReport(
          'r-escalated',
          { toRole: 'UNIT_ADMIN', reason: 'Diteruskan kembali ke unit.' },
          unitHandler
        )
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        service.addHandlerComment('r-escalated', 'halo', undefined, unitHandler)
      ).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await unloadService(previousUrl);
    }
  });
});
