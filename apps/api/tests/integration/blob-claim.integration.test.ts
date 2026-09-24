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
  markBlobReconcileDone,
  canonicalBlobClaimKey,
  type BlobClaimHandle,
} from '@/utils/blob-claim';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

const URL_A = 'https://store.blob.core.windows.net/cipansor-documents/race-a.pdf';
const URL_B = 'https://store.blob.core.windows.net/cipansor-documents/race-b.pdf';
const URL_C = 'https://store.blob.core.windows.net/cipansor-documents/race-c.pdf';

// The claim helper persists and reads the CANONICAL key (`azure://…`), not the
// raw URL. Raw SQL fixtures must therefore use the same key, or they insert a
// row the helper never contends with and the serialization test passes vacuously
// (it did: every raw-insert test "succeeded" without the discard ever blocking).
const KEY_A = canonicalBlobClaimKey(URL_A);
const KEY_B = canonicalBlobClaimKey(URL_B);
const KEY_C = canonicalBlobClaimKey(URL_C);

// SEVERE BUG regression fixtures: `a/./b` and `a/b` are physically DIFFERENT
// Azure blobs (a blob name is an object key), but the WHATWG URL parser used to
// collapse the first to the second, so a claim/delete for one serialized against
// — and could destroy — the other.
const URL_DOT = 'https://store.blob.core.windows.net/cipansor-documents/a/./b.pdf';
const URL_PLAIN = 'https://store.blob.core.windows.net/cipansor-documents/a/b.pdf';
const KEY_DOT = canonicalBlobClaimKey(URL_DOT);
const KEY_PLAIN = canonicalBlobClaimKey(URL_PLAIN);

