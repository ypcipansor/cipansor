/**
 * Session token issuance vs. a board suspension — real PostgreSQL race.
 *
 * Review items 14 and 15. Every path that mints a refresh token (normal login,
 * 2FA completion, refresh rotation, role switching) must re-assert the account
 * state in the *same transaction* that inserts the token, under the user-row
 * lock the suspension also takes. Otherwise the suspension's own token purge —
 * `DELETE FROM refresh_tokens WHERE user_id = …` — can miss a token inserted
 * after it, and that token authenticates away the very suspension it was meant
 * to enforce.
 *
 * A mocked Prisma cannot prove any of this: a mock `$queryRaw` returns whatever
 * the test tells it, and two interleaved "transactions" share one object. This
 * suite drives the real `AuthService.login` and `RolesService.switchRoleAndIssueSession`
 * against a real PostgreSQL, holding the user row on an independent connection
 * to force the suspension to win the lock, then asserting no refresh token is
 * written.
 *
 * Opt-in via RUN_DB_TESTS=1, like the other DB suites.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');

// Redis is not the subject here; the suspension cache is stubbed to a miss so
// every state decision is made against the database.
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

// bcrypt hash of "Password123!" — minted once so the login path can verify a
// real credential without paying for a fresh hash in every seed.
const PASSWORD_HASH = '$2b$10$DiF7tk0FeH3XfovpHZeo5uJVMwufjDKw5WAHxEhcDfpSqIntOLlC2';

const SEED = `
INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-ketua', 'YAYASAN_KETUA', 'Ketua Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, password_hash, is_active, updated_at) VALUES
  ('u-login',   'Ketua Login',   'login@example.com',   '${PASSWORD_HASH}', true, now()),
  ('u-switch',  'Ketua Switch',  'switch@example.com',  '${PASSWORD_HASH}', true, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-login',  'u-login',  'role-ketua', true,  true, now()),
  ('a-switch', 'u-switch', 'role-ketua', false, true, now());
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

describeDb('token issuance vs board suspension (real PostgreSQL)', () => {
  const dbName = `cipansor_token_race_${Date.now()}`;
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

  const loadAuthService = async () => {
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

  const loadRolesService = async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl;
    vi.resetModules();
    try {
      const mod = await import('../../src/modules/roles/roles.service');
      return { service: new mod.RolesService(), previousUrl };
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
      await db.query(`UPDATE users SET is_active = true, deleted_at = NULL WHERE id = $1`, [
        userId,
      ]);
      await db.query(`DELETE FROM board_member_suspensions WHERE user_id = $1`, [userId]);
      await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
    });
  };

  it('login does not mint a refresh token for an account suspended under the lock', async () => {
    // Finding 15. The login transaction locks the user row, then re-reads the
    // account state and any ACTIVE suspension before inserting the refresh
    // token. A suspension that wins the lock first must make that insert fail —
    // otherwise the token created *after* the suspension's purge survives it.
    await resetUser('u-login');

    const { service, previousUrl } = await loadAuthService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      // Hold the user row, then — while the login is blocked on it — commit a
      // suspension and the token purge *on the blocker itself*. The blocker
      // already owns the row lock, so the FK-checked suspension insert can run
      // inside its transaction; a separate connection's insert would block on
      // the same lock via the foreign key and never commit.
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM users WHERE id = 'u-login' FOR UPDATE`);

      const pending = service.login({ email: 'login@example.com', password: 'Password123!' });
      await new Promise((resolve) => setTimeout(resolve, 400));

      // The suspension wins: it deactivates the account, records an ACTIVE
      // suspension and purges the tokens it can see, then releases the lock.
      // The blocked login re-reads the committed state.
      await blocker.query(`UPDATE users SET is_active = false WHERE id = 'u-login'`);
      await blocker.query(`DELETE FROM refresh_tokens WHERE user_id = 'u-login'`);
      await blocker.query(
        `INSERT INTO board_member_suspensions
           (id, user_id, sk_number, audit_reason, status, suspended_by_id, created_at, updated_at)
         VALUES
           ('s-login', 'u-login', 'SK/LOGIN-RACE', 'Temuan audit untuk pengujian race.',
            'ACTIVE', 'u-login', now(), now())`
      );
      await blocker.query('COMMIT');

      await expect(pending).rejects.toMatchObject({ statusCode: 401 });

      await withClient(targetUrl, async (db) => {
        const tokens = await db.query(
          `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-login'`
        );
        expect(
          tokens.rows[0].n,
          'a login that lost the race must not leave a refresh token behind'
        ).toBe(0);
      });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }
  });

  it('role switch does not mint a refresh token for an account suspended under the lock', async () => {
    // Finding 14. `switchRoleAndIssueSession` takes the user row first, then
    // re-asserts the account state and the active suspension before minting the
    // pair and storing the refresh token in the same commit.
    await resetUser('u-switch');

    const { service, previousUrl } = await loadRolesService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM users WHERE id = 'u-switch' FOR UPDATE`);

      const pending = service.switchRoleAndIssueSession('u-switch', 'a-switch');
      await new Promise((resolve) => setTimeout(resolve, 400));

      await blocker.query(`UPDATE users SET is_active = false WHERE id = 'u-switch'`);
      await blocker.query(`DELETE FROM refresh_tokens WHERE user_id = 'u-switch'`);
      await blocker.query(
        `INSERT INTO board_member_suspensions
           (id, user_id, sk_number, audit_reason, status, suspended_by_id, created_at, updated_at)
         VALUES
           ('s-switch', 'u-switch', 'SK/SWITCH-RACE', 'Temuan audit untuk pengujian race.',
            'ACTIVE', 'u-switch', now(), now())`
      );
      await blocker.query('COMMIT');

      await expect(pending).rejects.toMatchObject({ statusCode: 401 });

      await withClient(targetUrl, async (db) => {
        const tokens = await db.query(
          `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-switch'`
        );
        expect(
          tokens.rows[0].n,
          'a role switch that lost the race must not leave a refresh token behind'
        ).toBe(0);
      });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }
  });
});
