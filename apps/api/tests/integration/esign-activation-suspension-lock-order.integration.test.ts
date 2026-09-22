/**
 * E-Sign activation ↔ board suspension — real PostgreSQL lock ordering.
 *
 * `activateKey` creates a key that did not exist, so it cannot take a lock on a
 * key row first: it locks the *user* row (via `assertUserNotSuspendedTx`) and
 * only then touches the signing-key rows. `BoardSuspensionService` writes both
 * the user row and, for an account that already holds a key, the signing-key
 * row — so it must take them in the same order. When it took the key row first,
 * an activation and a suspension interleaving on the same account produced a
 * genuine deadlock (PostgreSQL `40P01`): the suspension held the key and wanted
 * the user, the activation held the user and wanted the key, and the database
 * had to kill one transaction.
 *
 * The existing `esign-suspension-race` suite covers the *activation* side of the
 * race, but its deadlock case holds the user row only, so it exercises a
 * suspension that never reaches for a key row — the ordering bug is invisible
 * to it. This suite drives the real `BoardSuspensionService` while a second
 * connection replicates `activateKey`'s exact order (user row, then key row),
 * which is the interleaving the old order deadlocked on.
 *
 * Opt-in via RUN_DB_TESTS=1. Redis is stubbed: it is not the subject and no
 * Redis server is required for a PostgreSQL locking test.
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
  ('role-pengawas', 'YAYASAN_PENGAWAS', 'Pengawas Yayasan', 'YAYASAN', '[]'::jsonb, now()),
  ('role-ketua', 'YAYASAN_KETUA', 'Ketua Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-issuer', 'Pengawas', 'pengawas@example.com', true, now()),
  ('u-susp',   'Ketua',    'ketua@example.com',    true, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-susp', 'u-susp', 'role-ketua', true, true, now());

-- The account already holds a signing key, so the suspension's soft-lock has a
-- key row to touch — the row the old ordering locked before the user.
INSERT INTO user_signing_keys
  (id, user_id, algorithm, public_key, encrypted_private_key, kdf_salt, kdf_params, iv, auth_tag,
   failed_attempts, approved_at, expires_at, updated_at)
VALUES
  ('key-susp', 'u-susp', 'Ed25519', 'pub', 'enc', 'salt', '{}'::jsonb, 'iv', 'tag',
   0, now(), now() + interval '365 days', now());
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeDb('esign activation / suspension lock order (real PostgreSQL)', () => {
  const dbName = `cipansor_esign_order_${Date.now()}`;
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
      await db.query(`DELETE FROM board_suspension_plh_assignments`);
      await db.query(`DELETE FROM board_member_suspensions`);
      await db.query(`DELETE FROM user_role_assignments WHERE user_id = 'u-delegate-susp'`);
      await db.query(
        `UPDATE users SET is_active = true, deleted_at = NULL, account_state_writer = NULL WHERE id = 'u-susp'`
      );
      await db.query(`UPDATE user_signing_keys SET locked_until = NULL WHERE id = 'key-susp'`);
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

  beforeEach(() => {
    vi.resetModules();
  });

  /** Import the service so its `prisma` singleton binds this throwaway DB. */
  async function loadService() {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl;
    vi.resetModules();
    try {
      const mod = await import('../../src/modules/pengawasan/board-suspension.service');
      return { service: new mod.BoardSuspensionService(), previousUrl };
    } catch (error) {
      process.env.DATABASE_URL = previousUrl;
      throw error;
    }
  }

  async function unloadService(previousUrl: string | undefined) {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  }

  it('suspension and activation interleave on the same account without deadlock', async () => {
    await resetState();
    const { service, previousUrl } = await loadService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      // Replicate `activateKey`'s order exactly: lock the user row, then the
      // key row. The suspension runs for real, on its own pooled connection.
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM "users" WHERE id = 'u-susp' FOR UPDATE`);

      // With the user row locked first the suspension must block on it while
      // holding nothing; the old key-first order reached for the key row first
      // and then blocked on the user row.
      const pending = service.suspendBoardMember(
        {
          userId: 'u-susp',
          skNumber: 'SK/LOCK/1',
          auditReason: 'Pembekuan uji urutan lock aktivasi.',
        },
        'u-issuer',
        'YAYASAN_PENGAWAS'
      );
      await sleep(500);

      // Take the key row in the same order activation uses. Under the old
      // order the suspension already held this row and the two transactions
      // deadlock here.
      await blocker.query(`SELECT id FROM "user_signing_keys" WHERE id = 'key-susp' FOR UPDATE`);
      await blocker.query('COMMIT');

      const suspension = await pending;
      expect(suspension, 'the suspension must commit, not be deadlock-killed').toBeTruthy();

      await withClient(targetUrl, async (db) => {
        const user = await db.query(`SELECT is_active FROM "users" WHERE id = 'u-susp'`);
        expect(user.rows[0].is_active, 'the suspension must have switched the account off').toBe(
          false
        );
        const key = await db.query(
          `SELECT locked_until FROM "user_signing_keys" WHERE id = 'key-susp'`
        );
        expect(
          key.rows[0].locked_until?.toISOString(),
          'the key must carry the suspension sentinel'
        ).toBe('2099-01-01T00:00:00.000Z');
      });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }
  });
});
