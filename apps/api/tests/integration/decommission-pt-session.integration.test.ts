/**
 * Replay of the higher-education / Litbang decommission migration against a
 * database that still holds legacy PT data (PR #505 regression).
 *
 * The bug this pins: dropping the `PT_*` role rows and their
 * `user_role_assignments` is not enough to end a PT user's session. Such a
 * user can still own a live refresh token, and the legacy `users.role` column
 * carries an ordinary `UserRole` value (the enum has no PT member), so
 * `authService.refreshToken` falls back to it and mints a brand-new session
 * forever. The migration must identify the affected users *before* deleting
 * their assignments, revoke their refresh tokens, and null the legacy fallback.
 *
 * The suite applies the real `0_init` baseline, seeds legacy PT rows, replays
 * the decommission migration, and asserts the resulting data. It is opt-in via
 * RUN_DB_TESTS=1 (the default unit env points DATABASE_URL at a stub).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const readMigration = (dir: string) => readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8');

const ZERO_INIT = readMigration('0_init');
const DECOMMISSION = readMigration('20260915120000_decommission_higher_ed_litbang');

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

/** SQL state as it existed before the purge. */
const LEGACY_SEED = `
INSERT INTO units (id, name, type, address, updated_at) VALUES
  ('u-pt', 'PT Legacy', 'PERGURUAN_TINGGI', 'addr', now()),
  ('u-tk', 'Taman Kanak', 'TK_QURAN', 'addr', now());

INSERT INTO roles (id, code, name, realm, permissions, updated_at) VALUES
  ('r-pt-dosen', 'PT_DOSEN', 'Dosen', 'PERGURUAN_TINGGI', '[]'::jsonb, now()),
  ('r-pt-mhs', 'PT_MAHASISWA', 'Mahasiswa', 'PERGURUAN_TINGGI', '[]'::jsonb, now()),
  ('r-tkq', 'TKQ_GURU', 'Guru TKQ', 'TK_QURAN', '[]'::jsonb, now());

INSERT INTO users (id, name, email, role, is_active, unit_id, updated_at) VALUES
  ('user-pt-only', 'PT Only', 'pt-only@example.com', 'TEACHER', true, 'u-pt', now()),
  ('user-pt-only2', 'PT Only 2', 'pt-only2@example.com', 'STAFF', true, 'u-pt', now()),
  ('user-mixed', 'Mixed', 'mixed@example.com', 'STUDENT', true, NULL, now()),
  ('user-tkq', 'TKQ Guru', 'tkq@example.com', 'TEACHER', true, 'u-tk', now());

INSERT INTO user_role_assignments (id, user_id, role_id, is_primary, is_active, updated_at) VALUES
  ('a-pt-only', 'user-pt-only', 'r-pt-dosen', true, true, now()),
  ('a-pt-only2', 'user-pt-only2', 'r-pt-mhs', true, true, now()),
  ('a-mixed-pt', 'user-mixed', 'r-pt-dosen', true, true, now()),
  ('a-mixed-tkq', 'user-mixed', 'r-tkq', false, true, now()),
  ('a-tkq', 'user-tkq', 'r-tkq', true, true, now());

INSERT INTO refresh_tokens (id, token, user_id, expires_at) VALUES
  ('rt-pt-only', 'tok-pt-only', 'user-pt-only', now() + interval '30 days'),
  ('rt-pt-only2', 'tok-pt-only2', 'user-pt-only2', now() + interval '30 days'),
  ('rt-mixed', 'tok-mixed', 'user-mixed', now() + interval '30 days'),
  ('rt-tkq', 'tok-tkq', 'user-tkq', now() + interval '30 days');

-- Operational rows owned by each unit. The migration deletes the PT unit, so
-- every row that cannot outlive it must go too; the TK rows are the control
-- that proves the purge is scoped to PERGURUAN_TINGGI and not a wholesale wipe.
INSERT INTO departments (id, unit_id, code, name, updated_at) VALUES
  ('dep-pt', 'u-pt', 'DPT', 'Dept PT', now()),
  ('dep-tk', 'u-tk', 'DTK', 'Dept TK', now());

INSERT INTO book_categories (id, unit_id, name, code, updated_at) VALUES
  ('bc-pt', 'u-pt', 'Kategori PT', 'CPT', now()),
  ('bc-tk', 'u-tk', 'Kategori TK', 'CTK', now());
INSERT INTO books (id, unit_id, category_id, title, author, updated_at) VALUES
  ('bk-pt', 'u-pt', 'bc-pt', 'Buku PT', 'Penulis', now()),
  ('bk-tk', 'u-tk', 'bc-tk', 'Buku TK', 'Penulis', now());

INSERT INTO complaints (id, unit_id, category, subject, description, updated_at) VALUES
  ('cmp-pt', 'u-pt', 'FACILITY', 's', 'd', now()),
  ('cmp-tk', 'u-tk', 'FACILITY', 's', 'd', now());
`;

/** Rows that must be deleted because their unit is the PT unit. */
const PURGED_PT_ROWS: Array<[table: string, id: string]> = [
  ['units', 'u-pt'],
  ['departments', 'dep-pt'],
  ['book_categories', 'bc-pt'],
  ['books', 'bk-pt'],
  ['complaints', 'cmp-pt'],
];

