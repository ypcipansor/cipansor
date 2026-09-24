/**
 * Integration test for the email-normalization migration
 * (`prisma/migrations/20260915060000_users_email_lower_unique`).
 *
 * The migration previously failed to apply **even on an empty database**:
 * `string_agg(id, ...)` was nested directly inside another `string_agg(...)`,
 * which Postgres rejects ("aggregate function calls cannot be nested"). Unit
 * tests mock the database and never caught it, so this suite runs the actual
 * SQL against a real Postgres via the `pg` driver.
 *
 * Opt-in like the other DB suites (`RUN_DB_TESTS=1`); the unit-test env points
 * DATABASE_URL at an unreachable stub.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

const MIGRATION_PATH = join(
  __dirname,
  '../../prisma/migrations/20260915060000_users_email_lower_unique/migration.sql'
);
const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');

/** A dedicated schema, so the destructive DROP never touches `public.users`. */
const TEST_SCHEMA = 'email_migration_test';

/** A minimal `users` table — enough for the migration's normalization logic. */
const SETUP_SQL = `
  CREATE TABLE IF NOT EXISTS "users" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

async function withClient(fn: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Every connection needs its own search_path; `SET` is session-scoped and
    // this helper opens a fresh client. Without it the migration would touch
    // `public.users` in the shared database.
    await client.query(`SET search_path TO ${TEST_SCHEMA}`);
    await fn(client);
  } finally {
    await client.end();
  }
}

describeDb('users email normalization migration', () => {
  beforeAll(async () => {
    await withClient(async (client) => {
      // Drop first: an earlier run may have left a table with the old shape.
      await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
      await client.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
      await client.query(SETUP_SQL);
    });
  });

  afterAll(async () => {
    await withClient(async (client) => {
      await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    });
  });

  beforeEach(async () => {
    await withClient(async (client) => {
      await client.query('DROP TABLE IF EXISTS "users"');
      await client.query(SETUP_SQL);
    });
  });

  it('applies on an empty table (the nested-aggregate regression)', async () => {
    // Before the fix this threw 42803 "aggregate function calls cannot be
    // nested" — the migration could never deploy, empty database included.
    await withClient(async (client) => {
      await expect(client.query(migrationSql)).resolves.toBeDefined();
      const index = await client.query(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = '${TEST_SCHEMA}'
            AND tablename = 'users' AND indexname = 'users_email_lower_key'`
      );
      expect(index.rows).toHaveLength(1);
    });
  });

  it('normalizes mixed case and surrounding whitespace in place', async () => {
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "name", "email") VALUES
           ('u1', 'A', 'Guru@Cipansor.or.id'),
           ('u2', 'B', '  Bendahara@Cipansor.or.id  '),
           ('u3', 'C', 'kepsek@cipansor.or.id')`
      );

      await client.query(migrationSql);

      const { rows } = await client.query('SELECT id, email FROM "users" ORDER BY id');
      expect(rows).toEqual([
        { id: 'u1', email: 'guru@cipansor.or.id' },
        { id: 'u2', email: 'bendahara@cipansor.or.id' },
        { id: 'u3', email: 'kepsek@cipansor.or.id' },
      ]);
    });
  });

  it('fails closed BEFORE the UPDATE when two accounts normalize to the same address', async () => {
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "name", "email") VALUES
           ('u1', 'A', 'Guru@Cipansor.or.id'),
           ('u2', 'B', '  guru@cipansor.or.id  ')`
      );

      // The whole migration runs as one implicit transaction; the DO block
      // raises first, so the UPDATE / CREATE UNIQUE INDEX never run and the
      // table is left untouched.
      await expect(client.query(migrationSql)).rejects.toThrow(
        /beberapa alamat dimiliki lebih dari satu akun/
      );

      // Both original values survive: the failure is explicit, not a partial
      // normalization caught later by the unique index.
      const { rows } = await client.query('SELECT id, email FROM "users" ORDER BY id');
      expect(rows).toEqual([
        { id: 'u1', email: 'Guru@Cipansor.or.id' },
        { id: 'u2', email: '  guru@cipansor.or.id  ' },
      ]);

      const index = await client.query(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = '${TEST_SCHEMA}'
            AND tablename = 'users' AND indexname = 'users_email_lower_key'`
      );
      expect(index.rows).toHaveLength(0);
    });
  });

  it('names the colliding account ids in the failure message', async () => {
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "name", "email") VALUES
           ('acct-aaa', 'A', 'Guru@cipansor.or.id'),
           ('acct-bbb', 'B', 'guru@cipansor.or.id')`
      );

      let message = '';
      try {
        await client.query(migrationSql);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('guru@cipansor.or.id');
      expect(message).toContain('acct-aaa');
      expect(message).toContain('acct-bbb');
    });
  });

  it('rejects a new duplicate that differs only by case or whitespace', async () => {
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "name", "email") VALUES ('u1', 'A', 'a@b.id')`
      );
      await client.query(migrationSql);

      await expect(
        client.query(`INSERT INTO "users" ("id", "name", "email") VALUES ('u2', 'B', '  A@B.id  ')`)
      ).rejects.toThrow(/users_email_lower_key|duplicate key/);
    });
  });
});
