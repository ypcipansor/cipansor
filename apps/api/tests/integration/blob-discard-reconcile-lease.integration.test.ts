/**
 * Integration test for the reconciliation worker lease (finding 4).
 *
 * The scheduler runs on every API replica, so two replicas can select the same
 * `PENDING` row in one run. The lease is a single conditional `UPDATE` in
 * `claimRowForReconcile`; only a real Postgres can show that a second caller
 * matches zero rows while the first holds the lease. A unit test mocks the
 * conditional UPDATE and so cannot prove the mutual exclusion.
 *
 * Opt-in via `RUN_DB_TESTS=1` (`migrate deploy` must have run).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import {
  claimRowForReconcile,
  renewReconcileLease,
  BLOB_DISCARD_WORKER_ID,
} from '@/jobs/blob-discard-reconcile.job';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

const ROW_ID = 'lease-it-row-1';
const URL = 'https://store.blob.core.windows.net/cipansor-documents/lease-it.pdf';

function openClient(): Client {
  return new Client({ connectionString: process.env.DATABASE_URL });
}

describeDb('blob discard reconcile worker lease', () => {
  let client: Client;

  beforeAll(async () => {
    client = openClient();
    await client.connect();
  });

  afterAll(async () => {
    await client.query(`DELETE FROM "blob_claims" WHERE "id" = $1`, [ROW_ID]);
    await client.end();
  });

  beforeEach(async () => {
    await client.query(`DELETE FROM "blob_claims" WHERE "id" = $1`, [ROW_ID]);
    await client.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "operation_token",
          "created_at", "expires_at", "discarded_at", "reconcile_status", "reconcile_attempts")
       VALUES ($1, $2, 'DISCARD', 'u1', 'tok', now(), now() + interval '10 min',
               now() - interval '10 min', 'PENDING', 0)`,
      [ROW_ID, URL]
    );
  });

  it('lets exactly one caller hold a row at a time', async () => {
    expect(await claimRowForReconcile(ROW_ID)).toBe(true);
    // The lease is now held and unexpired: a second worker must be refused.
    expect(await claimRowForReconcile(ROW_ID)).toBe(false);
  });

  it('reclaims the row only after the lease has expired', async () => {
    expect(await claimRowForReconcile(ROW_ID)).toBe(true);
    expect(await claimRowForReconcile(ROW_ID)).toBe(false);

    // Simulate a crashed worker: its lease lapses without being renewed.
    await client.query(
      `UPDATE "blob_claims" SET "reconcile_lease_expires_at" = now() - interval '1 min'
        WHERE "id" = $1`,
      [ROW_ID]
    );

    expect(await claimRowForReconcile(ROW_ID)).toBe(true);
  });

  it('does not lease a row another replica already holds, even across processes', async () => {
    // A lease written by a DIFFERENT process retains its own owner string; the
    // lease predicate is what refuses the second worker, not a local id.
    await client.query(
      `UPDATE "blob_claims"
          SET "reconcile_lease_owner" = 'other-replica:999',
              "reconcile_lease_expires_at" = now() + interval '5 min'
        WHERE "id" = $1`,
      [ROW_ID]
    );

    expect(await claimRowForReconcile(ROW_ID)).toBe(false);
  });

  it('refuses a row that is not PENDING or not yet due', async () => {
    await client.query(`UPDATE "blob_claims" SET "reconcile_status" = 'DONE' WHERE "id" = $1`, [
      ROW_ID,
    ]);
    expect(await claimRowForReconcile(ROW_ID)).toBe(false);

    await client.query(
      `UPDATE "blob_claims"
          SET "reconcile_status" = 'PENDING',
              "next_reconcile_at" = now() + interval '1 hour'
        WHERE "id" = $1`,
      [ROW_ID]
    );
    expect(await claimRowForReconcile(ROW_ID)).toBe(false);
  });

  it('renews the lease for the owner and extends its expiry (finding D)', async () => {
    expect(await claimRowForReconcile(ROW_ID)).toBe(true);
    await client.query(
      `UPDATE "blob_claims" SET "reconcile_lease_expires_at" = now() + interval '1 min'
        WHERE "id" = $1`,
      [ROW_ID]
    );

    expect(await renewReconcileLease(ROW_ID)).toBe(true);

    const { rows } = await client.query(
      `SELECT "reconcile_lease_owner", "reconcile_lease_expires_at"
         FROM "blob_claims" WHERE "id" = $1`,
      [ROW_ID]
    );
    expect(rows[0].reconcile_lease_owner).toBe(BLOB_DISCARD_WORKER_ID);
    // Renewed well past the original one-minute expiry.
    expect(new Date(rows[0].reconcile_lease_expires_at).getTime()).toBeGreaterThan(
      Date.now() + 4 * 60 * 1000
    );
  });

  it('refuses to renew a lease held by another replica (finding D)', async () => {
    await client.query(
      `UPDATE "blob_claims"
          SET "reconcile_lease_owner" = 'other-replica:999',
              "reconcile_lease_expires_at" = now() + interval '5 min'
        WHERE "id" = $1`,
      [ROW_ID]
    );

    expect(await renewReconcileLease(ROW_ID)).toBe(false);

    const { rows } = await client.query(
      `SELECT "reconcile_lease_owner" FROM "blob_claims" WHERE "id" = $1`,
      [ROW_ID]
    );
    expect(rows[0].reconcile_lease_owner).toBe('other-replica:999');
  });
});
