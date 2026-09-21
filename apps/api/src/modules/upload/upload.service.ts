import { prisma } from '@/lib/prisma';
import {
  generateSasUrl,
  parseBlobUrl,
  isAllowedContainer,
  isPublicContainer,
  deleteFromCloudStorage,
  getBlobUploaderId,
  SAS_TTL_MINUTES,
} from '@/utils/cloud-storage';
import { Errors } from '@/middleware/error';
import {
  findBlobOwner,
  findBlobOwnerByRefs,
  blobReferenceCandidates,
  isBlobStillReferenced,
  type BlobOwner,
  type UnitId,
} from '@/utils/blob-owner';
import { seesAllUnits, isFoundationScopedRole } from '@/utils/resolve-unit-id';
import { letterScopeWhere } from '@/utils/letter-access';
import { normalizeUploadPath, generateFileAccessToken, FILE_TOKEN_TTL_SECONDS } from '@/utils/file-token';
import {
  claimBlobForDiscard,
  releaseBlobClaimById,
  markBlobDiscarded,
} from '@/utils/blob-claim';
import {
  resolveLocalUploadPath,
  readLocalUploadOwner,
  removeLocalUpload,
} from '@/utils/local-upload-store';
import { mayAdministerEmployeeDocuments, mayVerifyPayments } from '@cipansor/shared';
import type { JwtPayload } from '@/lib/jwt';
import type { GetSasUrlResult } from '@cipansor/shared';

/** The subset of the authenticated user the SAS owner check needs. */
export type BlobActor = Pick<JwtPayload, 'id' | 'roleCode' | 'unitId' | 'permissions'>;

/** True when `actor` shares `unitId`, or sees across every unit. */
function actorInUnit(actor: BlobActor, unitId: UnitId): boolean {
  if (seesAllUnits(actor)) return true;
  return !!unitId && !!actor.unitId && unitId === actor.unitId;
}

/**
 * True when the authenticated actor may read the record that owns `blob`.
 *
 * A letter reuses the correspondence scoping rules (`letterScopeWhere`).
 * Personal documents (employee/student/portfolio) are NOT unit-public: only
 * the owner, a personnel-record administrator in the owner's unit, or a
 * foundation role may read them. Unit-owned records (reports, assets, books)
 * are readable by anyone scoped to that unit.
 *
 * Exported because the local `/uploads` provider must apply the *same* rule as
 * the Azure SAS path (`uploadsAuth`): a file in `public/uploads` and the same
 * file in a private blob container are the same record and must not answer
 * "who may read this" differently depending on where the bytes happen to live.
 */
export async function actorMayReadBlob(actor: BlobActor, owner: BlobOwner): Promise<boolean> {
  switch (owner.kind) {
    case 'letter': {
      if (seesAllUnits(actor)) return true;
      // A letter is readable only if it falls within the actor's correspondence scope.
      const scope = letterScopeWhere(actor);
      const matches = await prisma.letter.count({
        where: { id: owner.letterId, ...scope },
      });
      return matches > 0;
    }
    case 'public':
      return true;
    // Site-wide media with no unit owner (logos, catalog covers, all-units
    // announcement attachments). Any authenticated caller may read it; the
    // endpoint is already behind `authenticate`.
    case 'authenticated':
      return true;
    case 'foundation':
      return isFoundationScopedRole(actor.roleCode);
    case 'unit':
      return actorInUnit(actor, owner.unitId);
    case 'user-document': {
      if (owner.userId === actor.id) return true;
      if (isFoundationScopedRole(actor.roleCode)) return true;
      // A personnel-record administrator reaches only their own unit.
      return (
        mayAdministerEmployeeDocuments(actor.roleCode) &&
        !!owner.unitId &&
        owner.unitId === actor.unitId
      );
    }
    case 'payment-proof': {
      // The student the payment is for reaches their own proof; a foundation
      // role reaches any; a finance verifier (TU / treasurer / admin) reaches
      // one in their own unit. Everyone else is refused — this is personal
      // financial data, not a personnel document, so it is NOT widened by
      // `mayAdministerEmployeeDocuments`.
      if (owner.studentUserId === actor.id) return true;
      if (isFoundationScopedRole(actor.roleCode)) return true;
      return (
        mayVerifyPayments(actor.roleCode) &&
        !!owner.unitId &&
        owner.unitId === actor.unitId
      );
    }
  }
}

/** Back-compat internal alias; the exported name is `actorMayReadBlob`. */
const assertActorMayReadBlob = actorMayReadBlob;

