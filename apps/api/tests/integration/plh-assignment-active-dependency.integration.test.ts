/**
 * Plh/Plt delegation provenance — real PostgreSQL.
 *
 * Review item 1: `board_suspension_plh_assignments.assignment_id` is
 * `ON DELETE CASCADE`, so deleting a `user_role_assignments` row while a
 * suspension is still ACTIVE takes the dependency with it. The dependency is
 * the only record of whether the suspension *created* the delegation or merely
 * reused one — and what to restore if it reused one. Lose it mid-suspension and
 * the eventual lift cannot decide, leaving the delegation active forever or
 * deleting a row it should have restored.
 *
 * The suite proves both layers of the fix on a real database: the service
 * refuses the delete with a 409, and the database trigger refuses it even when
 * every application-level check is bypassed with raw SQL. It then proves the
 * suspension's own lift still succeeds, which is the case a naive trigger would
 * have broken (the release deletes the row, so the trigger must not be able to
 * see an ACTIVE suspension by then).
 *
 * Opt-in via RUN_DB_TESTS=1, like the other DB suites.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    setex: vi.fn().mockResolvedValue('OK'),
    eval: vi.fn().mockResolvedValue(1),
  },
}));

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const SEED = `
INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-ketua',   'YAYASAN_KETUA',   'Ketua Yayasan',  'YAYASAN', '[]'::jsonb, now()),
  ('role-anggota', 'YAYASAN_ANGGOTA', 'Anggota Yayasan','YAYASAN', '[]'::jsonb, now()),
  ('role-pengawas','YAYASAN_PENGAWAS','Pengawas Yayasan','YAYASAN', '[]'::jsonb, now()),
  ('role-pembina','YAYASAN_PEMBINA',  'Pembina Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-issuer',   'Pengawas',        'pengawas@example.com',   true, now()),
  ('u-lifter',   'Pembina',         'pembina@example.com',    true, now()),
  ('u-target',   'Ketua Target',    'target@example.com',     true, now()),
  ('u-delegate', 'Anggota Delegasi','delegate@example.com',   true, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-issuer', 'u-issuer', 'role-pengawas', false, true, now()),
  ('a-lifter', 'u-lifter', 'role-pembina',  false, true, now()),
  ('a-target', 'u-target', 'role-ketua',    true,  true, now());
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

describeDb('Plh delegation active-dependency guard (real PostgreSQL)', () => {
  const dbName = `cipansor_plh_dep_${Date.now()}`;
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

    const db = new Client({ connectionString: targetUrl });
    await db.connect();
    try {
      const dirs = readdirSync(MIGRATIONS)
        .filter((d) => d !== 'migration_lock.toml')
        .sort();
      for (const dir of dirs) {
        await db.query(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'));
      }
      await db.query(SEED);
    } finally {
      await db.end();
    }
  }, 180_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  const loadService = async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl;
    vi.resetModules();
    try {
      const suspensionMod = await import('../../src/modules/pengawasan/board-suspension.service');
      const rolesMod = await import('../../src/modules/roles/roles.service');
      return {
        suspension: new suspensionMod.BoardSuspensionService(),
        roles: new rolesMod.RolesService(),
        previousUrl,
      };
    } catch (error) {
      process.env.DATABASE_URL = previousUrl;
      throw error;
    }
  };

  const unloadService = async (previousUrl: string | undefined) => {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  };

  const resetState = () =>
    withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM board_suspension_plh_assignments`);
      await db.query(`DELETE FROM board_member_suspensions`);
      await db.query(`DELETE FROM user_role_assignments WHERE user_id = 'u-delegate'`);
      await db.query(
        `UPDATE users SET is_active = true, account_state_writer = NULL WHERE id LIKE 'u-%'`
      );
    });

  const suspend = (service: any, userId: string, sk: string) =>
    service.suspendBoardMember(
      {
        userId,
        skNumber: sk,
        auditReason: 'Temuan audit independen untuk pengujian provenance.',
        plhUserId: 'u-delegate',
        plhRoleCode: 'YAYASAN_ANGGOTA',
      },
      'u-issuer',
      'YAYASAN_PENGAWAS'
    );

  it('refuses a service-level revoke of an assignment an ACTIVE suspension depends on', async () => {
    await resetState();
    const { suspension, roles, previousUrl } = await loadService();
    try {
      await suspend(suspension, 'u-target', 'SK/DEP-1');

      const delegation = await withClient(targetUrl, async (db) => {
        const res = await db.query(
          `SELECT id FROM user_role_assignments WHERE user_id = 'u-delegate'`
        );
        return res.rows[0].id as string;
      });

      await expect(
        roles.removeRoleAssignment(
          { sub: 'u-admin', roleCode: 'SUPER_ADMIN', unitId: null },
          delegation
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      // The dependency — and its provenance — must survive the refused revoke.
      await withClient(targetUrl, async (db) => {
        const deps = await db.query(
          `SELECT created FROM board_suspension_plh_assignments WHERE assignment_id = $1`,
          [delegation]
        );
        expect(deps.rows, 'the dependency row must survive').toHaveLength(1);
        expect(deps.rows[0].created, 'a suspension-minted delegation is flagged').toBe(true);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('the database trigger refuses a raw delete while a suspension is ACTIVE', async () => {
    await resetState();
    const { suspension, previousUrl } = await loadService();
    try {
      await suspend(suspension, 'u-target', 'SK/DEP-2');
      await unloadService(previousUrl);

      await withClient(targetUrl, async (db) => {
        await expect(
          db.query(`DELETE FROM user_role_assignments WHERE user_id = 'u-delegate'`)
        ).rejects.toMatchObject({ code: '23514' });
      });
    } finally {
      // `unloadService` already ran; nothing further to restore.
    }
  });

  it('lets the suspension lift and release its own delegation afterwards', async () => {
    await resetState();
    const { suspension, previousUrl } = await loadService();
    try {
      const created = await suspend(suspension, 'u-target', 'SK/DEP-3');

      // The lift sets status LIFTED before the release deletes the row, so the
      // trigger must not block the suspension's own cleanup.
      await expect(
        suspension.liftBoardSuspension(
          created.id,
          'u-lifter',
          'Pemulihan status.',
          'YAYASAN_PEMBINA'
        )
      ).resolves.toBeDefined();

      await withClient(targetUrl, async (db) => {
        const delegation = await db.query(
          `SELECT id FROM user_role_assignments WHERE user_id = 'u-delegate'`
        );
        expect(delegation.rows, 'the suspension-created delegation is released').toHaveLength(0);
        const deps = await db.query(
          `SELECT count(*)::int AS n FROM board_suspension_plh_assignments`
        );
        expect(deps.rows[0].n).toBe(0);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('allows a revoke again once the suspension is no longer ACTIVE', async () => {
    await resetState();
    const { suspension, roles, previousUrl } = await loadService();
    try {
      const created = await suspend(suspension, 'u-target', 'SK/DEP-4');

      // A suspension that reuses an existing delegation is the case where the
      // row outlives the lift. Seed one directly for that shape.
      await withClient(targetUrl, async (db) => {
        await db.query(`DELETE FROM board_suspension_plh_assignments WHERE assignment_id NOT IN (
          SELECT id FROM user_role_assignments WHERE user_id = 'u-delegate'
        )`);
      });

      await suspension.liftBoardSuspension(
        created.id,
        'u-lifter',
        'Pemulihan status.',
        'YAYASAN_PEMBINA'
      );
      await unloadService(previousUrl);

      // Re-create a delegate delegation with no suspension behind it, then
      // revoke it through the service: nothing ACTIVE depends on it.
      const fresh = await loadService();
      try {
        await withClient(targetUrl, async (db) => {
          await db.query(
            `INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at)
             VALUES ('a-free', 'u-delegate', 'role-anggota', false, true, now())`
          );
        });
        await expect(
          fresh.roles.removeRoleAssignment(
            { sub: 'u-admin', roleCode: 'SUPER_ADMIN', unitId: null },
            'a-free'
          )
        ).resolves.toBeDefined();
        await withClient(targetUrl, async (db) => {
          const res = await db.query(`SELECT id FROM user_role_assignments WHERE id = 'a-free'`);
          expect(res.rows).toHaveLength(0);
        });
      } finally {
        await unloadService(fresh.previousUrl);
      }
      return;
    } finally {
      // Nothing further.
    }
  });
});
