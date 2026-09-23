/**
 * Shared Plh delegation expiry restoration — real PostgreSQL.
 *
 * Review item 3: two suspensions may reuse and extend the *same*
 * `UserRoleAssignment`. Each records, as its "prior state", the expiry the row
 * had at the moment it acted. Suspension A acts first, extending the row from
 * its original expiry to A's horizon and recording the original; suspension B
 * then acts on the already-extended row and records A's extended expiry. When B
 * is lifted first, handing B's snapshot to A verbatim leaves A — the last lifter
 * — restoring the row to B's suspension deadline instead of the expiry it had
 * before either suspension.
 *
 * The suite drives the full lifecycle through the real service on a real
 * database: A extends, B extends further, then both lift in each order. The
 * final expiry must be the original one. It also covers a suspension-created
 * delegation and an originally-unbounded one.
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

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

/**
 * The delegate's pre-suspension expiry and the two suspensions' horizons, all
 * relative to now, so the "effective row gets extended" branch is exercised:
 * the delegate expiry is in the future (the row is still effective) but earlier
 * than either horizon (so each suspension extends it).
 */
const DELEGATE_EXPIRY = new Date(Date.now() + 10 * 86_400_000).toISOString();
const HORIZON_A = new Date(Date.now() + 40 * 86_400_000).toISOString();
const HORIZON_B = new Date(Date.now() + 70 * 86_400_000).toISOString();

