import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { normalizeUploadPath } from '@/utils/file-token';

/**
 * The durable claim that closes the upload → create-record race (BUG 4), now
 * keyed by a per-operation token rather than the acting user.
 *
 * An upload and the record that references it are two requests. A discard for
 * an upload whose record was never saved reads "no record references this" —
 * but if it reads that at the instant a create is committing, it would destroy
 * a blob the new record just started pointing at. Delaying and re-probing only
 * narrows the window; it leaves a TOCTOU between the last probe and the
 * physical delete.
 *
 * `BlobClaim` closes it because both sides take a row on the same UNIQUE key:
 *
 *  1. Create-record claims the blob as `RECORD` *before* it saves the record,
 *     and releases the claim only after the record commits.
 *  2. Discard claims the blob as `DISCARD`. It can only win if no live `RECORD`
 *     claim exists, and it re-probes the reference index once it holds the
 *     claim. Any create that started after the discard's first probe must first
 *     take a `RECORD` claim, which now conflicts with the live `DISCARD` claim.
 *  3. Before it deletes, the discard flips `discardedAt` on its own claim — a
 *     conditional UPDATE that only succeeds while the claim is still its own
 *     and untombstoned. Once the tombstone is set NO create may ever take the
 *     row over, no matter how long the delete takes.
 *
 * ## Operation identity, not user identity (SECURITY CRITICAL — finding D)
 *
 * The claim is identified by `(id, operationToken, kind)`. `holderId` is
 * recorded for audit only and is NEVER sufficient to take a claim over:
 *
 *  - A RECORD and a DISCARD by the SAME user are distinct operations and must
 *    not assume each other's claim.
 *  - A stale release for a previous claim must not delete a newer claim on the
 *    same URL, so releases match the token too.
 *
 * Takeover/refresh is therefore only ever allowed for the exact same claim
 * (id + token + kind), and only for the same kind — a RECORD never refreshes a
 * DISCARD and vice versa.
 */

/** How long a record claim stays live before a crashed create releases it. */
export const BLOB_RECORD_CLAIM_TTL_MS = 10 * 60 * 1000;
/** How long a discard claim is held across the delete. */
export const BLOB_DISCARD_CLAIM_TTL_MS = 5 * 60 * 1000;

export const BLOB_CLAIM_KINDS = ['RECORD', 'DISCARD'] as const;
export type BlobClaimKindValue = (typeof BLOB_CLAIM_KINDS)[number];

/**
 * An identity for one operation's claim. Every release/tombstone/ownership
 * check is conditional on all three fields — the user id is not part of it.
 */
export interface BlobClaimHandle {
  id: string;
  operationToken: string;
  kind: BlobClaimKindValue;
}

/** The Prisma surface the claim helpers need (client or transaction client). */
type ClaimClient = {
  $queryRaw: typeof prisma.$queryRaw;
  $executeRaw: typeof prisma.$executeRaw;
};

/** Default to the shared client; callers inside a transaction pass `tx`. */
function client(c?: ClaimClient): ClaimClient {
  return c ?? prisma;
}

function ttlMs(kind: BlobClaimKindValue): number {
  return kind === 'RECORD' ? BLOB_RECORD_CLAIM_TTL_MS : BLOB_DISCARD_CLAIM_TTL_MS;
}

/** A cryptographically random, per-operation secret. */
function newOperationToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Canonicalize a blob URL to the identity a claim is keyed on.
 *
 * A record may persist a local upload as either `/uploads/<file>` or the
 * absolute `https://host/uploads/<file>` form, and the two are the same file.
 * Writers and the discard path must therefore claim the SAME row or the mutual
 * exclusion silently does nothing. Local paths collapse to `/uploads/<file>`;
 * Azure URLs are already canonical and pass through unchanged.
 */
export function canonicalBlobClaimKey(url: string): string {
  return normalizeUploadPath(url) ?? url;
}

/**
 * Insert a claim, or atomically take one over.
 *
 * `refresh` carries the (id, token) of a claim this operation already holds.
 * When present, the DO UPDATE takes the row over ONLY if it is still that exact
 * claim AND the same kind — an expired, tombstoned, or foreign claim is never
 * refreshed, and a same-user claim of a different kind is never assumed.
 *
 * Without `refresh`, takeover is allowed only when the existing claim is
 * expired and untombstoned. The user id deliberately does not appear in the
 * WHERE clause.
 *
 * Returns the handle on success, null when a live claim held by someone else is
 * in the way.
 */
