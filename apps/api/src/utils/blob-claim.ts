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
      WHERE "blob_claims"."expires_at" < now()
         OR "blob_claims"."holder_id" = EXCLUDED."holder_id"
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
 * takes the row; the discard's liveness check (`blobClaimStillHeld`) sees the
 * claim gone and abandons the delete. A claim held by another *record* is not
 * waited for — it is a genuine concurrent duplicate the caller should refuse.
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

    const holder = await client.$queryRaw<Array<{ kind: string }>>(Prisma.sql`
      SELECT "kind"::text AS "kind" FROM "blob_claims" WHERE "blob_url" = ${blobUrl}
    `);
    const blockingKind = holder[0]?.kind;
    // Only a discard is transient by design; anything else is a real conflict.
    if (blockingKind !== 'DISCARD' || Date.now() >= deadline) return false;
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
 * True while `id` is still the live claim this actor holds.
 *
 * The discard path runs its last reference probe, then deletes the blob. Those
 * two steps are not one atomic operation, so there is a window between them —
 * and a create-record whose *claim insert* was already waiting on the unique
 * row can commit inside it: the discard's claim is deleted (with the record's
 * insert), the waiting create then takes the row, and the delete that follows
 * destroys a blob the record now points at.
 *
 * This check does not remove that window on its own; it is the discard's half of
 * closing it. `claimBlobForRecord` retries its claim, so a create that loses the
 * row to a discard's still-live claim waits rather than failing; a discard that
 * finds its claim gone knows a create won and aborts the delete. The residual
 * window is now a sub-millisecond local comparison instead of a network call to
 * Azure, and the durable guarantee remains "the record's committed claim
 * conflicts with the discard's claim".
 */
export async function blobClaimStillHeld(id: string, holderId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "blob_claims"
    WHERE "id" = ${id} AND "holder_id" = ${holderId} AND "expires_at" > now()
  `);
  return rows.length > 0;
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