const SEED = `
INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-ketua',   'YAYASAN_KETUA',   'Ketua Yayasan',   'YAYASAN', '[]'::jsonb, now()),
  ('role-anggota', 'YAYASAN_ANGGOTA', 'Anggota Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-issuer',   'Pengawas',         'pengawas@example.com',   true, now()),
  ('u-target-a', 'Ketua Target A',   'targeta@example.com',    true, now()),
  ('u-target-b', 'Ketua Target B',   'targetb@example.com',    true, now()),
  ('u-delegate', 'Anggota Delegasi', 'delegate@example.com',   true, now());
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

describeDb('Shared Plh delegation expiry restoration (real PostgreSQL)', () => {
  const dbName = `cipansor_plh_restore_${Date.now()}`;
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

  beforeEach(() => {
    vi.resetModules();
  });

  const loadService = async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl;
    vi.resetModules();
    try {
      const mod = await import('../../src/modules/pengawasan/board-suspension.service');
      return { suspension: new mod.BoardSuspensionService(), previousUrl };
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
      // Recreate every assignment, including a delegate row a prior test may
      // have released, with the effective pre-suspension expiry.
      await db.query(
        `INSERT INTO user_role_assignments
           (id, user_id, role_id, is_primary, is_active, expires_at, updated_at)
         VALUES
           ('a-target-a', 'u-target-a', 'role-ketua',   true,  true, NULL, now()),
           ('a-target-b', 'u-target-b', 'role-ketua',   true,  true, NULL, now()),
           ('a-delegate', 'u-delegate', 'role-anggota', false, true, $1, now())
         ON CONFLICT (id) DO UPDATE SET
           is_active = EXCLUDED.is_active,
           expires_at = EXCLUDED.expires_at`,
        [DELEGATE_EXPIRY]
      );
      await db.query(
        `UPDATE users SET is_active = true, account_state_writer = NULL, deleted_at = NULL
         WHERE id LIKE 'u-%'`
      );
    });

  const suspend = (service: any, userId: string, sk: string, projectedEndDate?: string) =>
    service.suspendBoardMember(
      {
        userId,
        skNumber: sk,
        auditReason: 'Temuan audit independen untuk pengujian provenance.',
        projectedEndDate,
        plhUserId: 'u-delegate',
        plhRoleCode: 'YAYASAN_ANGGOTA',
      },
      'u-issuer',
      'YAYASAN_PENGAWAS'
    );

  const delegateRow = () =>
    withClient(targetUrl, async (db) => {
      const res = await db.query(
        `SELECT expires_at, is_active FROM user_role_assignments WHERE id = 'a-delegate'`
      );
      return res.rows[0];
    });

  it('restores the original expiry when the later extender lifts first', async () => {
    await resetState();
    const { suspension, previousUrl } = await loadService();
    try {
      const a = await suspend(suspension, 'u-target-a', 'SK/REST-1', HORIZON_A);
      const b = await suspend(suspension, 'u-target-b', 'SK/REST-2', HORIZON_B);

      // B lifts first — not the last dependent, so its restore payload must be
      // handed to A. Before the fix its (later) expiry overwrote A's snapshot.
      await suspension.liftBoardSuspension(b.id, 'u-issuer', 'Pemulihan status B.');
      await suspension.liftBoardSuspension(a.id, 'u-issuer', 'Pemulihan status A.');

      const row = await delegateRow();
      expect(new Date(row.expires_at).toISOString()).toBe(DELEGATE_EXPIRY);
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('restores the original expiry when the earlier extender lifts first', async () => {
    await resetState();
    const { suspension, previousUrl } = await loadService();
    try {
      const a = await suspend(suspension, 'u-target-a', 'SK/REST-3', HORIZON_A);
      const b = await suspend(suspension, 'u-target-b', 'SK/REST-4', HORIZON_B);

      // A lifts first and passes its (earliest) payload to B; B lifts last.
      await suspension.liftBoardSuspension(a.id, 'u-issuer', 'Pemulihan status A.');
      await suspension.liftBoardSuspension(b.id, 'u-issuer', 'Pemulihan status B.');

      const row = await delegateRow();
      expect(new Date(row.expires_at).toISOString()).toBe(DELEGATE_EXPIRY);
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('deletes a suspension-created delegation only when the minting suspension lifts last', async () => {
    await resetState();
    // Remove the pre-existing delegation so the first suspension mints one.
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM user_role_assignments WHERE id = 'a-delegate'`);
    });
    const { suspension, previousUrl } = await loadService();
    try {
      const a = await suspend(suspension, 'u-target-a', 'SK/REST-5', HORIZON_A);
      const b = await suspend(suspension, 'u-target-b', 'SK/REST-6', HORIZON_B);

      await suspension.liftBoardSuspension(b.id, 'u-issuer', 'Pemulihan status B.');
      await withClient(targetUrl, async (db) => {
        const rows = await db.query(
          `SELECT id FROM user_role_assignments WHERE user_id = 'u-delegate'`
        );
        expect(rows.rows, 'delegation survives while A still depends on it').toHaveLength(1);
      });

      await suspension.liftBoardSuspension(a.id, 'u-issuer', 'Pemulihan status A.');
      await withClient(targetUrl, async (db) => {
        const rows = await db.query(
          `SELECT id FROM user_role_assignments WHERE user_id = 'u-delegate'`
        );
        expect(rows.rows, 'the minted delegation is released by the last lifter').toHaveLength(0);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('keeps an originally-unbounded delegation unbounded after both lifts', async () => {
    await resetState();
    // A delegation with no expiry, reused and extended by both suspensions.
    await withClient(targetUrl, async (db) => {
      await db.query(`UPDATE user_role_assignments SET expires_at = NULL WHERE id = 'a-delegate'`);
    });
    const { suspension, previousUrl } = await loadService();
    try {
      const a = await suspend(suspension, 'u-target-a', 'SK/REST-7', HORIZON_A);
      const b = await suspend(suspension, 'u-target-b', 'SK/REST-8', HORIZON_B);

      await suspension.liftBoardSuspension(a.id, 'u-issuer', 'Pemulihan status A.');
      await suspension.liftBoardSuspension(b.id, 'u-issuer', 'Pemulihan status B.');

      const row = await delegateRow();
      expect(row.expires_at, 'an originally unbounded delegation stays unbounded').toBeNull();
      expect(row.is_active).toBe(true);
    } finally {
      await unloadService(previousUrl);
    }
  });
});
