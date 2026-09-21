/**
 * WBS tracking-token digest migration — real PostgreSQL.
 *
 * The `20260921140000_wbs_tracking_token_digest` migration invalidates any
 * stored tracking token that is not already a 64-hex digest, so a pre-digest
 * row cannot be mistaken for a valid channel. This runs the real SQL against a
 * real table: a mock cannot prove a regex in a `WHERE` clause, and this is the
 * one place the legacy-data strategy is actually decided.
 *
 * Opt-in via RUN_DB_TESTS=1.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const CUTOFF = '20260921140000_wbs_tracking_token_digest';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const DIGEST = 'a'.repeat(64);

const SEED = `
INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-issuer', 'Pengawas', 'pengawas@example.com', true, now());

INSERT INTO wbs_reports
  (id, ticket_code, tracking_token, category, target_level, subject, description, primary_handler_role, updated_at) VALUES
  ('r-legacy',  'WBS-202601-AAAAAA', 'raw-bearer-token-value-1234', 'KEUANGAN_ASET', 'PENGURUS_YAYASAN', 'Subjek', 'Deskripsi laporan.', 'YAYASAN_PENGAWAS', now()),
  ('r-digest',  'WBS-202601-BBBBBB', '${DIGEST}',                    'KEUANGAN_ASET', 'PENGURUS_YAYASAN', 'Subjek', 'Deskripsi laporan.', 'YAYASAN_PENGAWAS', now());
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

describeDb('wbs tracking-token digest migration (real PostgreSQL)', () => {
  const dbName = `cipansor_wbs_digest_${Date.now()}`;
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
        if (dir >= CUTOFF) continue;
        await db.query(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'));
      }
      await db.query(SEED);
      await db.query(readFileSync(join(MIGRATIONS, CUTOFF, 'migration.sql'), 'utf8'));
    });
  }, 180_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  it('replaces a raw legacy token with an unusable marker', async () => {
    await withClient(targetUrl, async (db) => {
      const row = await db.query(
        `SELECT tracking_token FROM wbs_reports WHERE id = 'r-legacy'`
      );
      expect(row.rows[0].tracking_token).toBe('LEGACY-INVALIDATED');
    });
  });

  it('leaves an already-digested token untouched', async () => {
    await withClient(targetUrl, async (db) => {
      const row = await db.query(
        `SELECT tracking_token FROM wbs_reports WHERE id = 'r-digest'`
      );
      expect(row.rows[0].tracking_token).toBe(DIGEST);
    });
  });
});
