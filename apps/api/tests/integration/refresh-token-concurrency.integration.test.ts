/**
 * Concurrent refresh rotation — real PostgreSQL, real row locks.
 *
 * Review item 7. Two parallel requests presenting the *same* refresh token both
 * pass the "does this row exist" read. The first consumes the row with a
 * conditional `deleteMany` and mints a replacement; the second then affects zero
 * rows. With the old plain `delete` that was Prisma `P2025`, which the error
 * handler mapped to 500 — a perfectly ordinary double-submit (two tabs, a retry
 * racing the original) surfaced as an internal error instead of the 401 that
 * means "this token is already spent".
 *
 * A mocked Prisma cannot prove the interleaving. This suite applies the real
 * migrations and drives the real `AuthService.refreshToken` over two independent
 * connections, asserting exactly one rotation succeeds and the loser is a plain
 * 401 with no replacement minted. Rotation and replay protection must survive:
 * the spent token cannot be redeemed again.
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

const SEED = `
INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-ketua', 'YAYASAN_KETUA', 'Ketua Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-refresh', 'Ketua Refresh', 'refresh@example.com', true, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-refresh', 'u-refresh', 'role-ketua', true, true, now());
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

describeDb('concurrent refresh rotation (real PostgreSQL)', () => {
  const dbName = `cipansor_refresh_race_${Date.now()}`;
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
      const authMod = await import('../../src/modules/auth/auth.service');
      const jwtMod = await import('../../src/lib/jwt');
      return { service: new authMod.AuthService(), jwt: jwtMod, previousUrl };
    } catch (error) {
      process.env.DATABASE_URL = previousUrl;
      throw error;
    }
  };

  const unloadService = async (previousUrl: string | undefined) => {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  };

  const seedToken = async (jwt: typeof import('../../src/lib/jwt'), token: string) => {
    const payload = jwt.verifyToken(token);
    await withClient(targetUrl, async (db) => {
      await db.query(`UPDATE users SET is_active = true, deleted_at = NULL WHERE id = 'u-refresh'`);
      await db.query(`DELETE FROM board_member_suspensions WHERE user_id = 'u-refresh'`);
      await db.query(`DELETE FROM refresh_tokens WHERE user_id = 'u-refresh'`);
      await db.query(
        `INSERT INTO refresh_tokens (id, token, user_id, expires_at, created_at)
         VALUES ('rt-refresh', $1, $2, now() + interval '30 days', now())`,
        [token, payload.sub]
      );
    });
  };

  it('two parallel refreshes: exactly one rotates, the loser is a REFRESH_RACE, not a logout', async () => {
    const { service, jwt, previousUrl } = await loadService();
    try {
      const { refreshToken } = jwt.generateTokenPair({
        id: 'u-refresh',
        sub: 'u-refresh',
        email: 'refresh@example.com',
        roleId: 'role-ketua',
        roleCode: 'YAYASAN_KETUA',
        unitId: null,
        permissions: [],
        role: 'SUPER_ADMIN',
      });
      await seedToken(jwt, refreshToken);

      const results = await Promise.allSettled([
        service.refreshToken(refreshToken),
        service.refreshToken(refreshToken),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      expect(fulfilled, 'exactly one of two parallel refreshes may rotate').toHaveLength(1);

      // The loser must be a *409 REFRESH_RACE*, never a 500 and never a plain
      // 401. The 401 is what the web treats as "session dead" and logs out; a
      // 409 REFRESH_RACE is what it treats as "retry with the cookie the winner
      // just set". The finding is that the loser used to be indistinguishable
      // from an invalid credential, so its `clearedSessionCookies()` Set-Cookie
      // could land after the winner's fresh cookies and destroy a valid session.
      for (const r of rejected) {
        const reason = r.reason as { statusCode?: number; status?: number; code?: string };
        expect(reason?.code, 'the loser of a benign concurrent refresh must be REFRESH_RACE').toBe(
          'REFRESH_RACE'
        );
        expect(reason?.statusCode ?? reason?.status).toBe(409);
      }
    } finally {
      await unloadService(previousUrl);
    }

    // Replay protection: the spent token can never be redeemed again, and only
    // the single winner's replacement is a live row. The consumed original is
    // retained as a tombstone (`rotated_at`), which is what lets a sibling tab
    // that reaches its lookup post-commit still be told `REFRESH_RACE`.
    await withClient(targetUrl, async (db) => {
      const liveRows = await db.query(
        `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-refresh' AND rotated_at IS NULL`
      );
      expect(liveRows.rows[0].n, 'the rotation mints exactly one live replacement').toBe(1);
    });
  });

  it('reusing a consumed refresh token is a REFRESH_RACE within the window and mints no second replacement', async () => {
    const { service, jwt, previousUrl } = await loadService();
    try {
      const { refreshToken } = jwt.generateTokenPair({
        id: 'u-refresh',
        sub: 'u-refresh',
        email: 'refresh@example.com',
        roleId: 'role-ketua',
        roleCode: 'YAYASAN_KETUA',
        unitId: null,
        permissions: [],
        role: 'SUPER_ADMIN',
      });
      await seedToken(jwt, refreshToken);

      await service.refreshToken(refreshToken);

      // A consumed row is retained for a short window as a tombstone
      // (`rotated_at`), because a sibling tab can reach its lookup only after
      // the winner already committed — and deleting the row outright made that
      // sibling indistinguishable from an invalid credential, so the web logged
      // out a perfectly valid session. Re-presenting the token inside the window
      // is therefore `REFRESH_RACE` (409, no cookie deletion) rather than a 401.
      // Replay protection is unchanged: this token buys nothing and exactly one
      // replacement exists. Past the window the same token is an ordinary 401.
      await expect(service.refreshToken(refreshToken)).rejects.toMatchObject({
        statusCode: 409,
        code: 'REFRESH_RACE',
      });
    } finally {
      await unloadService(previousUrl);
    }

    await withClient(targetUrl, async (db) => {
      const rows = await db.query(
        `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-refresh'`
      );
      // Exactly one live replacement; the consumed row is a tombstone, not a
      // second session.
      const live = await db.query(
        `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-refresh' AND rotated_at IS NULL`
      );
      expect(rows.rows[0].n).toBe(2);
      expect(live.rows[0].n).toBe(1);
    });
  });
});
