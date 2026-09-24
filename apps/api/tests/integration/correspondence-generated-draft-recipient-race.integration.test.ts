/**
 * A generated draft's recipient must still be eligible at commit — real
 * PostgreSQL.
 *
 * `createGeneratedDraftLetter` used to validate the recipient set once, outside
 * the transaction, and then write the letter. The gap between that read and the
 * insert is a real window: an admin deactivation, a soft delete, or a role
 * revocation that commits inside it leaves a draft addressed to a recipient who
 * is no longer eligible — the oversight report then has no lawful reviewer, and
 * the E-Office flow can never advance it.
 *
 * A mocked Prisma cannot prove this: the mock's read and write share one object,
 * so an "interleaved" revocation is invisible. This suite runs the real service
 * against a real PostgreSQL over two independent connections, holding the
 * recipient's rows so the revocation commits *between* the pre-flight validation
 * and the transactional write, and asserts the draft is refused with no rows.
 *
 * It also covers the ordering that must not deadlock: a generated draft and a
 * concurrent account/role writer lock the same rows in the same order.
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
  },
}));

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const SEED = `
INSERT INTO units (id, name, type, address, updated_at) VALUES
  ('unit-pusat', 'Yayasan Pusat', 'PESANTREN', 'Cipansor', now());

INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-pembina', 'YAYASAN_PEMBINA', 'Pembina Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-pembina', 'Pembina', 'pembina@example.com', true, now()),
  ('u-pengawas', 'Pengawas', 'pengawas@example.com', true, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-pembina', 'u-pembina', 'role-pembina', true, true, now());
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

describeDb('generated-draft recipient eligibility vs account/role change (real PostgreSQL)', () => {
  const dbName = `cipansor_gendraft_${Date.now()}`;
  const baseUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const targetUrl = (() => {
    const u = new URL(baseUrl);
    u.pathname = `/${dbName}`;
    return u.toString();
  })();

  let admin: Client;

  const countLetters = async (): Promise<number> =>
    withClient(targetUrl, async (db) => {
      const r = await db.query(`SELECT count(*)::int AS n FROM letters`);
      return r.rows[0].n;
    });

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
      await db.query(`DELETE FROM letters`);
      await db.query(`UPDATE users SET is_active = true, deleted_at = NULL WHERE id = 'u-pembina'`);
      await db.query(
        `UPDATE user_role_assignments SET is_active = true, expires_at = NULL WHERE id = 'a-pembina'`
      );
    });
  });

  const loadService = async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl;
    vi.resetModules();
    try {
      const mod = await import('../../src/modules/correspondence/correspondence.service');
      return { service: mod.CorrespondenceService, previousUrl };
    } catch (error) {
      process.env.DATABASE_URL = previousUrl;
      throw error;
    }
  };

  const unloadService = async (previousUrl: string | undefined) => {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  };

  const draft = (service: any) =>
    service.createGeneratedDraftLetter(
      {
        unitId: 'unit-pusat',
        subject: '[Laporan Pengawasan] Audit Q1',
        content: 'Isi laporan.',
        recipientUserIds: ['u-pembina'],
        nature: 'LIMITED',
      },
      'u-pengawas'
    );

  it('a role revocation that commits before the write makes the draft refuse', async () => {
    const { service, previousUrl } = await loadService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      // Connection 1 holds the recipient's assignment row and revokes it. The
      // draft's pre-flight read has already run by the time the transaction
      // reaches the assignment lock, so it blocks there; once the revocation
      // commits, the locked re-read sees an inactive assignment and refuses.
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM user_role_assignments WHERE id = 'a-pembina' FOR UPDATE`);
      await blocker.query(
        `UPDATE user_role_assignments SET is_active = false WHERE id = 'a-pembina'`
      );

      const pending = draft(service);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await blocker.query('COMMIT');

      await expect(pending).rejects.toMatchObject({ statusCode: 400 });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }

    expect(await countLetters(), 'no letter may be written to a revoked recipient').toBe(0);
  });

  it('a soft delete that commits before the write makes the draft refuse', async () => {
    const { service, previousUrl } = await loadService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM users WHERE id = 'u-pembina' FOR UPDATE`);
      // The blocker holds the user row first, so the draft blocks on the user
      // lock — exactly the lock order both sides must share.
      const pending = draft(service);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await blocker.query(`UPDATE users SET deleted_at = now() WHERE id = 'u-pembina'`);
      await blocker.query('COMMIT');

      await expect(pending).rejects.toMatchObject({ statusCode: 400 });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }

    expect(await countLetters()).toBe(0);
  });

  it('a valid eligibility read that wins the lock produces the draft', async () => {
    const { service, previousUrl } = await loadService();
    try {
      const letter = await draft(service);
      expect(letter.status).toBe('DRAFT');
    } finally {
      await unloadService(previousUrl);
    }

    await withClient(targetUrl, async (db) => {
      const r = await db.query(`SELECT id, status FROM letters`);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].status).toBe('DRAFT');
      const recipients = await db.query(
        `SELECT user_id FROM letter_recipients WHERE letter_id = $1`,
        [r.rows[0].id]
      );
      expect(recipients.rows.map((x: any) => x.user_id)).toEqual(['u-pembina']);
    });
  });
});
