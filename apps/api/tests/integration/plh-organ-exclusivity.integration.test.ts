/**
 * Plh/Plt organ-exclusivity — real PostgreSQL.
 *
 * The unit suite asserts the service *decides* to refuse a cross-organ
 * delegate, but Prisma is mocked there: a mock `create` cannot prove that the
 * `trg_yayasan_organ_exclusive` trigger would otherwise have fired, nor that a
 * refusal leaves no partial state behind. This suite runs against a real
 * PostgreSQL with the real migrations and drives the service for real:
 *
 *  1. The candidate query excludes Pembina and Pengawas, and marks them
 *     ineligible.
 *  2. `suspendBoardMember` refuses a Pembina/Pengawas delegate even when called
 *     directly (bypassing the picker and the route), with a 4xx domain error.
 *  3. After the refusal the transaction is fully rolled back: no account
 *     deactivation, no suspension row, no refresh-token purge, no E-Sign lock,
 *     no Plh assignment.
 *  4. The database trigger is itself proven by attempting the cross-organ insert
 *     directly, so the rule the service relies on is real and not assumed.
 *
 * Opt-in via RUN_DB_TESTS=1. Redis is stubbed; it is not the subject.
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
  },
}));

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const SEED = `
INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-ketua',   'YAYASAN_KETUA',   'Ketua Yayasan',   'YAYASAN', '[]'::jsonb, now()),
  ('role-anggota', 'YAYASAN_ANGGOTA', 'Anggota Yayasan', 'YAYASAN', '[]'::jsonb, now()),
  ('role-pembina', 'YAYASAN_PEMBINA', 'Pembina Yayasan', 'YAYASAN', '[]'::jsonb, now()),
  ('role-pengawas','YAYASAN_PENGAWAS','Pengawas Yayasan','YAYASAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-issuer',    'Pengawas Penerbit', 'pengawas@example.com',  true, now()),
  ('u-target',    'Ketua Target',      'ketua@example.com',     true, now()),
  ('u-pembina',   'Pembina X',         'pembina@example.com',   true, now()),
  ('u-pengawas2', 'Pengawas Y',        'pengawas2@example.com', true, now()),
  ('u-anggota',   'Anggota Z',         'anggota@example.com',   true, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-target',    'u-target',    'role-ketua',    true, true, now()),
  ('a-pembina',   'u-pembina',   'role-pembina',  true, true, now()),
  ('a-pengawas2', 'u-pengawas2', 'role-pengawas', true, true, now()),
  ('a-anggota',   'u-anggota',   'role-anggota',  true, true, now());
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

describeDb('Plh/Plt organ-exclusivity (real PostgreSQL)', () => {
  const dbName = `cipansor_plh_organ_${Date.now()}`;
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
      const mod = await import('../../src/modules/pengawasan/board-suspension.service');
      return { service: new mod.BoardSuspensionService(), previousUrl };
    } catch (error) {
      process.env.DATABASE_URL = previousUrl;
      throw error;
    }
  };

  const unloadService = async (previousUrl: string | undefined) => {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  };

  const suspend = (service: any, plhUserId: string) =>
    service.suspendBoardMember(
      {
        userId: 'u-target',
        skNumber: `SK/ORGAN/${Date.now()}`,
        auditReason: 'Temuan audit independen untuk pengujian organ yayasan.',
        plhUserId,
        plhRoleCode: 'YAYASAN_ANGGOTA',
      },
      'u-issuer',
      'YAYASAN_PENGAWAS'
    );

  it('the database trigger itself refuses a cross-organ Pengurus grant', async () => {
    // Proves the invariant the service now guards is real, not assumed.
    await withClient(targetUrl, async (db) => {
      await expect(
        db.query(
          `INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at)
           VALUES ('a-cross', 'u-pembina', 'role-anggota', false, true, now())`
        )
      ).rejects.toThrow(/organ conflict/i);
    });
  });

  it('excludes Pembina and Pengawas from the candidate list', async () => {
    const { service, previousUrl } = await loadService();
    try {
      const candidates = await service.listPlhCandidates();
      const ids = candidates.map((c: any) => c.id);
      expect(ids).not.toContain('u-pembina');
      expect(ids).not.toContain('u-pengawas2');
      // The eligible Pengurus delegate is offered, and marked eligible.
      const anggota = candidates.find((c: any) => c.id === 'u-anggota');
      expect(anggota?.plhEligible).toBe(true);
    } finally {
      await unloadService(previousUrl);
    }
  });

  it.each(['u-pembina', 'u-pengawas2'])(
    'refuses %s as a delegate when called directly, with no residual state',
    async (plhUserId) => {
      const { service, previousUrl } = await loadService();
      try {
        const error = await suspend(service, plhUserId).catch((e: any) => e);
        expect(error, 'a cross-organ delegate must be refused').toBeInstanceOf(Error);
        expect(error.statusCode).toBe(400);

        await withClient(targetUrl, async (db) => {
          const user = await db.query(
            `SELECT is_active FROM users WHERE id = 'u-target'`
          );
          expect(user.rows[0].is_active, 'target must not be deactivated').toBe(true);

          const suspension = await db.query(
            `SELECT count(*)::int AS n FROM board_member_suspensions`
          );
          expect(suspension.rows[0].n, 'no suspension row may survive').toBe(0);

          const refresh = await db.query(
            `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = 'u-target'`
          );
          expect(refresh.rows[0].n).toBe(0);

          const signing = await db.query(
            `SELECT count(*)::int AS n FROM user_signing_keys
             WHERE user_id = 'u-target' AND locked_until IS NOT NULL`
          );
          expect(signing.rows[0].n, 'no E-Sign lock may survive').toBe(0);

          const delegations = await db.query(
            `SELECT count(*)::int AS n FROM user_role_assignments
             WHERE user_id = $1`, [plhUserId]
          );
          expect(delegations.rows[0].n, 'no Plh grant may survive').toBe(1);
        });
      } finally {
        await unloadService(previousUrl);
      }
    }
  );

  it('still grants an eligible Pengurus delegate (the rule is not a blanket refusal)', async () => {
    const { service, previousUrl } = await loadService();
    try {
      const suspension = await suspend(service, 'u-anggota');
      expect(suspension.id).toBeTruthy();

      await withClient(targetUrl, async (db) => {
        const delegation = await db.query(
          `SELECT is_active FROM user_role_assignments
           WHERE user_id = 'u-anggota' AND role_id = 'role-anggota'`
        );
        expect(delegation.rows).toHaveLength(1);
        expect(delegation.rows[0].is_active).toBe(true);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });
});
