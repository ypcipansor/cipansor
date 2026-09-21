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
import { discardUnderClaim } from '@/utils/blob-discard';
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
 * Discard a local-storage orphan upload.
 *
 * The local provider must give the SAME guarantees as the cloud path. It shares
 * the single `discardUnderClaim` protocol — claim → final probe under the claim
 * → tombstone → physical unlink — so a create-record committing after the probe
 * cannot have its file destroyed: the create takes a `RECORD` claim first, and
 * the tombstone blocks one taken after ours.
 *
 * Ownership is checked against the sidecar recorded at upload time (a local
 * file has no blob metadata). Unknown ownership is refused for everyone, never
 * treated as "anyone may delete it".
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

  if (!isFoundationScopedRole(actor.roleCode)) {
    const uploaderId = await readLocalUploadOwner(resolved);
    if (!uploaderId || uploaderId !== actor.id) {
      // No recorded uploader (pre-sidecar upload, or written out of band) is
      // refused for everyone: unknown ownership must not become "anyone may
      // delete it", matching the cloud path.
      throw Errors.forbidden('Anda tidak berwenang membuang berkas tersebut');
    }
  }

  const refs = Array.from(
    new Set([
      ...blobReferenceCandidates(url),
      ...blobReferenceCandidates(path0),
      path0,
    ])
  );

  // Same protocol as the cloud path: claim, final probe under the claim,
  // tombstone, then unlink. The tombstone makes the URL terminal so no create
  // can reference a file that is gone.
  const outcome = await discardUnderClaim(
    path0,
    actor.id,
    () => isBlobStillReferencedByRefs(refs),
    () => removeLocalUpload(resolved)
  );

  if (outcome === 'referenced') {
    throw Errors.conflict('Berkas sudah tersimpan pada sebuah catatan dan tidak dapat dibuang');
  }
  if (outcome === 'busy' || outcome === 'claim-lost') {
    throw Errors.conflict('Berkas sedang diproses pihak lain; coba lagi nanti');
  }
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
 * (upload → create record). When the second fails, the blob uploaded by the
 * first is unreachable — no record points at it — yet it stays in storage
 * forever. This endpoint lets the consumer clean that up.
 *
 * Safety invariant (shared with every other delete path):
 *
 *     claim → final exhaustive probe under the claim → tombstone → physical delete
 *
 * Only an uploader-recorded blob may be discarded by anyone other than a
 * foundation role; a blob no record references and with no recorded uploader is
 * refused for everyone. A tombstone is never released after a successful (or
 * attempted) delete, so a waiting create can never reference a deleted blob.
 */
export async function discardOrphanBlob(url: string, actor: BlobActor): Promise<void> {
  const parsed = parseBlobUrl(url);
  if (!parsed) {
    // Not a cloud blob: a local `/uploads/...` path or an arbitrary external
    // URL. The raw string is never used as a filesystem path.
    return discardLocalOrphanBlob(url, actor);
  }
  if (!isAllowedContainer(parsed.containerName)) {
    throw Errors.forbidden('Akses ke kontainer penyimpanan tersebut ditolak');
  }

  // Only the uploader may discard their own abandoned blob.
  await assertActorMayDiscardBlob(actor, parsed.containerName, parsed.blobName);

  const outcome = await discardUnderClaim(
    url,
    actor.id,
    () => isBlobStillReferenced(url),
    () => deleteFromCloudStorage(parsed.containerName, parsed.blobName)
  );

  if (outcome === 'referenced') {
    throw Errors.conflict('Berkas sudah tersimpan pada sebuah catatan dan tidak dapat dibuang');
  }
  if (outcome === 'busy' || outcome === 'claim-lost') {
    throw Errors.conflict('Berkas sedang diproses pihak lain; coba lagi nanti');
  }
}
