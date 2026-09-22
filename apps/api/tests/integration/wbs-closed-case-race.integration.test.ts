/**
 * WBS terminal-case immutability under a real race — PostgreSQL.
 *
 * The unit suite proves `updateReportStatus` refuses a terminal case, but with
 * Prisma mocked the *decision* and the write share one object, so a mock cannot
 * prove anything about interleaving. This suite runs the real service against a
 * real PostgreSQL on two independent connections: one transaction holds the
 * report row (`FOR UPDATE`) and commits the closure, while a concurrent
 * `updateReportStatus` (reopen) is already blocked on that same row.
 *
 * The fix reads the report's status from the *locked* row and refuses a
 * terminal case, so the blocked reopen must observe the committed `SELESAI`
 * once the lock is released and be rejected — never overwrite it with an open
 * status. Before the fix the reopen carried no status check at all and would
 * have landed, reopening a closed case.
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
INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('user-pengawas', 'Pengawas', 'pengawas@example.com', true, now());

INSERT INTO wbs_reports
  (id, ticket_code, tracking_token, category, target_level, subject, description,
   primary_handler_role, status, assigned_user_id, updated_at)
VALUES
  ('r-race', 'WBS-202601-RACE01', '${'a'.repeat(64)}', 'KEUANGAN_ASET', 'PENGURUS_YAYASAN',
   'Subjek', 'Deskripsi laporan yang cukup panjang.', 'YAYASAN_PENGAWAS', 'DITINDAKLANJUTI',
   'user-pengawas', now());
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

describeDb('WBS closed-case immutability race (real PostgreSQL)', () => {
  const dbName = `cipansor_wbs_race_${Date.now()}`;
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
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  const actor = {
    id: 'user-pengawas',
    name: 'Pengawas',
    roleCode: 'YAYASAN_PENGAWAS',
    unitId: null,
  };

  const loadService = async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl;
    vi.resetModules();
    try {
      const mod = await import('../../src/modules/pengawasan/wbs.service');
      return { service: mod.wbsService, previousUrl };
    } catch (error) {
      process.env.DATABASE_URL = previousUrl;
      throw error;
    }
  };

  const unloadService = async (previousUrl: string | undefined) => {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  };

  it('a reopen that raced a committed closure is rejected, not applied', async () => {
    const { service, previousUrl } = await loadService();
    try {
      // Connection 1 takes the row lock and holds it, then commits the closure
      // while the reopen is blocked on the same row.
      const blocker = new Client({ connectionString: targetUrl });
      await blocker.connect();
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM wbs_reports WHERE id = 'r-race' FOR UPDATE`);

      try {
        // Read while the report is still open, then block on the lock.
        const pending = service.updateReportStatus('r-race', { status: 'DIAJUKAN' }, actor);

        // Let the reopen reach the row lock before the close commits.
        await new Promise((resolve) => setTimeout(resolve, 400));

        await blocker.query(`UPDATE wbs_reports SET status = 'SELESAI' WHERE id = 'r-race'`);
        await blocker.query('COMMIT');

        await expect(pending).rejects.toMatchObject({ statusCode: 409 });
      } finally {
        await blocker.end();
      }

      await withClient(targetUrl, async (db) => {
        const row = await db.query(`SELECT status FROM wbs_reports WHERE id = 'r-race'`);
        expect(row.rows[0].status, 'the committed closure must survive a concurrent reopen').toBe(
          'SELESAI'
        );

        const comments = await db.query(
          `SELECT count(*)::int AS n FROM wbs_comments WHERE report_id = 'r-race'`
        );
        expect(comments.rows[0].n, 'the refused reopen must not write a note').toBe(0);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('the reverse order — a close after the reopen commits — still ends terminal', async () => {
    // Reset the fixture to an open state for the opposite interleaving.
    await withClient(targetUrl, async (db) => {
      await db.query(`UPDATE wbs_reports SET status = 'DITINDAKLANJUTI' WHERE id = 'r-race'`);
      await db.query(`DELETE FROM wbs_comments WHERE report_id = 'r-race'`);
    });

    const { service, previousUrl } = await loadService();
    try {
      // Serialise deliberately: the close commits first, then the reopen runs.
      // Because the reopen reads the *locked* status it must be refused — the
      // reverse interleaving of the race above, with a deterministic order.
      await service.updateReportStatus('r-race', { status: 'SELESAI' }, actor);

      await expect(
        service.updateReportStatus('r-race', { status: 'DALAM_PENYELIDIKAN' }, actor)
      ).rejects.toMatchObject({ statusCode: 409 });

      await withClient(targetUrl, async (db) => {
        const row = await db.query(`SELECT status FROM wbs_reports WHERE id = 'r-race'`);
        expect(row.rows[0].status).toBe('SELESAI');
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('refuses every reopen attempt once the case is terminal', async () => {
    const { service, previousUrl } = await loadService();
    try {
      for (const target of ['DIAJUKAN', 'DALAM_PENYELIDIKAN', 'DITINDAKLANJUTI'] as const) {
        await expect(
          service.updateReportStatus('r-race', { status: target }, actor)
        ).rejects.toMatchObject({ statusCode: 409 });
      }

      await withClient(targetUrl, async (db) => {
        const row = await db.query(`SELECT status FROM wbs_reports WHERE id = 'r-race'`);
        expect(row.rows[0].status).toBe('SELESAI');
      });
    } finally {
      await unloadService(previousUrl);
    }
  });
});
