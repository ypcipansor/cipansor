/**
 * 2FA recovery codes — real PostgreSQL, real row locks.
 *
 * `verifyTwoFactorLogin` must validate *and* consume a recovery code inside the
 * same transaction that takes the `FOR UPDATE` lock on the user row and mints
 * the tokens. The previous code removed the code with a raw `UPDATE` outside
 * that transaction, which produced two failures this suite reproduces on a real
 * PostgreSQL:
 *
 *  1. **A refused login destroyed the code.** A board suspension (or an admin
 *     deactivation) committing between the delete and the token issuance made
 *     the login fail *after* the code was already gone, permanently locking the
 *     operator out of an account they never actually entered.
 *  2. **Parallel redemption.** The delete had no row lock, so two connections
 *     could each evaluate `token = ANY(recovery_codes)` as true and both mint a
 *     session. The lock taken before the compare-and-remove serialises them:
 *     the second blocks, re-reads, and finds nothing.
 *
 * A mock cannot prove either — a mock `$executeRaw` returns what the test tells
 * it to, from two "transactions" that share one object. This suite applies the
 * real migrations and drives the real service over two independent connections.
 *
 * Opt-in via RUN_DB_TESTS=1, like the other DB suites.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');

// Redis is not the subject here; the suspension cache is stubbed to a miss.
vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    setex: vi.fn().mockResolvedValue('OK'),
    eval: vi.fn().mockResolvedValue(0),
  },
}));

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const RECOVERY_CODE = 'ABCDEF1234';

const SEED = `
INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-ketua', 'YAYASAN_KETUA', 'Ketua Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO users
  (id, name, email, is_active, is_two_factor_enabled, two_factor_secret,
   two_factor_recovery_codes, updated_at)
VALUES
  ('u-2fa', 'Ketua 2FA', 'ketua2fa@example.com', true, true, 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
   ARRAY['${RECOVERY_CODE}']::text[], now()),
  ('u-suspended', 'Ketua Suspended', 'sus@example.com', true, true, 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
   ARRAY['${RECOVERY_CODE}']::text[], now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-2fa', 'u-2fa', 'role-ketua', true, true, now()),
  ('a-suspended', 'u-suspended', 'role-ketua', true, true, now());
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

describeDb('2FA recovery code consumption (real PostgreSQL)', () => {
  const dbName = `cipansor_2fa_recovery_${Date.now()}`;
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
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
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
      const mod = await import('../../src/modules/auth/auth.service');
      return { service: new mod.AuthService(), previousUrl };
    } catch (error) {
      process.env.DATABASE_URL = previousUrl;
      throw error;
    }
  };

  const unloadService = async (previousUrl: string | undefined) => {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  };

  const resetUser = async (userId: string) => {
    await withClient(targetUrl, async (db) => {
      await db.query(
        `UPDATE users
           SET two_factor_recovery_codes = ARRAY[$1]::text[],
               is_active = true,
               deleted_at = NULL
         WHERE id = $2`,
        [RECOVERY_CODE, userId]
      );
      await db.query(`DELETE FROM board_member_suspensions WHERE user_id = $1`, [userId]);
      await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
    });
  };

  it('does not consume the recovery code when an ACTIVE suspension refuses the login', async () => {
    await resetUser('u-suspended');
    // Suspend out of band, after the pre-flight read but before token issuance
    // simulates the same window: an ACTIVE row is enough for the locked re-read
    // to refuse.
    await withClient(targetUrl, async (db) => {
      await db.query(
        `INSERT INTO board_member_suspensions
           (id, user_id, sk_number, audit_reason, status, suspended_by_id, start_date, updated_at)
         VALUES
           ('susp-2fa', 'u-suspended', 'SK/2FA', 'Temuan audit untuk pengujian.', 'ACTIVE',
            'u-2fa', now(), now())`
      );
    });

    const { service, previousUrl } = await loadService();
    try {
      await expect(
        service.verifyTwoFactorLogin('u-suspended', RECOVERY_CODE, true)
      ).rejects.toMatchObject({ statusCode: 401 });
    } finally {
      await unloadService(previousUrl);
    }

    await withClient(targetUrl, async (db) => {
      const row = await db.query(
        `SELECT two_factor_recovery_codes AS codes FROM users WHERE id = 'u-suspended'`
      );
      expect(row.rows[0].codes, 'a refused login must leave the recovery code intact').toContain(
        RECOVERY_CODE
      );
      const tokens = await db.query(
        `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-suspended'`
      );
      expect(tokens.rows[0].n).toBe(0);
    });
  });

  it('consumes the code exactly once under two parallel redemptions', async () => {
    await resetUser('u-2fa');

    const { service, previousUrl } = await loadService();
    try {
      const results = await Promise.allSettled([
        service.verifyTwoFactorLogin('u-2fa', RECOVERY_CODE, true),
        service.verifyTwoFactorLogin('u-2fa', RECOVERY_CODE, true),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled, 'exactly one of two parallel redemptions may succeed').toHaveLength(1);
    } finally {
      await unloadService(previousUrl);
    }

    await withClient(targetUrl, async (db) => {
      const row = await db.query(
        `SELECT two_factor_recovery_codes AS codes FROM users WHERE id = 'u-2fa'`
      );
      expect(row.rows[0].codes).not.toContain(RECOVERY_CODE);
      const tokens = await db.query(
        `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-2fa'`
      );
      expect(tokens.rows[0].n).toBe(1);
    });
  });
});
