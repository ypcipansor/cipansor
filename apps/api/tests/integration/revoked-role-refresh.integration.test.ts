/**
 * Revoked last role vs. refresh — real PostgreSQL regression.
 *
 * Reviewer follow-up on the CWE-863 finding. `removeRoleAssignment` deleted the
 * assignment row but left the deprecated `users.role` column untouched, and
 * `refreshToken` fell back to that column whenever no *active* assignment
 * remained. A revoked Super Admin therefore kept renewing sessions for as long
 * as it presented a refresh token: the revocation never became durable.
 *
 * This suite drives the real `RolesService.removeRoleAssignment` and
 * `AuthService.refreshToken` on a real database and asserts the revocation is
 * final:
 *   - after the last assignment is revoked, refresh is refused (403) and mints
 *     no replacement token;
 *   - an account whose only assignment expired is refused too;
 *   - a genuine legacy account (no assignment rows at all) still refreshes, so
 *     the fallback keeps working for the case it exists for.
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

const SEED = `
INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-super', 'SUPER_ADMIN', 'Super Admin', 'GLOBAL', '[]'::jsonb, now());

INSERT INTO users (id, name, email, role, is_active, updated_at) VALUES
  ('u-revoked', 'Revoked Super',  'revoked@example.com', 'SUPER_ADMIN', true, now()),
  ('u-expired', 'Expired Super',  'expired@example.com', 'SUPER_ADMIN', true, now()),
  ('u-legacy',  'Legacy Super',   'legacy@example.com',  'SUPER_ADMIN', true, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, expires_at, updated_at) VALUES
  ('a-revoked', 'u-revoked', 'role-super', true, true, NULL, now()),
  ('a-expired', 'u-expired', 'role-super', true, true, now() - interval '1 day', now());
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

describeDb('revoked role vs refresh (real PostgreSQL)', () => {
  const dbName = `cipansor_revoked_refresh_${Date.now()}`;
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

  const load = async <T>(path: string, ctor: string): Promise<{ instance: T; prev?: string }> => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl;
    vi.resetModules();
    const mod: any = await import(path);
    return { instance: new mod[ctor](), prev: previousUrl };
  };

  const unload = async (prev?: string) => {
    process.env.DATABASE_URL = prev;
    vi.resetModules();
  };

  const issueRefresh = async (userId: string, email: string, id: string) => {
    const jwt = await import('../../src/lib/jwt');
    const { refreshToken } = jwt.generateTokenPair({
      id: userId,
      sub: userId,
      email,
      roleId: 'role-super',
      roleCode: 'SUPER_ADMIN',
      unitId: null,
      permissions: [],
      role: 'SUPER_ADMIN',
    });
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
      await db.query(
        `INSERT INTO refresh_tokens (id, token, user_id, expires_at, created_at)
         VALUES ($1, $2, $3, now() + interval '30 days', now())`,
        [id, refreshToken, userId]
      );
    });
    return refreshToken;
  };

  it('a revoked last assignment makes refresh fail closed and mint nothing', async () => {
    const refresh = await issueRefresh('u-revoked', 'revoked@example.com', 'rt-revoked');

    const roles = await load<any>('../../src/modules/roles/roles.service', 'RolesService');
    try {
      await roles.instance.removeRoleAssignment(
        { sub: 'u-admin', roleCode: 'SUPER_ADMIN', unitId: null },
        'a-revoked'
      );
    } finally {
      await unload(roles.prev);
    }

    // The revocation swept the deprecated column, and the assignment is gone.
    await withClient(targetUrl, async (db) => {
      const u = await db.query(`SELECT role FROM users WHERE id = 'u-revoked'`);
      expect(u.rows[0].role).toBeNull();
      const n = await db.query(
        `SELECT count(*)::int AS n FROM user_role_assignments WHERE user_id = 'u-revoked'`
      );
      expect(n.rows[0].n).toBe(0);
    });

    const auth = await load<any>('../../src/modules/auth/auth.service', 'AuthService');
    try {
      await expect(auth.instance.refreshToken(refresh)).rejects.toThrow(
        'No active role assignment found'
      );
      await withClient(targetUrl, async (db) => {
        const minted = await db.query(
          `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-revoked' AND id <> 'rt-revoked'`
        );
        expect(
          minted.rows[0].n,
          'a refresh for a revoked account must not mint a replacement'
        ).toBe(0);
      });
    } finally {
      await unload(auth.prev);
    }
  });

  it('an expired assignment makes refresh fail closed despite a live legacy role', async () => {
    const refresh = await issueRefresh('u-expired', 'expired@example.com', 'rt-expired');

    const auth = await load<any>('../../src/modules/auth/auth.service', 'AuthService');
    try {
      await expect(auth.instance.refreshToken(refresh)).rejects.toThrow(
        'No active role assignment found'
      );
      await withClient(targetUrl, async (db) => {
        const minted = await db.query(
          `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-expired' AND id <> 'rt-expired'`
        );
        expect(minted.rows[0].n).toBe(0);
      });
    } finally {
      await unload(auth.prev);
    }
  });

  it('a genuine legacy account with no assignment rows still refreshes', async () => {
    const refresh = await issueRefresh('u-legacy', 'legacy@example.com', 'rt-legacy');

    const auth = await load<any>('../../src/modules/auth/auth.service', 'AuthService');
    try {
      const result = await auth.instance.refreshToken(refresh);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      await withClient(targetUrl, async (db) => {
        const minted = await db.query(
          `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-legacy' AND id <> 'rt-legacy'`
        );
        expect(
          minted.rows[0].n,
          'an unmigrated legacy account must still be able to renew its session'
        ).toBe(1);
      });
    } finally {
      await unload(auth.prev);
    }
  });
});