const CLEANUP_KEYS = [KEY_A, KEY_B, KEY_C, KEY_DOT, KEY_PLAIN];

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
    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = ANY($1)`, [CLEANUP_KEYS]);
  });

  afterAll(async () => {
    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = ANY($1)`, [CLEANUP_KEYS]);
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
      [KEY_B]
    );

    const discardPromise = claimBlobForDiscard(URL_B, 'discard-holder');
    // While A is in flight the discard is blocked on the row lock.
    expect(await isPending(discardPromise, 300)).toBe(true);

    await clientA.query('COMMIT');
    expect(await discardPromise).toBeNull();

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [KEY_B]);
  });

  it('lets a create claim the blob when the blocking transaction rolls back', async () => {
    await clientA.query('BEGIN');
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "operation_token", "created_at", "expires_at")
       VALUES ('race-claim-2', $1, 'DISCARD', 'other-discard', 'tok-2', now(), now() + interval '10 minutes')`,
      [KEY_B]
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
      [KEY_A]
    );

    const claim = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(claim).not.toBeNull();
    const { rows } = await clientA.query(
      'SELECT kind, holder_id FROM "blob_claims" WHERE "blob_url" = $1',
      [KEY_A]
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

  it("a same-user DISCARD cannot take over that user's live RECORD claim", async () => {
    const record = await claimBlobForRecord(URL_A, 'same-user');
    expect(record).not.toBeNull();
    // Identical holder id, different operation kind: this must NOT be a takeover.
    expect(await claimBlobForDiscard(URL_A, 'same-user')).toBeNull();
    expect(await assertBlobClaimHeld(record as BlobClaimHandle)).toBe(true);
    await releaseBlobClaimById(record as BlobClaimHandle);
  });

  it("a same-user RECORD cannot take over that user's live DISCARD claim", async () => {
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
    const { rows } = await clientA.query('SELECT id FROM "blob_claims" WHERE "blob_url" = $1', [
      KEY_A,
    ]);
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
      [KEY_A]
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
    expect(await markBlobDiscarded({ ...discard!, operationToken: 'wrong-token' })).toBe(false);
    // The holder's first call wins...
    expect(await markBlobDiscarded(discard as BlobClaimHandle)).toBe(true);
    // ...and a second is a no-op: the row is already terminal.
    expect(await markBlobDiscarded(discard as BlobClaimHandle)).toBe(false);

    // An expired claim cannot be tombstoned either.
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "operation_token", "created_at", "expires_at")
       VALUES ('tombstone-expired', $1, 'DISCARD', 'discard-holder', 'tok-te', now() - interval '20 minutes', now() - interval '10 minutes')`,
      [KEY_A]
    );
    expect(
      await markBlobDiscarded({
        id: 'tombstone-expired',
        operationToken: 'tok-te',
        kind: 'DISCARD',
      })
    ).toBe(false);

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = ANY($1)`, [[KEY_A, KEY_B]]);
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

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [KEY_A]);
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
      [KEY_A]
    );
    expect(rows[0].count).toBe(1);
    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [KEY_A]);
  });

  // ── SEVERE BUG: distinct blobs must not share a claim row ──────────────────

  it('does NOT collapse `a/./b` onto `a/b` — distinct blobs hold distinct claims', async () => {
    // A blob name is an object key, not a filesystem path: `a/./b` and `a/b` are
    // two physical objects. The URL parser used to remove the `.` segment, giving
    // both the same `azure://…` key; a claim (and the discard behind it) then
    // serialized against, and could delete, the WRONG blob.
    expect(KEY_DOT).not.toBe(KEY_PLAIN);
    expect(KEY_DOT).toBe('azure://store/cipansor-documents/a/./b.pdf');
    expect(KEY_PLAIN).toBe('azure://store/cipansor-documents/a/b.pdf');

    const dotClaim = await claimBlobForRecord(URL_DOT, 'author-dot');
    expect(dotClaim).not.toBeNull();
    const plainClaim = await claimBlobForRecord(URL_PLAIN, 'author-plain');
    expect(plainClaim).not.toBeNull();
    expect(plainClaim!.id).not.toBe(dotClaim!.id);

    const { rows } = await clientA.query(
      'SELECT count(*)::int AS count FROM "blob_claims" WHERE "blob_url" = ANY($1)',
      [[KEY_DOT, KEY_PLAIN]]
    );
    expect(rows[0].count).toBe(2);

    await releaseBlobClaimById(dotClaim as BlobClaimHandle);
    await releaseBlobClaimById(plainClaim as BlobClaimHandle);
    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = ANY($1)`, [
      [KEY_DOT, KEY_PLAIN],
    ]);
  });

  it('a discard for `a/./b` does not touch the claim on `a/b`', async () => {
    // The discard's mutual exclusion must key on the exact blob it is deleting.
    // Before the fix it keyed on the collapsed `a/b`, so it would either block on
    // (and then be free to delete) the unrelated `a/b` blob.
    const plainClaim = await claimBlobForRecord(URL_PLAIN, 'author-plain');
    expect(plainClaim).not.toBeNull();

    const dotDiscard = await claimBlobForDiscard(URL_DOT, 'discard-holder');
    expect(dotDiscard).not.toBeNull();
    await releaseBlobClaimById(dotDiscard as BlobClaimHandle);

    // The unrelated `a/b` claim is untouched.
    expect(await assertBlobClaimHeld(plainClaim as BlobClaimHandle)).toBe(true);

    await releaseBlobClaimById(plainClaim as BlobClaimHandle);
    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = ANY($1)`, [
      [KEY_DOT, KEY_PLAIN],
    ]);
  });

  // ── Finding 4: terminal DONE after a successful physical delete ────────────

  it('marks a tombstoned claim DONE for the exact operation that holds it (finding 4a)', async () => {
    const discard = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(discard).not.toBeNull();
    expect(await markBlobDiscarded(discard as BlobClaimHandle)).toBe(true);

    expect(await markBlobReconcileDone(discard as BlobClaimHandle)).toBe(true);

    const { rows } = await clientA.query(
      'SELECT reconcile_status AS status, reconciled_at AS at, next_reconcile_at AS next FROM "blob_claims" WHERE "id" = $1',
      [discard!.id]
    );
    expect(rows[0]).toMatchObject({ status: 'DONE', next: null });
    expect(rows[0].at).not.toBeNull();
    // The tombstone is preserved: marking DONE must not reopen the URL.
    const tomb = await clientA.query(
      'SELECT discarded_at AS "discardedAt" FROM "blob_claims" WHERE "id" = $1',
      [discard!.id]
    );
    expect(tomb.rows[0].discardedAt).not.toBeNull();

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [KEY_A]);
  });

  it('refuses to mark DONE for a mismatched token or an untombstoned claim (finding 4f)', async () => {
    const discard = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(discard).not.toBeNull();

    // Not tombstoned yet: a stale operation must not resolve the lifecycle.
    expect(await markBlobReconcileDone(discard as BlobClaimHandle)).toBe(false);

    // Tombstoned by the true owner...
    expect(await markBlobDiscarded(discard as BlobClaimHandle)).toBe(true);
    // ...but a mismatched token cannot resolve it.
    expect(await markBlobReconcileDone({ ...discard!, operationToken: 'stale-token' })).toBe(false);

    // The true owner still can.
    expect(await markBlobReconcileDone(discard as BlobClaimHandle)).toBe(true);

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [KEY_A]);
  });

  it('a DONE row is no longer eligible for reconciliation (finding 4d)', async () => {
    const discard = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(await markBlobDiscarded(discard as BlobClaimHandle)).toBe(true);
    expect(await markBlobReconcileDone(discard as BlobClaimHandle)).toBe(true);

    // Simulate the worker's selection filter; the row must not be returned.
    const { rows } = await clientA.query(
      `SELECT id FROM "blob_claims"
        WHERE "discarded_at" IS NOT NULL
          AND "reconcile_status" = 'PENDING'::"BlobReconcileStatus"
          AND "id" = $1`,
      [discard!.id]
    );
    expect(rows).toHaveLength(0);

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [KEY_A]);
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
      [KEY_C]
    );

    // Cleanup's discard claim blocks on the row while the writer is open.
    const cleanup = claimBlobForDiscard(URL_C, 'system:cleanup');
    expect(await isPending(cleanup, 300)).toBe(true);

    // Writer commits the record; cleanup now sees a live claim and refuses.
    await clientA.query('COMMIT');
    expect(await cleanup).toBeNull();

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [KEY_C]);
  });
});
