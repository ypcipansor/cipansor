/**
 * WBS forwarding races a role revocation — real PostgreSQL.
 *
 * A mocked Prisma cannot show this: the decision and the write share one
 * object, so no mock can prove that a revocation which commits *between* the
 * recipient read and the forward's commit is actually seen. This suite runs the
 * real `wbsService.forwardReport` against a real PostgreSQL over two independent
 * connections:
 *
 *  1. The forward locks the report, then the recipient's assignment rows while a
 *     concurrent transaction already holds the assignment row and revokes the
 *     role. The revocation commits first, the forward proceeds, re-reads the now
 *     ineffective assignment and refuses — the report is never assigned to a
 *     recipient who no longer holds the role.
 *  2. The reverse: the forward commits first and the revocation follows; the
 *     report is assigned to a then-valid recipient (the forward's decision was
 *     correct at commit time).
 *  3. A terminal case refuses a forward that raced its own closure, with no
 *     `WbsForwardLog`, routing change or comment.
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
  ('user-pengawas', 'Pengawas', 'pengawas@example.com', true, now()),
  ('user-ketua',    'Ketua',    'ketua@example.com',    true, now());

INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-pengawas', 'YAYASAN_PENGAWAS', 'Pengawas Yayasan', 'YAYASAN', '[]'::jsonb, now()),
  ('role-ketua', 'YAYASAN_KETUA', 'Ketua Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-pengawas', 'user-pengawas', 'role-pengawas', true, true, now()),
  ('a-ketua', 'user-ketua', 'role-ketua', true, true, now());

INSERT INTO wbs_reports
  (id, ticket_code, tracking_token, category, target_level, subject, description,
   primary_handler_role, status, assigned_user_id, updated_at)
VALUES
  ('r-fwd', 'WBS-202601-FWD001', '${'b'.repeat(64)}', 'KEUANGAN_ASET', 'PENGURUS_YAYASAN',
   'Subjek', 'Deskripsi laporan yang cukup panjang.', 'YAYASAN_PENGAWAS', 'DALAM_PENYELIDIKAN',
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

describeDb('WBS forward vs role revocation race (real PostgreSQL)', () => {
  const dbName = `cipansor_wbs_fwd_${Date.now()}`;
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
      await db.query(`DELETE FROM wbs_forward_logs WHERE report_id = 'r-fwd'`);
      await db.query(`DELETE FROM wbs_comments WHERE report_id = 'r-fwd'`);
      await db.query(
        `UPDATE wbs_reports
         SET status = 'DALAM_PENYELIDIKAN', assigned_user_id = 'user-pengawas',
             primary_handler_role = 'YAYASAN_PENGAWAS'
         WHERE id = 'r-fwd'`
      );
      await db.query(
        `UPDATE user_role_assignments
         SET is_active = true, expires_at = NULL
         WHERE id = 'a-ketua'`
      );
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

  beforeEach(async () => {
    vi.resetModules();
    await resetState();
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

  it('a revocation that commits first makes the forward refuse, leaving no assignment', async () => {
    const { service, previousUrl } = await loadService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      // Connection 1 holds the recipient's assignment row and revokes it, but
      // has not committed. The forward will block on the same row once it takes
      // the assignment lock.
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM user_role_assignments WHERE id = 'a-ketua' FOR UPDATE`);
      await blocker.query(
        `UPDATE user_role_assignments SET is_active = false WHERE id = 'a-ketua'`
      );

      const pending = service.forwardReport(
        'r-fwd',
        {
          toRole: 'YAYASAN_KETUA',
          reason: 'Terkait pelanggaran oleh kepala sekolah.',
          toUserId: 'user-ketua',
        },
        actor
      );

      // Let the forward reach (and block on) the assignment lock.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await blocker.query('COMMIT');

      // Once the lock is released the forward re-reads the assignment, sees it
      // inactive, and refuses rather than assigning a role-less recipient.
      await expect(pending).rejects.toMatchObject({ statusCode: 400 });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }

    await withClient(targetUrl, async (db) => {
      const row = await db.query(
        `SELECT assigned_user_id, primary_handler_role FROM wbs_reports WHERE id = 'r-fwd'`
      );
      expect(row.rows[0].assigned_user_id, 'the routing must stay with the original handler').toBe(
        'user-pengawas'
      );
      expect(row.rows[0].primary_handler_role).toBe('YAYASAN_PENGAWAS');

      const logs = await db.query(
        `SELECT count(*)::int AS n FROM wbs_forward_logs WHERE report_id = 'r-fwd'`
      );
      expect(logs.rows[0].n, 'no forward log may be written on a refused forward').toBe(0);
    });
  });

  it('a forward that commits first is valid, and a later revocation does not retarget it', async () => {
    // The complementary order: the forward wins the lock, commits the routing,
    // and only then does the revocation run. The forward's decision was correct
    // at the moment it committed; the report must be assigned to `user-ketua`.
    const { service, previousUrl } = await loadService();
    try {
      const updated = await service.forwardReport(
        'r-fwd',
        {
          toRole: 'YAYASAN_KETUA',
          reason: 'Terkait pelanggaran oleh kepala sekolah.',
          toUserId: 'user-ketua',
        },
        actor
      );
      expect(updated.assignedUserId).toBe('user-ketua');
    } finally {
      await unloadService(previousUrl);
    }

    // A revocation afterwards is a normal role change; it does not unassign the
    // report, which is the documented behaviour of a routing decision already
    // made.
    await withClient(targetUrl, async (db) => {
      await db.query(`UPDATE user_role_assignments SET is_active = false WHERE id = 'a-ketua'`);
      const row = await db.query(`SELECT assigned_user_id FROM wbs_reports WHERE id = 'r-fwd'`);
      expect(row.rows[0].assigned_user_id).toBe('user-ketua');
    });
  });

  it('refuses a forward to a recipient whose role expired by the time of the forward', async () => {
    await withClient(targetUrl, async (db) => {
      await db.query(
        `UPDATE user_role_assignments SET expires_at = now() - interval '1 minute' WHERE id = 'a-ketua'`
      );
    });

    const { service, previousUrl } = await loadService();
    try {
      await expect(
        service.forwardReport(
          'r-fwd',
          {
            toRole: 'YAYASAN_KETUA',
            reason: 'Terkait pelanggaran oleh kepala sekolah.',
            toUserId: 'user-ketua',
          },
          actor
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    } finally {
      await unloadService(previousUrl);
    }

    await withClient(targetUrl, async (db) => {
      const logs = await db.query(
        `SELECT count(*)::int AS n FROM wbs_forward_logs WHERE report_id = 'r-fwd'`
      );
      expect(logs.rows[0].n).toBe(0);
    });
  });

  it('a forward that raced a committed closure is refused with no side effects', async () => {
    const { service, previousUrl } = await loadService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      // Connection 1 holds the report row and closes the case; the forward
      // blocks on the report lock and must observe the terminal status once the
      // close commits.
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM wbs_reports WHERE id = 'r-fwd' FOR UPDATE`);

      const pending = service.forwardReport(
        'r-fwd',
        {
          toRole: 'YAYASAN_KETUA',
          reason: 'Terkait pelanggaran oleh kepala sekolah.',
          toUserId: 'user-ketua',
        },
        actor
      );

      await new Promise((resolve) => setTimeout(resolve, 400));
      await blocker.query(`UPDATE wbs_reports SET status = 'SELESAI' WHERE id = 'r-fwd'`);
      await blocker.query('COMMIT');

      await expect(pending).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }

    await withClient(targetUrl, async (db) => {
      const logs = await db.query(
        `SELECT count(*)::int AS n FROM wbs_forward_logs WHERE report_id = 'r-fwd'`
      );
      expect(logs.rows[0].n, 'a closed case must not collect a forward log').toBe(0);
      const comments = await db.query(
        `SELECT count(*)::int AS n FROM wbs_comments WHERE report_id = 'r-fwd'`
      );
      expect(comments.rows[0].n).toBe(0);
      const row = await db.query(`SELECT status FROM wbs_reports WHERE id = 'r-fwd'`);
      expect(row.rows[0].status).toBe('SELESAI');
    });
  });
});
