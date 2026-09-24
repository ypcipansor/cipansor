/**
 * Integration test for `prisma/scripts/normalize-emails.ts`.
 *
 * The pre-deploy check is load-bearing: migration
 * `20260915060000_users_email_lower_unique` deliberately fails on a collision,
 * so this script must detect collisions, never merge accounts, normalize
 * safely and be idempotent. Unit tests cannot prove that against Postgres
 * semantics (`lower(trim(...))`, transaction rollback), so this suite runs the
 * real SQL.
 *
 * Opt-in like the other DB suites (`RUN_DB_TESTS=1`); the unit-test env points
 * DATABASE_URL at an unreachable stub.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import { normalizeEmails, type NormalizeEmailsClient } from '../../prisma/scripts/normalize-emails';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

const TEST_SCHEMA = 'normalize_emails_test';

const SETUP_SQL = `
  CREATE TABLE IF NOT EXISTS "users" (
    "id" text PRIMARY KEY,
    "email" text NOT NULL
  );
`;

async function withClient(fn: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`SET search_path TO ${TEST_SCHEMA}`);
    await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Adapts a `pg` Client to the tiny surface `normalizeEmails` needs, with the
 * schema pinned on the session. The script issues tagged-template queries with
 * no interpolation, so joining the strings is exact.
 */
function adapter(client: Client) {
  const $queryRaw = async (
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const text: string = values.reduce(
      (sql: string, _value, i) => `${sql}$${i + 1}${query[i + 1] ?? ''}`,
      query[0] ?? ''
    );
    const res = await client.query(text, values as never[]);
    return res.rows as unknown[];
  };

  return {
    $queryRaw,
    $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
    user: {
      update: ({ where, data }: { where: { id: string }; data: { email: string } }) =>
        client.query('UPDATE "users" SET email = $1 WHERE id = $2', [data.email, where.id]),
    },
  } as unknown as NormalizeEmailsClient;
}

describeDb('normalize-emails pre-deploy script', () => {
  beforeAll(async () => {
    await withClient(async (client) => {
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

  it('reports a collision and writes nothing (never merges accounts)', async () => {
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "email") VALUES
           ('u1', 'Guru@Cipansor.or.id'),
           ('u2', '  guru@cipansor.or.id  ')`
      );

      const result = await normalizeEmails(adapter(client));

      expect(result.collisions).toEqual([{ normalized: 'guru@cipansor.or.id', count: 2 }]);
      expect(result.wrote).toBe(false);

      // Both rows survive untouched — the abort happens before any UPDATE.
      const { rows } = await client.query('SELECT id, email FROM "users" ORDER BY id');
      expect(rows).toEqual([
        { id: 'u1', email: 'Guru@Cipansor.or.id' },
        { id: 'u2', email: '  guru@cipansor.or.id  ' },
      ]);
    });
  });

  it('normalizes mixed case / whitespace and is idempotent on a rerun', async () => {
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "email") VALUES
           ('u1', 'Guru@Cipansor.or.id'),
           ('u2', '  Bendahara@Cipansor.or.id  ')`
      );

      const first = await normalizeEmails(adapter(client));
      expect(first.wrote).toBe(true);
      expect(first.normalized).toHaveLength(2);

      const { rows } = await client.query('SELECT id, email FROM "users" ORDER BY id');
      expect(rows).toEqual([
        { id: 'u1', email: 'guru@cipansor.or.id' },
        { id: 'u2', email: 'bendahara@cipansor.or.id' },
      ]);

      // Rerun is a no-op: nothing left to normalize, no collisions.
      const second = await normalizeEmails(adapter(client));
      expect(second.wrote).toBe(false);
      expect(second.normalized).toHaveLength(0);
      expect(second.collisions).toHaveLength(0);
    });
  });

  it('--dry-run reports but does not write', async () => {
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "email") VALUES ('u1', 'Guru@Cipansor.or.id')`
      );

      const result = await normalizeEmails(adapter(client), { dryRun: true });
      expect(result.wrote).toBe(false);
      expect(result.normalized).toEqual([
        { email: 'Guru@Cipansor.or.id', next: 'guru@cipansor.or.id' },
      ]);

      const { rows } = await client.query('SELECT email FROM "users"');
      expect(rows[0].email).toBe('Guru@Cipansor.or.id');
    });
  });
});
