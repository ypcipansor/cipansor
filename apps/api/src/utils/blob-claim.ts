import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * The durable claim that closes the upload → create-record race (BUG 4).
 *
 * An upload and the record that references it are two requests. A discard for
 * an upload whose record was never saved reads "no record references this" —
 * but if it reads that at the instant a create is committing, it would destroy
 * a blob the new record just started pointing at. Delaying and re-probing only
 * narrows the window; it leaves a TOCTOU between the last probe and Azure's
 * delete.
 *
 * `BlobClaim` closes it because both sides take a row on the same UNIQUE key:
 *
 *  1. Create-record claims the blob as `RECORD` (a committed row) *before* it
 *     saves the record, and deletes the claim only after the record commits.
 *  2. Discard claims the blob as `DISCARD`. It can only win if no live `RECORD`
 *     claim exists, and it re-probes the reference index once it holds the
 *     claim. Any create that started after the discard's first probe must first
 *     take a `RECORD` claim, which now conflicts with the live `DISCARD` claim —
 *     so no record referencing the blob can commit between the re-probe and the
 *     delete.
 *  3. Before it calls Azure, the discard flips `discardedAt` on its own claim —
 *     a conditional UPDATE that only succeeds while the claim is still its own
 *     and untombstoned. Once the tombstone is set NO create may ever take the
 *     row over, no matter how long the delete takes. The old protocol instead
 *     released the row right after the delete, which let a waiting create slip
 *     in between the delete and the release and persist a reference to a blob
 *     that was already gone.
 *
 * Whichever side inserts first wins; the loser backs off. A claim is
 * `expiresAt`-bounded so a create that crashes before saving its record cannot
 * pin the orphan forever. Only claim-respecting writers get this guarantee;
 * `isBlobStillReferenced` remains as a backstop for any legacy writer.
 */

/** How long a record claim stays live before a crashed create releases it. */
export const BLOB_RECORD_CLAIM_TTL_MS = 10 * 60 * 1000;
/** How long a discard claim is held across the delete. */
export const BLOB_DISCARD_CLAIM_TTL_MS = 5 * 60 * 1000;

/** The Prisma surface the claim helpers need (client or transaction client). */
type ClaimClient = {
  $queryRaw: typeof prisma.$queryRaw;
  $executeRaw: typeof prisma.$executeRaw;
};

/** Default to the shared client; callers inside a transaction pass `tx`. */
function client(c?: ClaimClient): ClaimClient {
  return c ?? prisma;
}

function ttlMs(kind: 'RECORD' | 'DISCARD'): number {
  return kind === 'RECORD' ? BLOB_RECORD_CLAIM_TTL_MS : BLOB_DISCARD_CLAIM_TTL_MS;
}

/**
 * Insert a claim, or atomically take one over when it is expired or already
 * ours. Returns the claim id on success, null when a live claim held by someone
 * else is in the way.
 *
 * A single `ON CONFLICT ... DO UPDATE ... WHERE` is what makes this atomic: two
 * concurrent claimers serialize on the unique row, and only one UPDATE's WHERE
 * can pass. No read-then-write gap for a race to slip through.
 *
 * A tombstoned row (`discardedAt IS NOT NULL`) is never taken over — not even
 * when it is expired or held by the same actor. That is what makes a completed
 * discard permanent: the blob is gone, so no create may ever claim its URL
 * again. Without this clause a waiter would reclaim the row the moment the
 * discard released it.
 */