/**
 * Resolve access to a local `/uploads/<file>` reference.
 *
 * The local provider has no object store and therefore no blob metadata to
 * carry an owner: the only record of who may read a file is the row that
 * references it. This maps the request path back to that row through the same
 * `findBlobOwner` index the Azure path uses, applies the same ownership rule
 * (`actorMayReadBlob`), and refuses a file no record owns. A UUID filename is
 * NOT authorization — anyone the URL leaks to would otherwise read it.
 *
 * Both storage spellings of the referenced file are probed (`/uploads/x` and
 * any absolute form), because the record may hold either.
 */
export async function resolveLocalFileAccess(
  url: string,
  actor: BlobActor
): Promise<GetSasUrlResult> {
  const path = normalizeUploadPath(url);
  if (!path) {
    // An arbitrary external URL is not a stored upload reference this endpoint
    // vouches for.
    throw Errors.badRequest('Referensi berkas tidak dikenali');
  }

  const refs = blobReferenceCandidates(url);
  const owner = await findBlobOwnerByRefs('cipansor-documents', refs);
  if (!owner) {
    // A local file no record references cannot be authorized to any caller.
    // This is the check the old `uploadsAuth` never made: a valid session token
    // used to open every file in the directory, without an owner in sight.
    throw Errors.forbidden('Berkas tidak ditemukan atau tidak dapat diakses');
  }

  const canRead = await actorMayReadBlob(actor, owner);
  if (!canRead) {
    throw Errors.forbidden('Anda tidak berwenang mengakses berkas tersebut');
  }

  // A scoped, short-lived token bound to this path — never the session token.
  const accessToken = generateFileAccessToken(path, actor.id);
  return { url, downloadUrl: url, accessToken, expiresIn: FILE_TOKEN_TTL_SECONDS };
}

/**
 * Mint a short-lived SAS for a persisted stable blob URL, enforcing that the
 * blob lives in an application-owned container AND belongs to a record the
 * caller may read. Any blob outside those bounds is refused.
 *
 * Public container blobs and local /uploads paths need no SAS and are returned
 * unchanged.
 */
export async function resolveSasForBlob(url: string, actor: BlobActor): Promise<GetSasUrlResult> {
  const parsed = parseBlobUrl(url);

  // Not a cloud blob. A local `/uploads/...` path (the other storage provider)
  // is authorized against the record that references it and returns a scoped,
  // short-lived file token — the same ownership rule as the Azure path, so the
  // two providers cannot disagree about who may read a file. An arbitrary
  // external URL is NOT a stored upload reference this endpoint vouches for —
  // returning it as `{ url }` success implied a validation the callers never
  // got, so it is refused instead.
  if (!parsed) {
    return resolveLocalFileAccess(url, actor);
  }

  if (isPublicContainer(parsed.containerName)) {
    // Public blob: no SAS needed.
    return { url };
  }

  if (!isAllowedContainer(parsed.containerName)) {
    // Container private but not owned by this application: refuse. The caller
    // must never obtain a signed link for an arbitrary storage container.
    throw Errors.forbidden('Akses ke kontainer penyimpanan tersebut ditolak');
  }

  const owner = await findBlobOwner(parsed.containerName, url);
  if (!owner) {
    // A private blob with no record in this application backing it cannot be
    // authorized to any caller.
    throw Errors.forbidden('Berkas tidak ditemukan atau tidak dapat diakses');
  }

  const canRead = await assertActorMayReadBlob(actor, owner);
  if (!canRead) {
    throw Errors.forbidden('Anda tidak berwenang mengakses berkas tersebut');
  }

  const downloadUrl = await generateSasUrl(parsed.containerName, parsed.blobName, SAS_TTL_MINUTES);
  return { url, downloadUrl, expiresIn: SAS_TTL_MINUTES * 60 };
}

/**
 * Discard a local-storage orphan upload (BUG: local orphans were never removed).
 *
 * The cloud path refused to touch `/uploads` at all, so every abandoned local
 * upload — the normal case when Azure is not configured — stayed on disk
 * forever. This gives the local provider the same three guarantees the cloud
 * path has: an exhaustive reference check, an ownership check against the
 * recorded uploader, and path containment that survives traversal/symlink
 * attacks.
 *
 * Safety order (the same as the cloud path, minus the durable claim — local
 * files are deleted through the filesystem, and the reference re-probe is the
 * authority):
 *
 *  1. Resolve the request name to a real path INSIDE the uploads directory, or
 *     refuse. The untrusted string never becomes a path by itself.
 *  2. Refuse if any record still references the file (exhaustive check).
 *  3. Refuse unless the actor is the recorded uploader, or a foundation role.
 *  4. Delete the file and its owner sidecar.
 */