/** Rows of a surviving unit that the purge must not touch. */
const KEPT_TK_ROWS: Array<[table: string, id: string]> = [
  ['units', 'u-tk'],
  ['departments', 'dep-tk'],
  ['book_categories', 'bc-tk'],
  ['books', 'bk-tk'],
  ['complaints', 'cmp-tk'],
];

interface UserState {
  id: string;
  role: string | null;
  assign_code: string | null;
  tokens: string;
}

describeDb('decommission migration — legacy PT sessions end', () => {
  const dbName = `cipansor_decommission_${Date.now()}`;
  const baseUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cipansor';
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
      await db.query(ZERO_INIT);
      await db.query(LEGACY_SEED);
      await db.query(DECOMMISSION);
    } finally {
      await db.end();
    }
  }, 120000);

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  const fetchUsers = async (): Promise<UserState[]> => {
    const db = new Client({ connectionString: targetUrl });
    await db.connect();
    try {
      const { rows } = await db.query<UserState>(`
        SELECT u.id,
               u.role::text AS role,
               r.code AS assign_code,
               (SELECT count(*) FROM refresh_tokens rt WHERE rt.user_id = u.id) AS tokens
        FROM users u
        LEFT JOIN user_role_assignments a
          ON a.user_id = u.id
         AND a.is_active
         AND (a.expires_at IS NULL OR a.expires_at > now())
        LEFT JOIN roles r ON r.id = a.role_id
        WHERE u.id LIKE 'user-%'
        ORDER BY u.id
      `);
      return rows;
    } finally {
      await db.end();
    }
  };

  it('revokes refresh tokens and nulls the legacy role for PT-only users', async () => {
    const rows = await fetchUsers();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    for (const id of ['user-pt-only', 'user-pt-only2']) {
      expect(byId[id], id).toBeDefined();
      expect(byId[id].tokens, `${id} tokens revoked`).toBe('0');
      // `users.role = NULL` is what makes refreshToken() take the rejecting
      // `else` branch instead of the legacy fallback.
      expect(byId[id].role, `${id} legacy role cleared`).toBeNull();
      expect(byId[id].assign_code, `${id} has no role`).toBeNull();
    }
  });

  it('keeps a user who retains an active non-PT role untouched', async () => {
    const rows = await fetchUsers();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId['user-mixed'].assign_code).toBe('TKQ_GURU');
    expect(byId['user-mixed'].tokens).toBe('1');
    expect(byId['user-mixed'].role).toBe('STUDENT');
  });

  it('keeps an unrelated non-PT user untouched', async () => {
    const rows = await fetchUsers();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId['user-tkq'].assign_code).toBe('TKQ_GURU');
    expect(byId['user-tkq'].tokens).toBe('1');
    expect(byId['user-tkq'].role).toBe('TEACHER');
  });

  it('leaves no PT role rows or PERGURUAN_TINGGI units behind', async () => {
    const db = new Client({ connectionString: targetUrl });
    await db.connect();
    try {
      const { rows: ptRoles } = await db.query(
        `SELECT count(*)::int AS n FROM roles WHERE code LIKE 'PT\\_%'`
      );
      expect(ptRoles[0].n).toBe(0);
      const { rows: ptUnits } = await db.query(
        `SELECT count(*)::int AS n FROM units WHERE type::text = 'PERGURUAN_TINGGI'`
      );
      expect(ptUnits[0].n).toBe(0);
    } finally {
      await db.end();
    }
  });

  // Owner decision (PR #505 review): the PT unit and its operational data are
  // removed outright, not re-typed. These cases pin the two halves of that: the
  // PT-owned rows are gone, and the sibling unit is untouched.
  it.each(PURGED_PT_ROWS)("deletes the PT unit's %s row", async (table, id) => {
    const db = new Client({ connectionString: targetUrl });
    await db.connect();
    try {
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE id = $1`, [
        id,
      ]);
      expect(rows[0].n).toBe(0);
    } finally {
      await db.end();
    }
  });

  it.each(KEPT_TK_ROWS)("keeps the surviving unit's %s row", async (table, id) => {
    const db = new Client({ connectionString: targetUrl });
    await db.connect();
    try {
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE id = $1`, [
        id,
      ]);
      expect(rows[0].n).toBe(1);
    } finally {
      await db.end();
    }
  });

  it('keeps PT users as accounts and detaches them from the deleted unit', async () => {
    // `users.unit_id` is SET NULL, not RESTRICT: the purge must not delete
    // user rows (that would take their refresh tokens with them and defeat the
    // section-4 logic). The account survives, detached.
    const db = new Client({ connectionString: targetUrl });
    await db.connect();
    try {
      const { rows } = await db.query<{ id: string; unit_id: string | null }>(
        `SELECT id, unit_id FROM users WHERE id LIKE 'user-pt%' ORDER BY id`
      );
      expect(rows.map((r) => r.id)).toEqual(['user-pt-only', 'user-pt-only2']);
      for (const row of rows) {
        expect(row.unit_id).toBeNull();
      }
    } finally {
      await db.end();
    }
  });
});
