/**
 * Plh/Plt duplicate-assignment migration — real PostgreSQL, dirty fixture.
 *
 * The `20260921130000_plh_assignment_effective_unique` migration both chooses a
 * survivor among duplicate unitless `user_role_assignments` and repoints the
 * `board_suspension_plh_assignments` dependency rows before deleting the losers.
 * A mocked Prisma cannot prove any of that: the migration is raw SQL, and the
 * FK is `ON DELETE CASCADE`, so a wrong survivor silently deletes live audit
 * dependency rows instead of failing loudly.
 *
 * This suite:
 *  1. applies every migration EXCEPT the dedup one, to reach the "dirty" schema;
 *  2. seeds duplicate unitless assignments that differ in `is_active` /
 *     `is_primary` / `expires_at`, with dependency rows on both the loser (to be
 *     repointed), on the loser AND the survivor under one suspension (to be
 *     folded), and on the survivor alone (whose legitimate provenance must be
 *     preserved);
 *  3. applies the dedup migration SQL;
 *  4. asserts the *effective* row survived (not the lowest UUID), every
 *     dependency still exists and points at it, provenance was reconciled
 *     *correctly* — a dependency repointed off the loser must not claim the
 *     survivor as suspension-created — and the new partial unique index actually
 *     rejects a second unitless row.
 *
 * The provenance assertions are the regression this suite exists for. The
 * previous migration folded a loser's `created` / `restore` into the survivor
 * row with OR / COALESCE, so a suspension that had created only the loser ended
 * up owning a legitimate, pre-existing survivor — and the last lift deleted it.
 * The release simulation at the end drives the *same* conditional rule the lift
 * uses, proving the corrected provenance leaves the survivor standing.
 *
 * Opt-in via RUN_DB_TESTS=1.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const CUTOFF = '20260921130000_plh_assignment_effective_unique';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

/**
 * Suspension rows require `suspended_by_id`; `u-issuer` is that actor. The three
 * targets exist only to satisfy the `board_member_suspensions.user_id` FK.
 */