async function upsertClaim(
  client: ClaimClient,
  blobUrl: string,
  kind: BlobClaimKindValue,
  holderId: string,
  refresh?: { id: string; operationToken: string } | null,
  recordId?: string | null
): Promise<BlobClaimHandle | null> {
  const id = crypto.randomUUID();
  const operationToken = newOperationToken();
  const key = canonicalBlobClaimKey(blobUrl);
  const expiresAt = new Date(Date.now() + ttlMs(kind));

  const rows = await client.$queryRaw<Array<{ id: string; operationToken: string }>>(Prisma.sql`
    INSERT INTO "blob_claims"
      ("id", "blob_url", "kind", "holder_id", "operation_token", "record_id", "created_at", "expires_at")
    VALUES (
      ${id}, ${key}, ${kind}::"BlobClaimKind", ${holderId}, ${operationToken}, ${recordId ?? null},
      now(), ${expiresAt}
    )
    ON CONFLICT ("blob_url") DO UPDATE
      SET "kind" = EXCLUDED."kind",
          "holder_id" = EXCLUDED."holder_id",
          "operation_token" = EXCLUDED."operation_token",
          "record_id" = EXCLUDED."record_id",
          "created_at" = now(),
          "expires_at" = EXCLUDED."expires_at"
      WHERE ("blob_claims"."discarded_at" IS NULL)
        AND (
          "blob_claims"."expires_at" < now()
          OR (
            "blob_claims"."kind" = EXCLUDED."kind"
            AND "blob_claims"."id" = ${refresh?.id ?? null}
            AND "blob_claims"."operation_token" = ${refresh?.operationToken ?? null}
          )
        )
    RETURNING "id", "operation_token" AS "operationToken"
  `);

  const row = rows[0];
  if (!row) return null;
  return { id: row.id, operationToken: row.operationToken, kind };
}

/** How long a waiting create backs off before retrying a blocked claim. */
const CLAIM_RETRY_DELAY_MS = 50;
/** How long a waiting create keeps retrying a claim held by a live discard. */
const CLAIM_RETRY_TIMEOUT_MS = 3_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claim a blob for a record, retrying while a *discard* holds it.
 *
 * A discard holds its claim across the reference re-probe and the physical
 * delete, which is the window the discard is using to prove the blob is an
 * orphan. If this create simply failed on the first attempt it would reject a
 * perfectly valid save because a discard happened to be sweeping at that
 * instant — and the discard, on finding its claim stolen, would abort its
 * delete. Both sides backing off means neither makes progress on a legitimate
 * request.
 *
 * So the create waits for that short-lived `DISCARD` claim to clear and then
 * takes the row; the discard, on failing to tombstone its claim, abandons the
 * delete. A claim held by another *record* is not waited for — it is a genuine
 * concurrent duplicate the caller should refuse.
 *
 * A tombstoned row (`discardedAt` set) is terminal and NOT retried.
 */
async function claimRecordWithRetry(
  client: ClaimClient,
  blobUrl: string,
  holderId: string
): Promise<BlobClaimHandle | null> {
  const deadline = Date.now() + CLAIM_RETRY_TIMEOUT_MS;
  for (;;) {
    const handle = await upsertClaim(client, blobUrl, 'RECORD', holderId);
    if (handle) return handle;

    const holder = await client.$queryRaw<Array<{ kind: string; discardedAt: Date | null }>>(Prisma.sql`
      SELECT "kind"::text AS "kind", "discarded_at" AS "discardedAt"
      FROM "blob_claims" WHERE "blob_url" = ${canonicalBlobClaimKey(blobUrl)}
    `);
    const blocking = holder[0];
    // The blob this URL pointed at has been deleted; no create may resurrect it.
    if (blocking?.discardedAt) return null;
    // Only a discard is transient by design; anything else is a real conflict.
    if (blocking?.kind !== 'DISCARD' || Date.now() >= deadline) return null;
    await sleep(CLAIM_RETRY_DELAY_MS);
  }
}

/**
 * Claim a blob on behalf of a record that is about to reference it.
 *
 * Must run BEFORE the record insert and be released only after it commits (or
 * run inside the same transaction as the insert — then the claim commits
 * atomically with the record). Returns null when a live claim held by another
 * operation blocks it: the caller must fail the create rather than save a
 * reference to a blob a discard may already own.
 */
export async function claimBlobForRecord(
  blobUrl: string,
  holderId: string,
  c?: ClaimClient
): Promise<BlobClaimHandle | null> {
  return claimRecordWithRetry(client(c), blobUrl, holderId);
}

