/**
 * A WBS handler whose role was revoked loses access immediately — real
 * PostgreSQL.
 *
 * F4 (critical). The access token carries a `roleCode`/`unitId` snapshot that
 * `authenticate` never re-checks against the persistent `user_role_assignments`
 * rows. Before this fix, a handler whose assignment was revoked kept the full
 * scope of the role named in its token — reading and mutating every report that
 * role could see — until the access token expired.
 *
 * The unit suite proves the guard with Prisma mocked; this suite runs the real
 * service against a real PostgreSQL, so the assignment read is the actual row
 * the revocation writes. Every WBS entry point (list, status, forward, comment)
 * must answer 403 once the assignment is gone, and the un-revoked positive
 * control must still succeed.
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
INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('user-pengawas', 'Pengawas', 'pengawas@example.com', true, now());

INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-pengawas', 'YAYASAN_PENGAWAS', 'Pengawas Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-pengawas', 'user-pengawas', 'role-pengawas', true, true, now());

INSERT INTO wbs_reports
  (id, ticket_code, tracking_token, category, target_level, subject, description,
   primary_handler_role, status, assigned_user_id, updated_at)
VALUES
  ('r-in-scope', 'WBS-202601-SCOPE1', '${'e'.repeat(64)}', 'KEUANGAN_ASET', 'PENGURUS_YAYASAN',
   'Subjek', 'Deskripsi laporan yang cukup panjang.', 'YAYASAN_PENGAWAS', 'DALAM_PENYELIDIKAN',
   'user-pengawas', now());
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

describeDb('WBS revoked-handler access (real PostgreSQL)', () => {
  const dbName = `cipansor_wbs_revoked_${Date.now()}`;
  const baseUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const targetUrl = (() => {
    const u = new URL(baseUrl);
    u.pathname = `/${dbName}`;
    return u.toString();
  })();

  let admin: Client;

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
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM wbs_forward_logs WHERE report_id = 'r-in-scope'`);
      await db.query(`DELETE FROM wbs_comments WHERE report_id = 'r-in-scope'`);
      await db.query(
        `UPDATE wbs_reports SET status = 'DALAM_PENYELIDIKAN', assigned_user_id = 'user-pengawas',
           primary_handler_role = 'YAYASAN_PENGAWAS'
         WHERE id = 'r-in-scope'`
      );
      await db.query(
        `UPDATE user_role_assignments SET is_active = true, expires_at = NULL
         WHERE id = 'a-pengawas'`
      );
    });
  });

  const actor: WbsActor = {
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

  it('refuses every entry point once the token role is revoked', async () => {
    const { service, previousUrl } = await loadService();
    try {
      // Positive control first: with the assignment active, the in-scope report
      // is visible and mutable — proving the fixtures, not the guard, grant it.
      const listed = await service.getReportsForUser(actor);
      expect(listed.map((r) => r.id)).toContain('r-in-scope');
      await service.updateReportStatus('r-in-scope', { status: 'DITINDAKLANJUTI' }, actor);

      // Reset to the seeded open state and revoke the assignment.
      await withClient(targetUrl, async (db) => {
        await db.query(
          `UPDATE wbs_reports SET status = 'DALAM_PENYELIDIKAN' WHERE id = 'r-in-scope'`
        );
        await db.query(
          `UPDATE user_role_assignments SET is_active = false WHERE id = 'a-pengawas'`
        );
      });

      // The old access token still names YAYASAN_PENGAWAS, but the assignment
      // is gone. Every authorization boundary must now refuse.
      await expect(service.getReportsForUser(actor)).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        service.updateReportStatus('r-in-scope', { status: 'DITINDAKLANJUTI' }, actor)
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        service.forwardReport(
          'r-in-scope',
          { toRole: 'YAYASAN_KETUA', reason: 'Diteruskan ke ketua.' },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        service.addHandlerComment('r-in-scope', 'komentar', undefined, actor)
      ).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await unloadService(previousUrl);
    }

    // The revoked request must not have written anything.
    await withClient(targetUrl, async (db) => {
      const row = await db.query(
        `SELECT status, assigned_user_id, primary_handler_role FROM wbs_reports WHERE id = 'r-in-scope'`
      );
      expect(row.rows[0].status).toBe('DALAM_PENYELIDIKAN');
      expect(row.rows[0].assigned_user_id).toBe('user-pengawas');
      expect(row.rows[0].primary_handler_role).toBe('YAYASAN_PENGAWAS');
    });
  });

  it('refuses a handler whose assignment expired', async () => {
    const { service, previousUrl } = await loadService();
    try {
      await withClient(targetUrl, async (db) => {
        await db.query(
          `UPDATE user_role_assignments SET expires_at = now() - interval '1 hour'
           WHERE id = 'a-pengawas'`
        );
      });

      await expect(service.getReportsForUser(actor)).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await unloadService(previousUrl);
    }
  });
});