async function discardLocalOrphanBlob(url: string, actor: BlobActor): Promise<void> {
  const path0 = normalizeUploadPath(url);
  if (!path0) {
    // An arbitrary external URL is not a stored upload reference.
    throw Errors.badRequest('Referensi berkas tidak dikenali');
  }

  const resolved = await resolveLocalUploadPath(path0);
  if (!resolved) {
    // Malformed name, missing file, or a path that escaped the uploads root.
    // Treat as "nothing to discard", not as a server error: an orphan that is
    // already gone satisfies the caller's intent.
    return;
  }

  const refs = Array.from(
    new Set([
      ...blobReferenceCandidates(url),
      ...blobReferenceCandidates(path0),
      path0,
    ])
  );
  if (await isBlobStillReferencedByRefs(refs)) {
    throw Errors.conflict('Berkas sudah tersimpan pada sebuah catatan dan tidak dapat dibuang');
  }

  if (!isFoundationScopedRole(actor.roleCode)) {
    const uploaderId = await readLocalUploadOwner(resolved);
    if (!uploaderId || uploaderId !== actor.id) {
      // No recorded uploader (pre-sidecar upload, or written out of band) is
      // refused for everyone: unknown ownership must not become "anyone may
      // delete it", matching the cloud path.
      throw Errors.forbidden('Anda tidak berwenang membuang berkas tersebut');
    }
  }

  await removeLocalUpload(resolved);
}

/**
 * Exhaustive reference check over a set of equivalent spellings.
 *
 * `isBlobStillReferenced` takes one URL; local files can be stored as a
 * relative path or an absolute URL, so every spelling must be probed. Reuses
 * the same every-field counter index the cloud path uses — a reference in any
 * covered field blocks the delete.
 */
async function isBlobStillReferencedByRefs(refs: readonly string[]): Promise<boolean> {
  for (const ref of refs) {
    if (await isBlobStillReferenced(ref)) return true;
  }
  return false;
}

/**
 * Authorise a discard of an orphan blob.
 *
 * An orphan blob has no database record to name an owner, so the uploader
 * recorded in blob metadata at upload time is the authority. Only that uploader
 * (or a foundation/super-admin role sweeping on their behalf) may discard.
 *
 * A blob with no recorded uploader is refused for everyone: "we do not know who
 * owns this" must never degrade into "anyone may delete it", which is exactly
 * the bug this closes. The failure is a 403 rather than a silent success so a
 * caller that genuinely needs cleanup can be told to re-upload/re-save.
 */
async function assertActorMayDiscardBlob(
  actor: BlobActor,
  containerName: string,
  blobName: string
): Promise<void> {
  if (isFoundationScopedRole(actor.roleCode)) return;

  const uploaderId = await getBlobUploaderId(containerName, blobName);
  if (uploaderId && uploaderId === actor.id) return;

  throw Errors.forbidden('Anda tidak berwenang membuang berkas tersebut');
}

/**
 * Discard an upload that never became a stored record.
 *
 * The upload and the record that references it are two separate requests
 * (upload → create record). When the second one fails, the blob uploaded by
 * the first is unreachable — no record points at it, so no read path can ever
 * authorize it — yet it stays in private storage forever. This endpoint lets
 * the consumer clean up that abandoned blob.
 *
 * Safety: only a blob that NO record references may be discarded. A blob some
 * record points at is a live document and is refused (deleting it would be the
 * exact cross-record destruction the ownership checks exist to prevent).
 *
 * **Authorisation (BUG 2).** A blob that no record references has no owner to
 * read off the database, so an attacker who knows an orphan URL — a colleague's
 * upload whose record is committing, say — must not be able to destroy it. The
 * discard is therefore bound to whoever uploaded the blob: `uploadToCloudStorage`
 * records the uploader in the blob's own metadata, and this refuses any actor
 * other than that uploader (foundation/super-admin roles may still sweep). A
 * blob with no recorded uploader — one uploaded before this guard existed, or
 * written out of band — is refused for everyone, because "no record of who owns
 * this" cannot be turned into "anyone may delete it".
 *
 * **Race (BUG 4).** Upload and create are two requests, and a discard can slip
 * between them: it reads "no record references this" at the instant the create
 * request is committing. The durable `BlobClaim` row closes it:
 *
 *   1. Claim the blob for discard FIRST (`claimBlobForDiscard`). This can only
 *      win when no live `RECORD` claim (or `DISCARD` claim) already holds the
 *      blob, so a create that has claimed it is respected.
 *   2. THEN probe the reference index once. Anything that committed before the
 *      claim is caught here.
 *   3. Tombstone the claim atomically (`markBlobDiscarded`) BEFORE the Azure
 *      delete. From the instant that conditional UPDATE succeeds the row can
 *      never be taken over again, so a create that was waiting out our delete
 *      cannot claim the URL. If the tombstone fails, a create won the row since
 *      the re-probe and we abort without deleting.
 *   4. Delete. Any create that tried to start after step 1 must first take a
 *      `RECORD` claim, which the tombstone now blocks permanently — so no record
 *      referencing the blob can commit between step 3 and the delete. No TOCTOU
 *      remains.
 *
 * The tombstone is deliberately NOT released after a successful delete: the blob
 * is gone, so leaving the row in place keeps every future create from
 * resurrecting the URL.
 *
 * A release runs only while the claim is still untombstoned. Once the tombstone
 * is set the row is terminal and is NEVER released, even if the delete throws:
 *
 *  - The delete may have reached Azure and been applied despite a transport
 *    error on the response. Releasing the row would then let a create claim the
 *    URL and persist a reference to a blob that no longer exists (BUG 7).
 *  - "Could not delete an orphan" must fail closed; a released tombstone would
 *    silently re-open the window. A later retry reconciles from the tombstone.
 *
 * The claim is released only on the paths that abort BEFORE the tombstone (the
 * reference re-probe, or a lost/stolen claim), where nothing irreversible has
 * been attempted and a retry is safe.
 *
 * Both callers (HR documents, e-office letters) invoke this ONLY after a create
 * request has already failed, but the coordination holds even when a *different*
 * request is committing the record for the same blob.
 */
