/**
 * Integration tests for the blob-claim protocol (BUG 4) against a real
 * Postgres.
 *
 * The protocol's whole claim to correctness is that the create-record path and
 * the discard path serialize on the same UNIQUE `blob_claims.blob_url` row. A
 * mocked unit test cannot show that two concurrent transactions actually block
 * on each other — only a real database can. This suite holds the claim in an
 * open transaction on one connection and proves the other side cannot proceed
 * until that transaction ends, then resolves according to its outcome.
 *
 * Opt-in via `RUN_DB_TESTS=1`. Requires the `blob_claims` migration to have
 * been applied (`prisma migrate deploy`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import {
  claimBlobForRecord,
  claimBlobForDiscard,
  releaseBlobClaim,
  releaseBlobClaimById,
  markBlobDiscarded,
} from '@/utils/blob-claim';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

const URL_A = 'https://store.blob.core.windows.net/cipansor-documents/race-a.pdf';
const URL_B = 'https://store.blob.core.windows.net/cipansor-documents/race-b.pdf';

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

describeDb('BlobClaim protocol (BUG 4)', () => {
  let clientA: Client;

  beforeAll(async () => {
    clientA = openClient();
    await clientA.connect();
    await clientA.query(
      `DELETE FROM "blob_claims" WHERE "blob_url" IN ($1, $2)`,
      [URL_A, URL_B]
    );
  });

  afterAll(async () => {
    await clientA.query(
      `DELETE FROM "blob_claims" WHERE "blob_url" IN ($1, $2)`,
      [URL_A, URL_B]
    );
    await clientA.end();
  });

  it('a committed record claim blocks a discard', async () => {
    expect(await claimBlobForRecord(URL_A, 'author-1')).toBe(true);
    // A concurrent discard cannot take over a live claim held by another actor.
    expect(await claimBlobForDiscard(URL_A, 'discard-holder')).toBeNull();
    await releaseBlobClaim(URL_A, 'author-1');
    // Once released, the discard can proceed.
    const claimId = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(claimId).not.toBeNull();
    await releaseBlobClaimById(claimId as string, 'discard-holder');
  });

  it('a live discard claim blocks a create-record', async () => {
    const claimId = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(claimId).not.toBeNull();
    // The create path must refuse rather than save a reference to a blob the
    // discard may already be deleting.
    expect(await claimBlobForRecord(URL_A, 'author-1')).toBe(false);
    await releaseBlobClaimById(claimId as string, 'discard-holder');
    // Released: the create can claim again.
    expect(await claimBlobForRecord(URL_A, 'author-1')).toBe(true);
    await releaseBlobClaim(URL_A, 'author-1');
  });

  it('serializes concurrent transactions on the claim row (create holds, discard waits)', async () => {
    // Connection A opens a transaction and inserts a RECORD claim but does not
    // commit. The discard on the shared client must BLOCK on the unique row —
    // not read a stale "no claim" and proceed — until A resolves.
    await clientA.query('BEGIN');
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "created_at", "expires_at")
       VALUES ('race-claim-1', $1, 'RECORD', 'author-tx', now(), now() + interval '10 minutes')`,
      [URL_B]
    );

    const discardPromise = claimBlobForDiscard(URL_B, 'discard-holder');
    // While A is in flight the discard is blocked on the row lock.
    expect(await isPending(discardPromise, 300)).toBe(true);

    // A commits its record claim; the discard's upsert now sees a live claim
    // and returns null instead of stealing it.
    await clientA.query('COMMIT');
    expect(await discardPromise).toBeNull();

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [URL_B]);
  });

  it('lets a create claim the blob when the blocking transaction rolls back', async () => {
    await clientA.query('BEGIN');
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "created_at", "expires_at")
       VALUES ('race-claim-2', $1, 'DISCARD', 'other-discard', now(), now() + interval '10 minutes')`,
      [URL_B]
    );

    const recordPromise = claimBlobForRecord(URL_B, 'author-tx');
    expect(await isPending(recordPromise, 300)).toBe(true);

    // The other side rolls back, so no claim ever existed; the create wins.
    await clientA.query('ROLLBACK');
    expect(await recordPromise).toBe(true);
    await releaseBlobClaim(URL_B, 'author-tx');
  });

  it('an expired claim is taken over instead of pinning the orphan forever', async () => {
    // Simulate a create that crashed before saving its record: its claim is
    // past `expires_at`, so the discard may take it over.
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "created_at", "expires_at")
       VALUES ('expired-claim', $1, 'RECORD', 'crashed-author', now() - interval '20 minutes', now() - interval '10 minutes')`,
      [URL_A]
    );

    const claimId = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(claimId).not.toBeNull();
    // Taking over an expired claim reuses the row (UPSERT), but the kind and
    // holder must reflect the new owner.
    const { rows } = await clientA.query(
      'SELECT kind, holder_id FROM "blob_claims" WHERE "blob_url" = $1',
      [URL_A]
    );
    expect(rows[0]).toEqual({ kind: 'DISCARD', holder_id: 'discard-holder' });
    await releaseBlobClaimById(claimId as string, 'discard-holder');
  });

  it('the same holder can refresh its own claim (idempotent retry)', async () => {
    const first = await claimBlobForDiscard(URL_A, 'same-holder');
    const second = await claimBlobForDiscard(URL_A, 'same-holder');
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    await releaseBlobClaimById(second as string, 'same-holder');
  });

  it('one blob URL can only ever hold one claim row', async () => {
    await claimBlobForRecord(URL_A, 'author-1');
    await claimBlobForRecord(URL_A, 'author-2'); // blocked, no second row
    const { rows } = await clientA.query(
      'SELECT count(*)::int AS count FROM "blob_claims" WHERE "blob_url" = $1',
      [URL_A]
    );
    expect(rows[0].count).toBe(1);
    await releaseBlobClaim(URL_A, 'author-1');
  });

  it('a create waits out a live discard claim instead of failing (BUG 4)', async () => {
    // The discard holds the claim across its probe/delete, so a create arriving
    // now must neither steal the row nor be rejected — it waits, and takes over
    // once the discard releases (which, on the real delete path, happens only
    // when the tombstone could NOT be set, i.e. the discard aborted).
    const discardId = await claimBlobForDiscard(URL_B, 'discard-holder');
    expect(discardId).not.toBeNull();

    // Released shortly after the create starts waiting. Real timing, not a mock:
    // the create must observe the row becoming free and win.
    setTimeout(() => {
      void releaseBlobClaimById(discardId as string, 'discard-holder');
    }, 150);

    expect(await claimBlobForRecord(URL_B, 'author-1')).toBe(true);
    await releaseBlobClaim(URL_B, 'author-1');
  });

  it('a create does NOT wait out a claim held by another record', async () => {
    // A live RECORD claim is a genuine concurrent duplicate, not a transient
    // discard; the create must refuse rather than block the request for nothing.
    expect(await claimBlobForRecord(URL_B, 'author-1')).toBe(true);
    const started = Date.now();
    expect(await claimBlobForRecord(URL_B, 'author-2')).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
    await releaseBlobClaim(URL_B, 'author-1');
  });

  it('markBlobDiscarded only succeeds for the live holder, and only once (BUG 4)', async () => {
    // The tombstone is the atomic switch the delete hinges on: it must fail for
    // a foreign holder, fail on a second call, and fail for an expired claim.
    const discardId = await claimBlobForDiscard(URL_B, 'discard-holder');
    expect(discardId).not.toBeNull();

    // A different actor cannot tombstone someone else's claim.
    expect(await markBlobDiscarded(discardId as string, 'other-actor')).toBe(false);

    // The holder's first call wins...
    expect(await markBlobDiscarded(discardId as string, 'discard-holder')).toBe(true);
    // ...and a second is a no-op: the row is already terminal.
    expect(await markBlobDiscarded(discardId as string, 'discard-holder')).toBe(false);

    // An expired claim cannot be tombstoned either (nothing to release safely).
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "created_at", "expires_at")
       VALUES ('tombstone-expired', $1, 'DISCARD', 'discard-holder', now() - interval '20 minutes', now() - interval '10 minutes')`,
      [URL_A]
    );
    expect(await markBlobDiscarded('tombstone-expired', 'discard-holder')).toBe(false);

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = ANY($1)`, [
      [URL_A, URL_B],
    ]);
  });

  it('the tombstone is terminal: a create can never claim a discarded blob, even after expiry (BUG 4)', async () => {
    // This is the deterministic proof the residual TOCTOU is gone. The old
    // protocol released the row after the delete, so a create waiting on it
    // reclaimed the URL and referenced a blob that no longer existed.
    const discardId = await claimBlobForDiscard(URL_A, 'discard-holder');
    expect(discardId).not.toBeNull();
    expect(await markBlobDiscarded(discardId as string, 'discard-holder')).toBe(true);

    // A create arriving now must refuse immediately — not wait, not take over.
    const started = Date.now();
    expect(await claimBlobForRecord(URL_A, 'author-1')).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);

    // Even once the tombstoned row's TTL lapses — the old protocol's escape
    // hatch — the create is still refused. The blob is gone; nothing may
    // resurrect its URL.
    await clientA.query(
      `UPDATE "blob_claims" SET "expires_at" = now() - interval '1 hour' WHERE "id" = $1`,
      [discardId]
    );
    expect(await claimBlobForRecord(URL_A, 'author-1')).toBe(false);

    // A second discard also cannot re-open it (the blob is already gone).
    expect(await claimBlobForDiscard(URL_A, 'discard-holder')).toBeNull();

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [URL_A]);
  });

  it('only one side wins a discard/create race: tombstone and record claim are mutually exclusive', async () => {
    // Deterministic interleaving: open a transaction that would insert the
    // create's RECORD claim but hold it, then let the discard run. The discard
    // must either fail to tombstone (create won) or force the create to refuse
    // (tombstone won) — never both.
    await clientA.query('BEGIN');
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "created_at", "expires_at")
       VALUES ('race-claim-3', $1, 'DISCARD', 'discard-holder', now(), now() + interval '10 minutes')`,
      [URL_B]
    );

    // The create blocks on the unique row while the discard transaction is open.
    const recordPromise = claimBlobForRecord(URL_B, 'author-1');
    expect(await isPending(recordPromise, 300)).toBe(true);

    // The discard (a different connection via the shared client) commits its
    // tombstone inside its transaction, then the transaction ends. The waiting
    // create must NOT win: the tombstone survives the commit.
    await clientA.query(
      `UPDATE "blob_claims" SET "discarded_at" = now() WHERE "id" = 'race-claim-3'`
    );
    await clientA.query('COMMIT');
    expect(await recordPromise).toBe(false);

    await clientA.query(`DELETE FROM "blob_claims" WHERE "blob_url" = $1`, [URL_B]);
  });
});