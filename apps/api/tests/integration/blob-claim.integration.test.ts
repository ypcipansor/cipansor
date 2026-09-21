/**
 * Integration tests for the blob-claim protocol against a real Postgres.
 *
 * The protocol's whole claim to correctness is that writers and cleanup
 * serialize on the same UNIQUE `blob_claims.blob_url` row, and that a claim is
 * identified by a per-operation token rather than a user id. A mocked unit test
 * cannot show that two concurrent transactions actually block on each other —
 * only a real database can.
 *
 * Opt-in via `RUN_DB_TESTS=1`. Requires the `blob_claims` migration to have
 * been applied (`prisma migrate deploy`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import {
  claimBlobForRecord,
  claimBlobForDiscard,
  releaseBlobClaimById,
  markBlobDiscarded,
  assertBlobClaimHeld,
  type BlobClaimHandle,
} from '@/utils/blob-claim';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

const URL_A = 'https://store.blob.core.windows.net/cipansor-documents/race-a.pdf';
const URL_B = 'https://store.blob.core.windows.net/cipansor-documents/race-b.pdf';
const URL_C = 'https://store.blob.core.windows.net/cipansor-documents/race-c.pdf';

function openClient(): Client {
  return new Client({ connectionString: process.env.DATABASE_URL });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when `promise` has not settled after `ms`. */
async function isPending<T>(promise: Promise<T>, ms: number): Promise<boolean> {
  const marker = Symbol('pending');
  const result = await Promise.race([
    promise.then(() => 'settled' as const),
    sleep(ms).then(() => marker),
  ]);
  return result === marker;
}

