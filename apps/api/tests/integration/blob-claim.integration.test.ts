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
  blobClaimStillHeld,
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

  it('a create waits out a live discard claim instead of failing (BUG 4 residual)', async () => {
    // This is the window the old protocol lost on: the discard holds the claim
    // across its own probe, so a create arriving now must neither steal the row
    // nor be rejected — it waits, and takes over once the discard releases.
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

  it('a discard that lost its claim to a create can see it is no longer held', async () => {
    // The discard's last check before deleting. Here a create has taken the row
    // after the discard's claim was released, exactly as the residual race
    // would leave it — the discard must observe false and abort.
    const discardId = await claimBlobForDiscard(URL_B, 'discard-holder');
    expect(await blobClaimStillHeld(discardId as string, 'discard-holder')).toBe(true);

    await releaseBlobClaimById(discardId as string, 'discard-holder');
    expect(await claimBlobForRecord(URL_B, 'author-1')).toBe(true);

    expect(await blobClaimStillHeld(discardId as string, 'discard-holder')).toBe(false);
    await releaseBlobClaim(URL_B, 'author-1');
  });

  it('treats an expired claim as no longer held', async () => {
    await clientA.query(
      `INSERT INTO "blob_claims"
         ("id", "blob_url", "kind", "holder_id", "created_at", "expires_at")
       VALUES ('liveness-expired', $1, 'DISCARD', 'discard-holder', now() - interval '20 minutes', now() - interval '10 minutes')`,
      [URL_B]
    );
    expect(await blobClaimStillHeld('liveness-expired', 'discard-holder')).toBe(false);
    await clientA.query(`DELETE FROM "blob_claims" WHERE "id" = 'liveness-expired'`);
  });
});