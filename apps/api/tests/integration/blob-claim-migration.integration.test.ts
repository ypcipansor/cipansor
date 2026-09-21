/**
 * Integration test for the blob-claim operation-token / reconciliation migration
 * (`prisma/migrations/20260921170000_blob_claim_operation_token_and_reconcile`).
 *
 * The migration originally minted `operation_token` with
 * `encode(gen_random_bytes(32), 'hex')`. `gen_random_bytes` belongs to the
 * pgcrypto extension and NO migration in this repo creates it, so
 * `prisma migrate deploy` failed on an empty database — the exact "must replay
 * from empty" guarantee the 0_init squash exists to provide. Unit tests mock
 * the database and could never catch it, so this suite runs the real SQL against
 * a real Postgres via the `pg` driver.
 *
 * Opt-in like the other DB suites (`RUN_DB_TESTS=1`); the unit-test env points
 * DATABASE_URL at an unreachable stub.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

const CLAIM_TABLE_MIGRATION = readFileSync(
  join(__dirname, '../../prisma/migrations/20260915070000_blob_claims/migration.sql'),
  'utf8'
);
const TOMBSTONE_MIGRATION = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260917000000_blob_claims_discarded_tombstone/migration.sql'
  ),
  'utf8'
);
const OPERATION_TOKEN_MIGRATION = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260921170000_blob_claim_operation_token_and_reconcile/migration.sql'
  ),
  'utf8'
);

/** A dedicated schema, so the destructive setup never touches `public`. */
const TEST_SCHEMA = 'blob_claim_migration_test';

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

/** Build the `blob_claims` table the earlier migrations leave behind. */
async function applyPrereqs(client: Client): Promise<void> {
  await client.query(CLAIM_TABLE_MIGRATION);
  await client.query(TOMBSTONE_MIGRATION);
}

describeDb('blob claim operation-token migration', () => {
  beforeAll(async () => {
    await withClient(async (client) => {
      await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
      await client.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    });
  });

  afterAll(async () => {
    await withClient(async (client) => {
      await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    });
  });

  beforeEach(async () => {
    await withClient(async (client) => {
      await client.query(`DROP TABLE IF EXISTS "blob_claims"`);
      await client.query(`DROP TYPE IF EXISTS "BlobReconcileStatus"`);
      await client.query(`DROP TYPE IF EXISTS "BlobClaimKind"`);
      await applyPrereqs(client);
    });
  });

  it('applies without the pgcrypto extension (the gen_random_bytes regression)', async () => {
    await withClient(async (client) => {
      // Prove the extension is genuinely absent, so the assertion below is not
      // accidentally passing because some other bootstrap created it.
      const ext = await client.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'`
      );
      expect(ext.rows).toHaveLength(0);

      await expect(client.query(OPERATION_TOKEN_MIGRATION)).resolves.toBeDefined();
    });
  });

  it('mints a 64-hex-char operation token per row, and distinct tokens for two rows', async () => {
    await withClient(async (client) => {
      await client.query(OPERATION_TOKEN_MIGRATION);
      await client.query(
        `INSERT INTO "blob_claims" ("id", "blob_url", "kind", "holder_id", "expires_at")
         VALUES ('a', '/uploads/one.pdf', 'RECORD', 'u1', now() + interval '5 min'),
                ('b', '/uploads/two.pdf', 'RECORD', 'u1', now() + interval '5 min')`
      );
      const { rows } = await client.query(
        `SELECT "operation_token" AS token FROM "blob_claims" ORDER BY "id"`
      );
      for (const row of rows) {
        expect(row.token).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(rows[0].token).not.toBe(rows[1].token);
    });
  });

  it('defaults reconcile_status to PENDING and the retry counters to zero', async () => {
    await withClient(async (client) => {
      await client.query(OPERATION_TOKEN_MIGRATION);
      await client.query(
        `INSERT INTO "blob_claims" ("id", "blob_url", "kind", "holder_id", "expires_at")
         VALUES ('c', '/uploads/three.pdf', 'DISCARD', 'u1', now() + interval '5 min')`
      );
      const { rows } = await client.query(
        `SELECT "reconcile_status" AS status, "reconcile_attempts" AS attempts,
                "reconciled_at" AS reconciled, "next_reconcile_at" AS next
         FROM "blob_claims" WHERE "id" = 'c'`
      );
      expect(rows[0]).toMatchObject({
        status: 'PENDING',
        attempts: 0,
        reconciled: null,
        next: null,
      });
    });
  });

  it('is idempotent-safe: the reconcile partial index exists after apply', async () => {
    await withClient(async (client) => {
      await client.query(OPERATION_TOKEN_MIGRATION);
      const { rows } = await client.query(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = '${TEST_SCHEMA}' AND tablename = 'blob_claims'
            AND indexname = 'blob_claims_reconcile_status_next_reconcile_at_idx'`
      );
      expect(rows).toHaveLength(1);
    });
  });
});
