/**
 * Board-member suspension — real PostgreSQL concurrency.
 *
 * Items 4/5/16 of the review: the Plh/Plt release (`liftBoardSuspension`) and
 * the transactional target claim (`suspendBoardMember`) were previously only
 * covered by Vitest tests against a mocked Prisma, which cannot prove anything
 * about PostgreSQL locking — a mock `$queryRaw` returns whatever the test tells
 * it to, including from two interleaved "transactions" that share one object.
 *
 * This suite runs against a real PostgreSQL, applies the real migrations, and
 * drives the service over *two independent connections*, so the row locks and
 * the partial unique index actually have to do their work:
 *
 *  1. Two lifts that share ONE Plh assignment, run in parallel, must delete the
 *     assignment exactly once and leave no ACTIVE dependency behind (the old
 *     `count → find heir → delete` lost this at READ COMMITTED).
 *  2. A suspension racing an admin deactivation must not create a suspension
 *     for an account that is already off.
 *
 * Opt-in via RUN_DB_TESTS=1, like the other DB suite: the default unit env
 * points DATABASE_URL at a stub.
 *
 * Redis is stubbed with a no-op. It is not the subject here — the suspension
 * cache has its own unit coverage — and no Redis server is required to run a
 * PostgreSQL locking test.
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
  ('role-ketua', 'YAYASAN_KETUA', 'Ketua Yayasan', 'YAYASAN', '[]'::jsonb, now()),
  ('role-anggota', 'YAYASAN_ANGGOTA', 'Anggota Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-issuer',   'Pengawas',        'pengawas@example.com',   true, now()),
  ('u-target-a', 'Ketua A',         'ketua-a@example.com',    true, now()),
  ('u-target-b', 'Ketua B',         'ketua-b@example.com',    true, now()),
  ('u-delegate', 'Anggota Delegasi','delegate@example.com',   true, now());

-- Both targets are Pengurus, and both name the same delegate for the SAME
-- role, so the second suspension reuses the first's assignment.
INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-target-a', 'u-target-a', 'role-ketua',   true, true, now()),
  ('a-target-b', 'u-target-b', 'role-ketua',   true, true, now());
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

describeDb('board suspension concurrency (real PostgreSQL)', () => {
  const dbName = `cipansor_suspension_${Date.now()}`;
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

  /** Import the service so its `prisma` singleton binds this throwaway DB. */
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

  // The service is fail-closed on the actor role (`PENGAWASAN_SUSPENSION_ISSUE_ROLES`),
  // so the direct call must carry one, exactly as the controller now does.
  const suspend = async (service: any, userId: string, skNumber: string) =>
    service.suspendBoardMember(
      {
        userId,
        skNumber,
        auditReason: 'Temuan audit independen untuk pengujian concurrency.',
        plhUserId: 'u-delegate',
        plhRoleCode: 'YAYASAN_ANGGOTA',
      },
      'u-issuer',
      'YAYASAN_PENGAWAS'
    );

  it('two parallel lifts sharing one assignment release it exactly once', async () => {
    const { service, previousUrl } = await loadService();
    try {
      // Both suspensions depend on the same delegate + role: the second reuses
      // the assignment the first created.
      const suspensionA = await suspend(service, 'u-target-a', 'SK/A');
      const suspensionB = await suspend(service, 'u-target-b', 'SK/B');

      await withClient(targetUrl, async (db) => {
        const deps = await db.query(
          `SELECT suspension_id, assignment_id, created FROM board_suspension_plh_assignments ORDER BY created DESC`
        );
        expect(deps.rows).toHaveLength(2);
        // One row owns the provenance of the assignment; the other depends on
        // it. They must point at the SAME assignment.
        expect(new Set(deps.rows.map((r: any) => r.assignment_id)).size).toBe(1);
        expect(deps.rows.filter((r: any) => r.created)).toHaveLength(1);
      });

      // Two lifts, in parallel, on two pooled connections.
      const results = await Promise.allSettled([
        service.liftBoardSuspension(suspensionA.id, 'u-issuer', 'Pemulihan status A.'),
        service.liftBoardSuspension(suspensionB.id, 'u-issuer', 'Pemulihan status B.'),
      ]);

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(
        rejected.map((r: any) => r.reason?.message ?? String(r.reason)),
        'neither lift may deadlock or fail; the lock orders them'
      ).toEqual([]);

      await withClient(targetUrl, async (db) => {
        const assignment = await db.query(
          `SELECT id FROM user_role_assignments WHERE user_id = 'u-delegate'`
        );
        expect(
          assignment.rows,
          'the suspension-created delegation must be gone, not left ACTIVE forever'
        ).toHaveLength(0);

        const deps = await db.query(
          `SELECT count(*)::int AS n FROM board_suspension_plh_assignments`
        );
        expect(deps.rows[0].n, 'no dependency row may outlive its suspension').toBe(0);

        const active = await db.query(
          `SELECT count(*)::int AS n FROM board_member_suspensions WHERE status = 'ACTIVE'`
        );
        expect(active.rows[0].n).toBe(0);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('releasing it works in the reverse lift order too', async () => {
    // Fresh state: clear what the previous case left, so this case is not
    // accidentally asserting "already deleted".
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM board_suspension_plh_assignments`);
      await db.query(`DELETE FROM board_member_suspensions`);
      await db.query(`DELETE FROM user_role_assignments WHERE user_id = 'u-delegate'`);
      await db.query(
        `UPDATE users SET is_active = true, account_state_writer = NULL WHERE id LIKE 'u-target-%'`
      );
    });

    const { service, previousUrl } = await loadService();
    try {
      // Create B first this time, so the provenance owner — and therefore the
      // order of the two lifts — is the opposite of the previous case.
      const suspensionB = await suspend(service, 'u-target-b', 'SK/B2');
      const suspensionA = await suspend(service, 'u-target-a', 'SK/A2');

      const results = await Promise.allSettled([
        service.liftBoardSuspension(
          suspensionA.id,
          'u-issuer',
          'Pemulihan status A (urutan terbalik).'
        ),
        service.liftBoardSuspension(
          suspensionB.id,
          'u-issuer',
          'Pemulihan status B (urutan terbalik).'
        ),
      ]);

      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);

      await withClient(targetUrl, async (db) => {
        const assignment = await db.query(
          `SELECT id FROM user_role_assignments WHERE user_id = 'u-delegate'`
        );
        expect(assignment.rows).toHaveLength(0);
        const deps = await db.query(
          `SELECT count(*)::int AS n FROM board_suspension_plh_assignments`
        );
        expect(deps.rows[0].n).toBe(0);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('does not create a suspension for a target deactivated under the transaction', async () => {
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM board_suspension_plh_assignments`);
      await db.query(`DELETE FROM board_member_suspensions`);
      await db.query(
        `UPDATE users SET is_active = true, account_state_writer = NULL WHERE id = 'u-target-a'`
      );
    });

    const { service, previousUrl } = await loadService();
    try {
      // Connection 1 takes the row lock and holds it, then an admin
      // deactivation commits while the suspension is blocked on `FOR UPDATE`.
      const blocker = new Client({ connectionString: targetUrl });
      await blocker.connect();
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM users WHERE id = 'u-target-a' FOR UPDATE`);

      try {
        const pending = suspend(service, 'u-target-a', 'SK/RACE');

        // Give the suspension enough time to pass its pre-flight read (which
        // still sees an active account, because the deactivation is not
        // committed yet) and block on the row lock.
        await new Promise((resolve) => setTimeout(resolve, 500));

        await blocker.query(
          `UPDATE users SET is_active = false, account_state_writer = 'asw_admin_deactivation' WHERE id = 'u-target-a'`
        );
        await blocker.query('COMMIT');

        await expect(pending).rejects.toMatchObject({ statusCode: 409 });
      } finally {
        await blocker.end();
      }

      await withClient(targetUrl, async (db) => {
        const suspensions = await db.query(
          `SELECT count(*)::int AS n FROM board_member_suspensions WHERE user_id = 'u-target-a'`
        );
        expect(
          suspensions.rows[0].n,
          'no SK may be issued for an account that was already switched off'
        ).toBe(0);

        const delegation = await db.query(
          `SELECT count(*)::int AS n FROM user_role_assignments WHERE user_id = 'u-delegate'`
        );
        expect(
          delegation.rows[0].n,
          'no Plh delegation may be minted when the suspension aborts'
        ).toBe(0);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('two parallel suspensions of the same person yield exactly one ACTIVE row', async () => {
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM board_suspension_plh_assignments`);
      await db.query(`DELETE FROM board_member_suspensions`);
      await db.query(
        `UPDATE users SET is_active = true, account_state_writer = NULL WHERE id = 'u-target-a'`
      );
    });

    const { service, previousUrl } = await loadService();
    try {
      const results = await Promise.allSettled([
        suspend(service, 'u-target-a', 'SK/PAR-1'),
        suspend(service, 'u-target-a', 'SK/PAR-2'),
      ]);

      // The partial unique index (or the conditional claim) is the guarantee:
      // one wins, the loser gets a defined conflict, never two ACTIVE rows.
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(loser.reason).toMatchObject({ statusCode: 409 });

      await withClient(targetUrl, async (db) => {
        const active = await db.query(
          `SELECT count(*)::int AS n FROM board_member_suspensions WHERE status = 'ACTIVE' AND user_id = 'u-target-a'`
        );
        expect(active.rows[0].n).toBe(1);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('two parallel suspensions of different officers mint ONE delegation for the shared delegate+role', async () => {
    // Review item 3: `findFirst` then `create` on a unitless (user, role) row is
    // unconstrained by `(user, role, unit)` because Postgres treats NULLs as
    // distinct. Two suspensions running concurrently must still produce exactly
    // one effective Plh assignment and point both dependency rows at it.
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM board_suspension_plh_assignments`);
      await db.query(`DELETE FROM board_member_suspensions`);
      await db.query(`DELETE FROM user_role_assignments WHERE user_id = 'u-delegate'`);
      await db.query(
        `UPDATE users SET is_active = true, account_state_writer = NULL WHERE id LIKE 'u-target-%'`
      );
    });

    const { service, previousUrl } = await loadService();
    try {
      const results = await Promise.allSettled([
        suspend(service, 'u-target-a', 'SK/RACE-A'),
        suspend(service, 'u-target-b', 'SK/RACE-B'),
      ]);
      expect(
        results.filter((r) => r.status === 'rejected').map((r: any) => r.reason?.message),
        'both suspensions must succeed; the advisory lock makes the second reuse the first delegation'
      ).toEqual([]);

      await withClient(targetUrl, async (db) => {
        const assignments = await db.query(
          `SELECT id FROM user_role_assignments WHERE user_id = 'u-delegate' AND unit_id IS NULL`
        );
        expect(
          assignments.rows,
          'the partial unique index must leave exactly one unitless delegation'
        ).toHaveLength(1);

        const deps = await db.query(
          `SELECT suspension_id, assignment_id FROM board_suspension_plh_assignments`
        );
        expect(deps.rows).toHaveLength(2);
        expect(
          new Set(deps.rows.map((r: any) => r.assignment_id)).size,
          'both suspensions must depend on the same assignment'
        ).toBe(1);
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('the database rejects a second unitless delegation for the same user+role', async () => {
    // The guarantee itself, independent of the service: the partial index is what
    // stops the duplicate even if every application-level check were bypassed.
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM board_suspension_plh_assignments`);
      await db.query(`DELETE FROM board_member_suspensions`);
      await db.query(`DELETE FROM user_role_assignments WHERE user_id = 'u-delegate'`);
      await db.query(
        `INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at)
         VALUES ('a-dup-1', 'u-delegate', 'role-anggota', false, true, now())`
      );
      await expect(
        db.query(
          `INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at)
           VALUES ('a-dup-2', 'u-delegate', 'role-anggota', false, true, now())`
        )
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('two suspensions naming each other as Plh/Plt must not deadlock', async () => {
    // Review item 2. A is frozen with Plh=B and B is frozen with Plh=A, run
    // together. Before the fix each transaction locked its own target's user
    // row first and the delegate's later, so the pair acquired the two `users`
    // rows in opposite order and PostgreSQL aborted one with 40P01. The service
    // now locks the whole {target, delegate} set in uuid order before anything
    // else, so the two serialise. The accepted outcomes are: exactly one
    // suspension succeeds and the other is refused with a defined 4xx (the
    // loser names an already-frozen officer, who can no longer act as Plh), or
    // both succeed sequentially — never a 500 and never 40P01.
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM board_suspension_plh_assignments`);
      await db.query(`DELETE FROM board_member_suspensions`);
      await db.query(
        `UPDATE users SET is_active = true, account_state_writer = NULL WHERE id LIKE 'u-target-%'`
      );
    });

    const { service, previousUrl } = await loadService();
    try {
      const mutual = (target: string, plh: string, sk: string) =>
        service.suspendBoardMember(
          {
            userId: target,
            skNumber: sk,
            auditReason: 'Temuan audit independen untuk pengujian deadlock Plh silang.',
            plhUserId: plh,
            plhRoleCode: 'YAYASAN_KETUA',
          },
          'u-issuer',
          'YAYASAN_PENGAWAS'
        );

      const results = await Promise.allSettled([
        mutual('u-target-a', 'u-target-b', 'SK/MUTUAL-A'),
        mutual('u-target-b', 'u-target-a', 'SK/MUTUAL-B'),
      ]);

      const deadlocks = results.filter(
        (r): r is PromiseRejectedResult =>
          r.status === 'rejected' &&
          (r.reason?.meta?.code === '40P01' || /deadlock detected/i.test(String(r.reason?.message)))
      );
      expect(deadlocks, 'a mutual Plh pair must serialise, never abort with 40P01').toEqual([]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(
        fulfilled.length,
        'at least one suspension must land; the other may be refused once its Plh is already frozen'
      ).toBeGreaterThanOrEqual(1);

      // Any loser must be a defined client error, never a 500.
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(
            r.reason?.statusCode,
            `a losing suspension must be a 4xx, got: ${r.reason?.message}`
          ).toBeGreaterThanOrEqual(400);
          expect(r.reason?.statusCode).toBeLessThan(500);
        }
      }
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('refuses a suspension whose target Pengurus role is revoked first (roles write wins)', async () => {
    // Review item 4: a revocation of `UserRoleAssignment` is a different row
    // from `users`, so locking the user row alone does NOT serialise it. The
    // suspension must take the assignment rows too, so a revocation that
    // commits first is visible to its locked re-read and the suspension aborts
    // rather than switching off someone who is no longer a Pengurus.
    //
    // The blocker holds ONLY the target's assignment row — the row a revoking
    // `RolesService.removeRoleAssignment` updates — and does not touch the user
    // row. That is deliberate: if the suspension acquired only the user-row
    // lock (the pre-fix code), it would not block here, would read the still-
    // active Pengurus assignment before the revocation commits, and would then
    // commit a suspension for a target who is no longer a Pengurus. Taking the
    // assignment-row lock in the suspension makes it wait for the revocation to
    // commit, so its post-lock read sees the revocation and aborts.
    await withClient(targetUrl, async (db) => {
      await db.query(`DELETE FROM board_suspension_plh_assignments`);
      await db.query(`DELETE FROM board_member_suspensions`);
      await db.query(`DELETE FROM user_role_assignments WHERE user_id = 'u-delegate'`);
      await db.query(
        `UPDATE users SET is_active = true, account_state_writer = NULL WHERE id = 'u-target-a'`
      );
      await db.query(
        `INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at)
         VALUES ('a-target-a', 'u-target-a', 'role-ketua', true, true, now())
         ON CONFLICT (id) DO UPDATE SET is_active = true`
      );
    });

    const { service, previousUrl } = await loadService();
    const blocker = new Client({ connectionString: targetUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        `SELECT id FROM user_role_assignments WHERE user_id = 'u-target-a' ORDER BY id FOR UPDATE`
      );

      const pending = suspend(service, 'u-target-a', 'SK/REVOKE-RACE');
      await new Promise((resolve) => setTimeout(resolve, 500));

      // The revocation wins the lock and commits while the suspension waits.
      await blocker.query(
        `UPDATE user_role_assignments SET is_active = false, updated_at = now() WHERE id = 'a-target-a'`
      );
      await blocker.query('COMMIT');

      await expect(pending).rejects.toMatchObject({ statusCode: 403 });

      await withClient(targetUrl, async (db) => {
        const suspensions = await db.query(
          `SELECT count(*)::int AS n FROM board_member_suspensions WHERE user_id = 'u-target-a'`
        );
        expect(
          suspensions.rows[0].n,
          'no SK may be issued once the target is no longer an effective Pengurus'
        ).toBe(0);

        const account = await db.query(`SELECT is_active FROM users WHERE id = 'u-target-a'`);
        expect(
          account.rows[0].is_active,
          'a refused suspension must not have switched the account off'
        ).toBe(true);
      });
    } finally {
      await blocker.end();
      await unloadService(previousUrl);
    }
  });
});