export async function discardOrphanBlob(url: string, actor: BlobActor): Promise<void> {
  const parsed = parseBlobUrl(url);
  if (!parsed) {
    // Not a cloud blob. Either a local `/uploads/...` path or an arbitrary
    // external URL. The raw string is never used as a filesystem path — a
    // storage URL is untrusted input and `path.join` on it would be a
    // traversal/symlink/arbitrary-delete hole. Instead the middleware resolves
    // the *basename* against the uploads root with a strict shape check and
    // `realpath`, and only then is the resolved file unlinked.
    return discardLocalOrphanBlob(url, actor);
  }
  if (!isAllowedContainer(parsed.containerName)) {
    throw Errors.forbidden('Akses ke kontainer penyimpanan tersebut ditolak');
  }

  // Exhaustive, not first-match: `findBlobOwner` stops at the first probe that
  // hits, so a URL referenced by a record whose field it does not probe would
  // look orphaned and be deleted. `isBlobStillReferenced` checks every stored
  // blob-URL field, which is what "no record references this" has to mean
  // before an irreversible delete.
  if (await isBlobStillReferenced(url)) {
    throw Errors.conflict('Berkas sudah tersimpan pada sebuah catatan dan tidak dapat dibuang');
  }

  // Only the uploader may discard their own abandoned blob (see the doc above).
  await assertActorMayDiscardBlob(actor, parsed.containerName, parsed.blobName);

  // Take durable ownership BEFORE the final probe: from here, no create-record
  // request that honours the claim protocol can materialise a reference.
  const claimId = await claimBlobForDiscard(url, actor.id);
  if (!claimId) {
    // A live claim held by someone else: either a create is materialising or
    // another discard already owns it. Refuse; deleting would be unsafe.
    throw Errors.conflict(
      'Berkas sedang diproses pihak lain; coba lagi nanti'
    );
  }

  let tombstoned = false;
  try {
    // Re-probe under the claim: catches anything that committed before the
    // claim was taken. After this point the claim blocks any new commit.
    if (await isBlobStillReferenced(url)) {
      throw Errors.conflict('Berkas sudah tersimpan pada sebuah catatan dan tidak dapat dibuang');
    }

    // Close the last window: tombstone the claim atomically. From this instant
    // no create — including one already blocked on the row and retrying — can
    // take the claim over, so the delete that follows cannot land on a blob a
    // record just started referencing. If the tombstone fails, a create won the
    // row since the re-probe and the delete must not run.
    if (!(await markBlobDiscarded(claimId, actor.id))) {
      throw Errors.conflict('Berkas sedang diproses pihak lain; coba lagi nanti');
    }
    tombstoned = true;

    // The delete outcome is deliberately NOT recorded. A throw here leaves it
    // genuinely unknown — the request may or may not have reached Azure — so
    // claiming either result would be a lie. The tombstone plus reconciliation
    // (see `reconcileDiscardedBlobs`) resolves it later.
    await deleteFromCloudStorage(parsed.containerName, parsed.blobName);
  } catch (error) {
    // NEVER release a tombstoned claim, even though the delete threw: the
    // delete may have been applied at Azure before the error reached us, and
    // releasing the row would let a create reclaim the URL of a blob that no
    // longer exists (BUG 7). The tombstone keeps the URL terminal; a later
    // reconciliation retries the delete. Only a pre-tombstone abort releases,
    // so a transient conflict can be retried normally.
    if (!tombstoned) {
      await releaseBlobClaimById(claimId, actor.id).catch(() => undefined);
    }
    throw error;
  }

  // The blob is gone. The tombstone stays in place on purpose: releasing the
  // row here is exactly what let a waiting create reclaim the URL after the
  // delete and persist a reference to a blob that no longer existed.
}
