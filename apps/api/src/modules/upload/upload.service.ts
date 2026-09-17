import { prisma } from '@/lib/prisma';
import {
  generateSasUrl,
  parseBlobUrl,
  isAllowedContainer,
  isPublicContainer,
  deleteBlobIfStillOrphaned,
  getBlobUploaderId,
} from '@/utils/cloud-storage';
import { Errors } from '@/middleware/error';
import {
  findBlobOwner,
  isBlobStillReferenced,
  type BlobOwner,
  type UnitId,
} from '@/utils/blob-owner';
import { seesAllUnits, isFoundationScopedRole } from '@/utils/resolve-unit-id';
import { letterScopeWhere } from '@/utils/letter-access';
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
 * True when `url` is a local storage reference (`/uploads/...`) rather than a
 * cloud blob. Accepted as a relative path or an absolute URL on any host; the
 * path prefix is what identifies the storage provider.
 */
function isLocalUploadPath(url: string): boolean {
  try {
    return new URL(url, 'http://localhost').pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
}

/**
 * True when the authenticated actor may read the record that owns `blob`.
 *
 * A letter reuses the correspondence scoping rules (`letterScopeWhere`).
 * Personal documents (employee/student/portfolio) are NOT unit-public: only
 * the owner, a personnel-record administrator in the owner's unit, or a
 * foundation role may read them. Unit-owned records (reports, assets, books)
 * are readable by anyone scoped to that unit.
 */
async function assertActorMayReadBlob(actor: BlobActor, owner: BlobOwner): Promise<boolean> {
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

  // Not a cloud blob. The endpoint exists to sign *persisted upload
  // references*, so a local `/uploads/...` path (the other storage provider)
  // passes through unsigned. An arbitrary external URL is NOT a stored upload
  // reference this endpoint vouches for — returning it as `{ url }` success
  // implied a validation the callers never got, so it is refused instead.
  if (!parsed) {
    if (isLocalUploadPath(url)) {
      return { url };
    }
    throw Errors.badRequest('Referensi berkas tidak dikenali');
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

  const downloadUrl = await generateSasUrl(parsed.containerName, parsed.blobName, 60);
  return { url, downloadUrl };
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
 * **Race (BUG 3).** Upload and create are two requests, and a discard can slip
 * between them: it reads "no record references this" at the instant the create
 * request is committing. `deleteBlobIfStillOrphaned` closes this by waiting
 * `RACE_RECHECK_DELAY_MS` and then re-probing the reference index immediately
 * before the delete — a record that committed during the wait makes the delete
 * a no-op. The re-probe and the delete are deliberately adjacent (no await of
 * consequence between them), and the probe is exhaustive (`isBlobStillReferenced`
 * covers every stored blob-URL field, not just the first matching owner).
 *
 * Both callers (HR documents, e-office letters) invoke this ONLY after a create
 * request has already failed, so the normal path never races a live write; the
 * delay exists for the window where a *different* request is committing the
 * record for the same blob.
 */
export async function discardOrphanBlob(url: string, actor: BlobActor): Promise<void> {
  const parsed = parseBlobUrl(url);
  if (!parsed) return; // local /uploads path — nothing in this application to remove
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

  // Wait out the race window, then re-probe: a create that commits while we
  // wait must make this a no-op.
  const deleted = await deleteBlobIfStillOrphaned(parsed.containerName, parsed.blobName, () =>
    isBlobStillReferenced(url)
  );
  if (!deleted) {
    throw Errors.conflict(
      'Berkas belum dapat dibuang karena masih berpotensi dirujuk catatan baru; coba lagi nanti'
    );
  }
}