const SEED = `
INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('role-ketua', 'YAYASAN_KETUA', 'Ketua Yayasan', 'YAYASAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-issuer',   'Pengawas', 'pengawas@example.com',  true, now()),
  ('u-target-a', 'Ketua A',  'ketua-a@example.com',   true, now()),
  ('u-target-b', 'Ketua B',  'ketua-b@example.com',   true, now()),
  ('u-target-c', 'Ketua C',  'ketua-c@example.com',   true, now()),
  ('u-delegate', 'Delegasi', 'delegate@example.com',  true, now());

-- Two duplicate unitless delegations belong to the same delegate + role.
--
-- The survivor is the ACTIVE, primary, longer-lived row — the *effective*
-- assignment. The loser is INACTIVE and has the LOWER uuid, so a "keep the
-- lowest id" survivor would discard the effective row. Crucially the survivor
-- is NOT created by a suspension: it pre-existed, so no suspension owns it.
INSERT INTO user_role_assignments
  (id, user_id, role_id, unit_id, is_primary, is_active, created_at, updated_at) VALUES
  ('aaaaaaaa-loser',    'u-delegate', 'role-ketua', NULL, false, false, now() - interval '2 days', now()),
  ('bbbbbbbb-survivor', 'u-delegate', 'role-ketua', NULL, true,  true,  now() - interval '1 day',  now());

INSERT INTO board_member_suspensions (id, user_id, sk_number, audit_reason, status, suspended_by_id, updated_at) VALUES
  ('susp-1', 'u-target-a', 'SK/1', 'Alasan audit yang panjang.', 'ACTIVE', 'u-issuer', now()),
  ('susp-2', 'u-target-b', 'SK/2', 'Alasan audit yang panjang.', 'ACTIVE', 'u-issuer', now()),
  ('susp-3', 'u-target-c', 'SK/3', 'Alasan audit yang panjang.', 'ACTIVE', 'u-issuer', now());

-- susp-1 depends on BOTH the loser and the survivor: after repointing, these
-- two collide on the (suspension_id, assignment_id) unique, so one must be
-- folded away. susp-1 created the loser (created = true) but only reuses
-- the legitimate survivor (created = false). The fold MUST keep the survivor
-- row's provenance, not OR the loser's created into it.
-- susp-2 depends only on the loser and must be repointed to the survivor.
-- susp-3 is the control: it genuinely created the survivor, so its
-- created = true provenance must survive the migration untouched — proving
-- the fix does not simply erase provenance everywhere.
INSERT INTO board_suspension_plh_assignments
  (id, suspension_id, assignment_id, role_code, created, restore, created_at) VALUES
  ('dep-s1-loser',    'susp-1', 'aaaaaaaa-loser',    'YAYASAN_KETUA', true,  NULL, now() - interval '2 days'),
  ('dep-s1-survivor', 'susp-1', 'bbbbbbbb-survivor', 'YAYASAN_KETUA', false, NULL, now() - interval '1 day'),
  ('dep-s2-loser',    'susp-2', 'aaaaaaaa-loser',    'YAYASAN_KETUA', true,  NULL, now()),
  ('dep-s3-survivor', 'susp-3', 'bbbbbbbb-survivor', 'YAYASAN_KETUA', true,  NULL, now());
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

describeDb('plh assignment dedup migration (real PostgreSQL)', () => {
  const dbName = `cipansor_plh_dedup_${Date.now()}`;
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
        // Stop before the dedup migration under test.
        if (dir >= CUTOFF) continue;
        await db.query(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'));
      }
      await db.query(SEED);
      // Apply ONLY the migration under test, after the dirty fixture exists.
      await db.query(readFileSync(join(MIGRATIONS, CUTOFF, 'migration.sql'), 'utf8'));
    });
  }, 180_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  it('keeps the effective assignment, not the lowest UUID', async () => {
    await withClient(targetUrl, async (db) => {
      const rows = await db.query(
        `SELECT id FROM user_role_assignments WHERE user_id = 'u-delegate' AND role_id = 'role-ketua' AND unit_id IS NULL`
      );
      expect(rows.rows.map((r: any) => r.id)).toEqual(['bbbbbbbb-survivor']);
    });
  });

  it('repoints the sole dependency of the loser to the survivor', async () => {
    await withClient(targetUrl, async (db) => {
      const dep = await db.query(
        `SELECT assignment_id FROM board_suspension_plh_assignments WHERE id = 'dep-s2-loser'`
      );
      expect(dep.rows[0].assignment_id).toBe('bbbbbbbb-survivor');
    });
  });

  it('does NOT mark the legitimate survivor as suspension-created when folding a collision', async () => {
    await withClient(targetUrl, async (db) => {
      const deps = await db.query(
        `SELECT id, assignment_id, created, restore FROM board_suspension_plh_assignments WHERE suspension_id = 'susp-1'`
      );
      // The two rows collapse to one, on the survivor.
      expect(deps.rows).toHaveLength(1);
      expect(deps.rows[0].assignment_id).toBe('bbbbbbbb-survivor');
      // The survivor is a legitimate, pre-existing assignment: susp-1 merely
      // reused it. The loser's `created = true` (which described a *different*
      // assignment) must not be OR-ed onto the survivor, or the last lift would
      // delete an assignment no suspension created.
      expect(deps.rows[0].created).toBe(false);
      // The loser's `restore` (its own prior state) must not be carried either.
      expect(deps.rows[0].restore).toBeNull();
    });
  });

  it('resets provenance when repointing a non-colliding dependency off the loser', async () => {
    await withClient(targetUrl, async (db) => {
      const dep = await db.query(
        `SELECT assignment_id, created, restore FROM board_suspension_plh_assignments WHERE id = 'dep-s2-loser'`
      );
      expect(dep.rows[0].assignment_id).toBe('bbbbbbbb-survivor');
      // A dependency that pointed at a suspension-created loser must not
      // become an owner of the survivor it was moved onto.
      expect(dep.rows[0].created).toBe(false);
      expect(dep.rows[0].restore).toBeNull();
    });
  });

  it('preserves genuine provenance on the survivor (a suspension that really minted it)', async () => {
    await withClient(targetUrl, async (db) => {
      const dep = await db.query(
        `SELECT assignment_id, created FROM board_suspension_plh_assignments WHERE id = 'dep-s3-survivor'`
      );
      expect(dep.rows[0].assignment_id).toBe('bbbbbbbb-survivor');
      // susp-3 created the survivor, so its ownership flag must survive. The
      // migration reset provenance only for rows it *moved*; rows already on
      // the survivor are the authority on the survivor's origin.
      expect(dep.rows[0].created).toBe(true);
    });
  });

  it('leaves no dependency row pointing at a deleted assignment', async () => {
    await withClient(targetUrl, async (db) => {
      const orphan = await db.query(
        `SELECT count(*)::int AS n
         FROM board_suspension_plh_assignments d
         LEFT JOIN user_role_assignments a ON a.id = d.assignment_id
         WHERE a.id IS NULL`
      );
      expect(orphan.rows[0].n).toBe(0);
    });
  });

  it('a lift of a non-creating dependent does not delete the legitimate survivor', async () => {
    await withClient(targetUrl, async (db) => {
      // Drive the same conditional rule as `releasePlhAssignment`: the last
      // dependent deletes the assignment only when the surviving provenance
      // says the suspension created it. susp-2 is a non-creating dependent
      // repointed by the migration, so the release must be a no-op. Wrapped in
      // a transaction and rolled back so the row is available to later tests.
      await db.query('BEGIN');
      try {
        const dep = await db.query(
          `SELECT created FROM board_suspension_plh_assignments WHERE suspension_id = 'susp-2'`
        );
        expect(dep.rows[0].created).toBe(false);
        await db.query(
          `DELETE FROM user_role_assignments WHERE id = 'bbbbbbbb-survivor' AND $1::boolean`,
          [dep.rows[0].created]
        );
        const survivor = await db.query(
          `SELECT id FROM user_role_assignments WHERE id = 'bbbbbbbb-survivor'`
        );
        expect(
          survivor.rows,
          'a non-creating lift must not delete a legitimate survivor'
        ).toHaveLength(1);
      } finally {
        await db.query('ROLLBACK');
      }
    });
  });

  it('a lift of the genuine creator DOES delete the assignment it minted', async () => {
    await withClient(targetUrl, async (db) => {
      // Negative control for the test above: when the provenance really is
      // `created`, the same rule deletes the assignment — proving the release
      // simulation is not vacuous. Rolled back so the fixture is unchanged.
      await db.query('BEGIN');
      try {
        const dep = await db.query(
          `SELECT created FROM board_suspension_plh_assignments WHERE suspension_id = 'susp-3'`
        );
        expect(dep.rows[0].created).toBe(true);
        await db.query(
          `DELETE FROM user_role_assignments WHERE id = 'bbbbbbbb-survivor' AND $1::boolean`,
          [dep.rows[0].created]
        );
        const survivor = await db.query(
          `SELECT id FROM user_role_assignments WHERE id = 'bbbbbbbb-survivor'`
        );
        expect(survivor.rows, 'a creating lift deletes the assignment it minted').toHaveLength(0);
      } finally {
        await db.query('ROLLBACK');
      }
    });
  });

  it('installs a partial unique index that rejects a second unitless row', async () => {
    await withClient(targetUrl, async (db) => {
      const idx = await db.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'user_role_assignments' AND indexname = 'user_role_assignments_user_id_role_id_unitless_key'`
      );
      expect(idx.rows).toHaveLength(1);
      await expect(
        db.query(
          `INSERT INTO user_role_assignments (id, user_id, role_id, unit_id, is_primary, is_active, updated_at)
           VALUES ('dup', 'u-delegate', 'role-ketua', NULL, false, true, now())`
        )
      ).rejects.toThrow(/unique|duplikat|already exists/i);
    });
  });
});
