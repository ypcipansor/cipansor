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

INSERT INTO users (id, name, email, role, is_active, updated_at) VALUES
  ('user-pt-only', 'PT Only', 'pt-only@example.com', 'TEACHER', true, now()),
  ('user-pt-only2', 'PT Only 2', 'pt-only2@example.com', 'STAFF', true, now()),
  ('user-mixed', 'Mixed', 'mixed@example.com', 'STUDENT', true, now()),
  ('user-tkq', 'TKQ Guru', 'tkq@example.com', 'TEACHER', true, now());

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
`;

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
});
