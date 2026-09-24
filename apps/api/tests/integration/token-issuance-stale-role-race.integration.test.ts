/**
 * Session issuance vs. a concurrent role revocation — real PostgreSQL race.
 *
 * Reviewer finding 1 (CWE-863). Login and refresh both read the caller's role
 * assignment before opening their transaction. A revocation of that assignment
 * committing in between used to be invisible to the issuance path, which then
 * minted an access + refresh pair stamped with a role the user no longer held —
 * a session that outlives the privilege it was built on.
 *
 * The fix re-derives the effective assignment under the shared row lock
 * (`utils/role-assignment-lock.ts`) inside the same transaction that writes the
 * refresh token, and refuses (403) an account left with no qualifying
 * assignment. This suite drives the real `AuthService.login` and
 * `AuthService.refreshToken` on a real database while an independent connection
 * holds the assignment row, then commits the revocation. The issuance must lose
 * and leave no token stamped with the revoked role.
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
    eval: vi.fn().mockResolvedValue(0),
  },
}));

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

// bcrypt hash of "Password123!".
const PASSWORD_HASH = '$2b$10$DiF7tk0FeH3XfovpHZeo5uJVMwufjDKw5WAHxEhcDfpSqIntOLlC2';

const SEED = `
INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-ketua', 'YAYASAN_KETUA', 'Ketua Yayasan', 'YAYASAN', '[]'::jsonb, now()),
  ('role-guru', 'SDIT_GURU', 'Guru', 'SD_IT', '[]'::jsonb, now()),
  ('role-admin', 'SDIT_ADMIN', 'Admin Unit', 'SD_IT', '[]'::jsonb, now());

INSERT INTO users (id, name, email, password_hash, is_active, updated_at) VALUES
  ('u-stale', 'Ketua Stale', 'stale@example.com', '${PASSWORD_HASH}', true, now()),
  ('u-escalate', 'Guru Eskalasi', 'escalate@example.com', '${PASSWORD_HASH}', true, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-stale', 'u-stale', 'role-ketua', true, true, now()),
  ('a-guru', 'u-escalate', 'role-guru', true, true, now()),
  ('a-admin', 'u-escalate', 'role-admin', false, true, now());
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

describeDb('token issuance vs role revocation (real PostgreSQL)', () => {
  const dbName = `cipansor_stale_role_race_${Date.now()}`;
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

  const unloadService = async (previousUrl: string | undefined) => {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  };

  const resetUser = async () => {
    await withClient(targetUrl, async (db) => {
      await db.query(
        `UPDATE users SET is_active = true, deleted_at = NULL WHERE id IN ('u-stale', 'u-escalate')`
      );
      await db.query(`UPDATE users SET is_two_factor_enabled = false WHERE id = 'u-escalate'`);
      await db.query(`UPDATE user_role_assignments SET is_active = true WHERE id = 'a-stale'`);
      await db.query(
        `UPDATE user_role_assignments SET is_primary = (id = 'a-guru'), is_active = true
         WHERE user_id = 'u-escalate'`
      );
      await db.query(
        `DELETE FROM board_member_suspensions WHERE user_id IN ('u-stale', 'u-escalate')`
      );
      await db.query(`DELETE FROM refresh_tokens WHERE user_id IN ('u-stale', 'u-escalate')`);
    });
  };

  it('login mints no session when the assignment is revoked under the lock', async () => {
    await resetUser();
    const { service, previousUrl } = await loadAuthService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      // Hold the assignment row, then revoke it while login is blocked on the
      // same row. Login already read the (active) assignment in its pre-flight,
      // so only the locked re-read can see the revocation.
      await blocker.query('BEGIN');
      await blocker.query(
        `UPDATE user_role_assignments SET is_active = false WHERE id = 'a-stale'`
      );

      const pending = service.login({ email: 'stale@example.com', password: 'Password123!' });
      await new Promise((resolve) => setTimeout(resolve, 400));

      await blocker.query('COMMIT');

      await expect(pending).rejects.toMatchObject({ statusCode: 403 });

      await withClient(targetUrl, async (db) => {
        const tokens = await db.query(
          `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-stale'`
        );
        expect(
          tokens.rows[0].n,
          'a login whose role was revoked under the lock must not leave a token'
        ).toBe(0);
      });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }
  });

  it('refresh mints no session when the assignment is revoked under the lock', async () => {
    await resetUser();
    const { service, previousUrl } = await loadAuthService();
    const jwt = await import('../../src/lib/jwt');
    const { refreshToken } = jwt.generateTokenPair({
      id: 'u-stale',
      sub: 'u-stale',
      email: 'stale@example.com',
      roleId: 'role-ketua',
      roleCode: 'YAYASAN_KETUA',
      unitId: null,
      permissions: [],
      role: 'SUPER_ADMIN',
    });
    await withClient(targetUrl, async (db) => {
      await db.query(
        `INSERT INTO refresh_tokens (id, token, user_id, expires_at, created_at)
         VALUES ('rt-stale', $1, 'u-stale', now() + interval '30 days', now())`,
        [refreshToken]
      );
    });

    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        `UPDATE user_role_assignments SET is_active = false WHERE id = 'a-stale'`
      );

      const pending = service.refreshToken(refreshToken);
      await new Promise((resolve) => setTimeout(resolve, 400));

      await blocker.query('COMMIT');

      await expect(pending).rejects.toMatchObject({ statusCode: 403 });

      await withClient(targetUrl, async (db) => {
        // The refusal rolls the transaction back, so the *presented* row
        // survives (it was never spent); what must not exist is a replacement
        // minted from the revoked role.
        const tokens = await db.query(
          `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-stale' AND id <> 'rt-stale'`
        );
        expect(
          tokens.rows[0].n,
          'a refresh whose role was revoked under the lock must not mint a replacement'
        ).toBe(0);
      });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }
  });

  it('login refuses and mints nothing when an admin assignment wins the primary race', async () => {
    // Reviewer finding 1 (CWE-287). The password step is answered against the
    // snapshot's ordinary SDIT_GURU role, so no second factor is demanded. A
    // concurrent grant then makes the SDIT_ADMIN assignment primary and commits
    // before login's locked re-read. Without a re-check the login would mint an
    // admin session with no second factor at all � so it must refuse (409) and
    // leave no refresh token behind.
    await resetUser();
    const { service, previousUrl } = await loadAuthService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        `UPDATE user_role_assignments SET is_primary = (id = 'a-admin') WHERE user_id = 'u-escalate'`
      );

      const pending = service.login({ email: 'escalate@example.com', password: 'Password123!' });
      // Let login reach the assignment lock and block there.
      await new Promise((resolve) => setTimeout(resolve, 400));

      await blocker.query('COMMIT');

      await expect(pending).rejects.toMatchObject({ statusCode: 409 });

      await withClient(targetUrl, async (db) => {
        const tokens = await db.query(
          `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-escalate'`
        );
        expect(
          tokens.rows[0].n,
          'a login that escalated to an admin role under the lock must not mint a session'
        ).toBe(0);
      });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }
  });
});