async function upsertClaim(
  client: ClaimClient,
  blobUrl: string,
  kind: 'RECORD' | 'DISCARD',
  holderId: string,
  recordId?: string | null
): Promise<string | null> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs(kind));

  const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "blob_claims" ("id", "blob_url", "kind", "holder_id", "record_id", "created_at", "expires_at")
    VALUES (${id}, ${blobUrl}, ${kind}::"BlobClaimKind", ${holderId}, ${recordId ?? null}, now(), ${expiresAt})
    ON CONFLICT ("blob_url") DO UPDATE
      SET "kind" = EXCLUDED."kind",
          "holder_id" = EXCLUDED."holder_id",
          "record_id" = EXCLUDED."record_id",
          "created_at" = now(),
          "expires_at" = EXCLUDED."expires_at"
      WHERE ("blob_claims"."discarded_at" IS NULL)
        AND ("blob_claims"."expires_at" < now()
          OR "blob_claims"."holder_id" = EXCLUDED."holder_id")
    RETURNING "id"
  `);

  return rows[0]?.id ?? null;
}

/** How long a waiting create backs off before retrying a blocked claim. */
const CLAIM_RETRY_DELAY_MS = 50;
/** How long a waiting create keeps retrying a claim held by a live discard. */
const CLAIM_RETRY_TIMEOUT_MS = 3_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claim a blob for a record, retrying while a *discard* holds it.
 *
 * A discard holds its claim across the reference re-probe and the Azure delete,
 * which is the window the discard is using to prove the blob is an orphan. If
 * this create simply failed on the first attempt it would reject a perfectly
 * valid save because a discard happened to be sweeping at that instant — and
 * the discard, on finding its claim stolen, would abort its delete. Both sides
 * backing off means neither makes progress on a legitimate request.
 *
 * So the create waits for that short-lived `DISCARD` claim to clear and then
 * takes the row; the discard, on failing to tombstone its claim, abandons the
 * delete. A claim held by another *record* is not waited for — it is a genuine
 * concurrent duplicate the caller should refuse.
 *
 * A tombstoned row (`discardedAt` set) is terminal and NOT retried: the blob has
 * been deleted, so waiting is pointless and succeeding would be fatal. The
 * create refuses at once.
 */
async function claimRecordWithRetry(
  client: ClaimClient,
  blobUrl: string,
  holderId: string
): Promise<boolean> {
  const deadline = Date.now() + CLAIM_RETRY_TIMEOUT_MS;
  for (;;) {
    const id = await upsertClaim(client, blobUrl, 'RECORD', holderId);
    if (id !== null) return true;

    const holder = await client.$queryRaw<Array<{ kind: string; discardedAt: Date | null }>>(Prisma.sql`
      SELECT "kind"::text AS "kind", "discarded_at" AS "discardedAt"
      FROM "blob_claims" WHERE "blob_url" = ${blobUrl}
    `);
    const blocking = holder[0];
    // The blob this URL pointed at has been deleted; no create may resurrect it.
    // Retrying would only burn the timeout before failing anyway.
    if (blocking?.discardedAt) return false;
    // Only a discard is transient by design; anything else is a real conflict.
    if (blocking?.kind !== 'DISCARD' || Date.now() >= deadline) return false;
    await sleep(CLAIM_RETRY_DELAY_MS);
  }
}

/**
 * Claim a blob on behalf of a record that is about to reference it.
 *
 * Must run BEFORE the record insert and be committed before it (or run inside
 * the same transaction as the insert — then the claim commits atomically with
 * the record, which is the strongest ordering). Returns false when a live claim
 * held by another actor blocks it: the caller must fail the create rather than
 * save a reference to a blob a discard may already own.
 */
export async function claimBlobForRecord(
  blobUrl: string,
  holderId: string,
  c?: ClaimClient
): Promise<boolean> {
  return claimRecordWithRetry(client(c), blobUrl, holderId);
}

/**
 * Try to take ownership of an orphan blob so it can be deleted.
 *
 * Returns the claim id when this actor now owns the blob, or null when a live
 * claim held by someone else is in the way (another create is materialising, or
 * another discard already owns it). A claim this actor already holds is
 * refreshed, so a retry after a partial failure is idempotent.
 */
export async function claimBlobForDiscard(
  blobUrl: string,
  holderId: string
): Promise<string | null> {
  return upsertClaim(prisma, blobUrl, 'DISCARD', holderId);
}

/**
 * Permanently tombstone a discard claim immediately before the irreversible
 * blob delete (BUG 4).
 *
 * This is the atomic switch that removes the last TOCTOU. It flips
 * `discarded_at` in a single conditional UPDATE, which only succeeds while the
 * claim is still this actor's own, still live, and not already tombstoned:
 *
 *  - If it returns true, the row can never be taken over again (every claim
 *    path filters on `discarded_at IS NULL`), so the delete that follows cannot
 *    race a create — even one already waiting on the row.
 *  - If it returns false, the claim was lost to a create (or another discard)
 *    since the re-probe; the caller MUST abort without deleting.
 *
 * Unlike {@link releaseBlobClaimById}, this does not remove the row: releasing
 * it is exactly what let a waiting create reclaim the URL between the delete and
 * the release.
 */
export async function markBlobDiscarded(claimId: string, holderId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "blob_claims"
    SET "discarded_at" = now()
    WHERE "id" = ${claimId}
      AND "holder_id" = ${holderId}
      AND "discarded_at" IS NULL
      AND "expires_at" > now()
    RETURNING "id"
  `);
  return rows.length > 0;
}

/**
 * Release a claim this actor holds, by URL (used by the create path).
 * `holderId` scoping means a release can never delete another actor's claim.
 */
export async function releaseBlobClaim(
  blobUrl: string,
  holderId: string,
  c?: ClaimClient
): Promise<void> {
  await client(c).$executeRaw`
    DELETE FROM "blob_claims"
    WHERE "blob_url" = ${blobUrl} AND "holder_id" = ${holderId}
  `;
}

/** Release a claim by id, but only if this actor still holds it. */
export async function releaseBlobClaimById(id: string, holderId: string): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "blob_claims"
    WHERE "id" = ${id} AND "holder_id" = ${holderId}
  `;
}

/**
 * Claim every blob a record is about to reference. All-or-nothing: if any URL
 * is claimed by another actor the returned flag is false and the caller must
 * abort the whole create. Within a transaction the partial claims roll back, so
 * a failed create leaves no claim behind.
 */
export async function claimBlobsForRecord(
  blobUrls: readonly (string | null | undefined)[],
  holderId: string,
  c?: ClaimClient
): Promise<boolean> {
  const unique = Array.from(new Set(blobUrls.filter((u): u is string => !!u)));
  for (const url of unique) {
    const ok = await claimBlobForRecord(url, holderId, c);
    if (!ok) return false;
  }
  return true;
}

/** Release every claim in `blobUrls` held by this actor. */
export async function releaseBlobClaims(
  blobUrls: readonly (string | null | undefined)[],
  holderId: string,
  c?: ClaimClient
): Promise<void> {
  const unique = Array.from(new Set(blobUrls.filter((u): u is string => !!u)));
  for (const url of unique) {
    await releaseBlobClaim(url, holderId, c);
  }
}