describeDb('BlobClaim protocol', () => {
  let clientA: Client;

  beforeAll(async () => {
    clientA = openClient();
    await clientA.connect();
    await clientA.query(
      `DELETE FROM "blob_claims" WHERE "blob_url" = ANY($1)`,
      [[URL_A, URL_B, URL_C]]
    );
  });

  afterAll(async () => {
    await clientA.query(
      `DELETE FROM "blob_claims" WHERE "blob_url" = ANY($1)`,
      [[URL_A, URL_B, URL_C]]
    );
    await clientA.end();
  });

  it('a committed record claim blocks a discard', async () => {
    const claim = await claimBlobForRecord(URL_A, 'author-1');
    expect(claim).not.toBeNull();
    // A concurrent discard cannot take over a live claim held by another actor.
    expect(await claimBlobForDiscard(URL_A, 'discard-holder')).toBeNull();
    await releaseBlobClaimById(claim as BlobClaimHandle);
    // Once released, the discard can proceed.
    const discard = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(discard).not.toBeNull();
    await releaseBlobClaimById(discard as BlobClaimHandle);
  });

  it('a live discard claim blocks a create-record', async () => {
    const discard = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(discard).not.toBeNull();
    // The create path must refuse rather than save a reference to a blob the
    // discard may already be deleting.
    expect(await claimBlobForRecord(URL_A, 'author-1')).toBeNull();
    await releaseBlobClaimById(discard as BlobClaimHandle);
    // Released: the create can claim again.
    const claim = await claimBlobForRecord(URL_A, 'author-1');
    expect(claim).not.toBeNull();
    await releaseBlobClaimById(claim as BlobClaimHandle);
  });

  it('serializes concurrent transactions on the claim row (create holds, discard waits)', async () => {
    await clientA.query('BEGIN');
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "operation_token", "created_at", "expires_at")
       VALUES ('race-claim-1', $1, 'RECORD', 'author-tx', 'tok-1', now(), now() + interval '10 minutes')`,
      [URL_B]
    );

    const discardPromise = claimBlobForDiscard(URL_B, 'discard-holder');
    // While A is in flight the discard is blocked on the row lock.
    expect(await isPending(discardPromise, 300)).toBe(true);

    await clientA.query('COMMIT');
    expect(await discardPromise).toBeNull();

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [URL_B]);
  });

  it('lets a create claim the blob when the blocking transaction rolls back', async () => {
    await clientA.query('BEGIN');
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "operation_token", "created_at", "expires_at")
       VALUES ('race-claim-2', $1, 'DISCARD', 'other-discard', 'tok-2', now(), now() + interval '10 minutes')`,
      [URL_B]
    );

    const recordPromise = claimBlobForRecord(URL_B, 'author-tx');
    expect(await isPending(recordPromise, 300)).toBe(true);

    await clientA.query('ROLLBACK');
    const claim = await recordPromise;
    expect(claim).not.toBeNull();
    await releaseBlobClaimById(claim as BlobClaimHandle);
  });

  it('an expired claim is taken over instead of pinning the orphan forever', async () => {
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "operation_token", "created_at", "expires_at")
       VALUES ('expired-claim', $1, 'RECORD', 'crashed-author', 'tok-e', now() - interval '20 minutes', now() - interval '10 minutes')`,
      [URL_A]
    );

    const claim = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(claim).not.toBeNull();
    const { rows } = await clientA.query(
      'SELECT kind, holder_id FROM "blob_claims" WHERE "blob_url" = $1',
      [URL_A]
    );
    expect(rows[0]).toEqual({ kind: 'DISCARD', holder_id: 'discard-holder' });
    await releaseBlobClaimById(claim as BlobClaimHandle);
  });

  it('the same operation can refresh its own claim (idempotent retry)', async () => {
    const first = await claimBlobForDiscard(URL_A, 'same-holder');
    expect(first).not.toBeNull();
    const second = await claimBlobForDiscard(URL_A, 'same-holder', {
      id: (first as BlobClaimHandle).id,
      operationToken: (first as BlobClaimHandle).operationToken,
    });
    expect(second).not.toBeNull();
    // Refreshing keeps the SAME row, with a rotated token.
    expect(second!.id).toBe(first!.id);
    expect(second!.operationToken).not.toBe(first!.operationToken);
    await releaseBlobClaimById(second as BlobClaimHandle);
  });

  // ── Finding D: same-user operations must not take each other over ──────────

  it('a same-user DISCARD cannot take over that user\'s live RECORD claim', async () => {
    const record = await claimBlobForRecord(URL_A, 'same-user');
    expect(record).not.toBeNull();
    // Identical holder id, different operation kind: this must NOT be a takeover.
    expect(await claimBlobForDiscard(URL_A, 'same-user')).toBeNull();
    expect(await assertBlobClaimHeld(record as BlobClaimHandle)).toBe(true);
    await releaseBlobClaimById(record as BlobClaimHandle);
  });

  it('a same-user RECORD cannot take over that user\'s live DISCARD claim', async () => {
    const discard = await claimBlobForDiscard(URL_A, 'same-user');
    expect(discard).not.toBeNull();
    // The create must refuse (or wait out) the same user's own discard.
    expect(await claimBlobForRecord(URL_A, 'same-user')).toBeNull();
    expect(await assertBlobClaimHeld(discard as BlobClaimHandle)).toBe(true);
    await releaseBlobClaimById(discard as BlobClaimHandle);
  });

  it('a stale release cannot delete a newer claim on the same URL', async () => {
    const first = await claimBlobForDiscard(URL_A, 'holder');
    expect(first).not.toBeNull();
    // Release using the OLD handle after a newer claim has replaced it.
    await releaseBlobClaimById(first as BlobClaimHandle);

    const second = await claimBlobForDiscard(URL_A, 'holder');
    expect(second).not.toBeNull();
    // Releasing the stale handle again must be a no-op against the new claim.
    await releaseBlobClaimById(first as BlobClaimHandle);
    const { rows } = await clientA.query(
      'SELECT id FROM "blob_claims" WHERE "blob_url" = $1',
      [URL_A]
    );
    expect(rows[0].id).toBe(second!.id);
    await releaseBlobClaimById(second as BlobClaimHandle);
  });

  it('a release with a mismatched operation token is refused', async () => {
    const claim = await claimBlobForDiscard(URL_A, 'holder');
    expect(claim).not.toBeNull();
    await releaseBlobClaimById({ ...claim!, operationToken: 'not-the-token' });
    expect(await assertBlobClaimHeld(claim as BlobClaimHandle)).toBe(true);
    await releaseBlobClaimById(claim as BlobClaimHandle);
  });

  // ── Expiry / takeover / tombstone ─────────────────────────────────────────

  it('an expired same-kind claim is taken over and rotates its token', async () => {
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "operation_token", "created_at", "expires_at")
       VALUES ('expired-discard', $1, 'DISCARD', 'holder', 'old-token', now() - interval '20 minutes', now() - interval '10 minutes')`,
      [URL_A]
    );
    const claim = await claimBlobForDiscard(URL_A, 'holder');
    expect(claim).not.toBeNull();
    expect(claim!.operationToken).not.toBe('old-token');
    await releaseBlobClaimById(claim as BlobClaimHandle);
  });

  it('markBlobDiscarded only succeeds for the exact holder+token, and only once', async () => {
    const discard = await claimBlobForDiscard(URL_B, 'discard-holder');
    expect(discard).not.toBeNull();

    // A mismatched token cannot tombstone.
    expect(
      await markBlobDiscarded({ ...discard!, operationToken: 'wrong-token' })
    ).toBe(false);
    // The holder's first call wins...
    expect(await markBlobDiscarded(discard as BlobClaimHandle)).toBe(true);
    // ...and a second is a no-op: the row is already terminal.
    expect(await markBlobDiscarded(discard as BlobClaimHandle)).toBe(false);

    // An expired claim cannot be tombstoned either.
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "operation_token", "created_at", "expires_at")
       VALUES ('tombstone-expired', $1, 'DISCARD', 'discard-holder', 'tok-te', now() - interval '20 minutes', now() - interval '10 minutes')`,
      [URL_A]
    );
    expect(
      await markBlobDiscarded({
        id: 'tombstone-expired',
        operationToken: 'tok-te',
        kind: 'DISCARD',
      })
    ).toBe(false);

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = ANY($1)`, [
      [URL_A, URL_B],
    ]);
  });

  it('a tombstone cannot be reclaimed, not even by the same operation (finding D.5)', async () => {
    const discard = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(discard).not.toBeNull();
    expect(await markBlobDiscarded(discard as BlobClaimHandle)).toBe(true);

    // A create arriving now must refuse immediately.
    const started = Date.now();
    expect(await claimBlobForRecord(URL_A, 'author-1')).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);

    // A second discard cannot re-open it, with or without the old token.
    expect(await claimBlobForDiscard(URL_A, 'discard-holder')).toBeNull();
    expect(
      await claimBlobForDiscard(URL_A, 'discard-holder', {
        id: discard!.id,
        operationToken: discard!.operationToken,
      })
    ).toBeNull();

    // Even once the tombstoned row's TTL lapses it stays terminal.
    await clientA.query(
      `UPDATE "blob_claims" SET "expires_at" = now() - interval '1 hour' WHERE "id" = $1`,
      [discard!.id]
    );
    expect(await claimBlobForRecord(URL_A, 'author-1')).toBeNull();

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [URL_A]);
  });

  it('a create waits out a live discard claim instead of failing', async () => {
    const discard = await claimBlobForDiscard(URL_B, 'discard-holder');
    expect(discard).not.toBeNull();

    setTimeout(() => {
      void releaseBlobClaimById(discard as BlobClaimHandle);
    }, 150);

    const claim = await claimBlobForRecord(URL_B, 'author-1');
    expect(claim).not.toBeNull();
    await releaseBlobClaimById(claim as BlobClaimHandle);
  });

  it('a create does NOT wait out a claim held by another record', async () => {
    const first = await claimBlobForRecord(URL_B, 'author-1');
    expect(first).not.toBeNull();
    const started = Date.now();
    expect(await claimBlobForRecord(URL_B, 'author-2')).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
    await releaseBlobClaimById(first as BlobClaimHandle);
  });

  it('only one blob URL can ever hold one claim row', async () => {
    await claimBlobForRecord(URL_A, 'author-1');
    await claimBlobForRecord(URL_A, 'author-2'); // blocked, no second row
    const { rows } = await clientA.query(
      'SELECT count(*)::int AS count FROM "blob_claims" WHERE "blob_url" = $1',
      [URL_A]
    );
    expect(rows[0].count).toBe(1);
    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [URL_A]);
  });

  // ── A/B: cleanup-vs-create with a real Postgres transaction ────────────────

  it('cleanup (discard) cannot win while a create-record transaction is open, and the create survives it (BUG 9)', async () => {
    // Simulate the create-record writer: open a transaction that inserts the
    // record's claim and holds it (as a real writer would inside its tx).
    await clientA.query('BEGIN');
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "operation_token", "created_at", "expires_at")
       VALUES ('cleanup-vs-create', $1, 'RECORD', 'author', 'tok-c', now(), now() + interval '10 minutes')`,
      [URL_C]
    );

    // Cleanup's discard claim blocks on the row while the writer is open.
    const cleanup = claimBlobForDiscard(URL_C, 'system:cleanup');
    expect(await isPending(cleanup, 300)).toBe(true);

    // Writer commits the record; cleanup now sees a live claim and refuses.
    await clientA.query('COMMIT');
    expect(await cleanup).toBeNull();

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [URL_C]);
  });
});