/**
 * Try to take ownership of an orphan blob so it can be deleted.
 *
 * Returns the handle when this operation now owns the blob, or null when a live
 * claim held by someone else is in the way. A claim this operation already
 * holds is refreshed via its token, so a retry after a partial failure is
 * idempotent — and a same-user claim of a different kind is NOT taken over.
 */
export async function claimBlobForDiscard(
  blobUrl: string,
  holderId: string,
  refresh?: { id: string; operationToken: string } | null
): Promise<BlobClaimHandle | null> {
  return upsertClaim(prisma, blobUrl, 'DISCARD', holderId, refresh);
}

/**
 * Confirm that this operation still owns `handle` right now.
 *
 * Writers call this immediately before committing a record (or inside the
 * transaction that does), so a claim silently stolen/released mid-flight is
 * detected rather than assumed. Matches id + token + kind; expired or
 * tombstoned claims never match.
 */
export async function assertBlobClaimHeld(
  handle: BlobClaimHandle,
  c?: ClaimClient
): Promise<boolean> {
  const rows = await client(c).$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "blob_claims"
    WHERE "id" = ${handle.id}
      AND "operation_token" = ${handle.operationToken}
      AND "kind" = ${handle.kind}::"BlobClaimKind"
      AND "discarded_at" IS NULL
      AND "expires_at" > now()
  `);
  return rows.length > 0;
}

/**
 * Permanently tombstone a discard claim immediately before the irreversible
 * delete (BUG 4).
 *
 * This is the atomic switch that removes the last TOCTOU. It flips
 * `discarded_at` in a single conditional UPDATE, which only succeeds while the
 * claim is still THIS operation's own (id + token + kind), still live, and not
 * already tombstoned:
 *
 *  - If it returns true, the row can never be taken over again (every claim
 *    path filters on `discarded_at IS NULL`), so the delete that follows cannot
 *    race a create.
 *  - If it returns false, the claim was lost since the re-probe; the caller
 *    MUST abort without deleting.
 *
 * Unlike {@link releaseBlobClaimById}, this does not remove the row: releasing
 * it is exactly what let a waiting create reclaim the URL between the delete and
 * the release.
 */
export async function markBlobDiscarded(
  handle: BlobClaimHandle,
  c?: ClaimClient
): Promise<boolean> {
  const rows = await client(c).$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "blob_claims"
    SET "discarded_at" = now()
    WHERE "id" = ${handle.id}
      AND "operation_token" = ${handle.operationToken}
      AND "kind" = ${handle.kind}::"BlobClaimKind"
      AND "discarded_at" IS NULL
      AND "expires_at" > now()
    RETURNING "id"
  `);
  return rows.length > 0;
}

/**
 * Release a claim by id, conditional on the operation token and kind.
 *
 * The old API released by URL + user id, which meant a stale release for a
 * previous claim could delete a newer claim on the same URL — or a RECORD
 * release could delete a DISCARD claim by the same user. A release removes only
 * the claim it names, and only while it is untombstoned.
 */
export async function releaseBlobClaimById(
  handle: BlobClaimHandle,
  c?: ClaimClient
): Promise<void> {
  await client(c).$executeRaw`
    DELETE FROM "blob_claims"
    WHERE "id" = ${handle.id}
      AND "operation_token" = ${handle.operationToken}
      AND "kind" = ${handle.kind}::"BlobClaimKind"
      AND "discarded_at" IS NULL
  `;
}

/**
 * Claim every blob a record is about to reference. All-or-nothing: if any URL
 * is claimed by another operation the returned flag is false and the caller
 * must abort the whole create. Within a transaction the partial claims roll
 * back, so a failed create leaves no claim behind.
 *
 * On success the handles are returned so the caller can release (or re-assert)
 * exactly the claims it took.
 */
export async function claimBlobsForRecord(
  blobUrls: readonly (string | null | undefined)[],
  holderId: string,
  c?: ClaimClient
): Promise<BlobClaimHandle[] | null> {
  const unique = Array.from(new Set(blobUrls.filter((u): u is string => !!u)));
  const handles: BlobClaimHandle[] = [];
  for (const url of unique) {
    const handle = await claimBlobForRecord(url, holderId, c);
    if (!handle) return null;
    handles.push(handle);
  }
  return handles;
}

/** Release every claim in `handles`, conditional on each one's token. */
export async function releaseBlobClaims(
  handles: readonly BlobClaimHandle[],
  c?: ClaimClient
): Promise<void> {
  for (const handle of handles) {
    await releaseBlobClaimById(handle, c);
  }
}
