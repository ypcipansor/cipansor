import { prisma } from '@/lib/prisma';
import {
  generateSasUrl,
  parseBlobUrl,
  isAllowedContainer,
  isPublicContainer,
} from '@/utils/cloud-storage';
import { Errors } from '@/middleware/error';
import { seesAllUnits } from '@/utils/resolve-unit-id';
import { letterScopeWhere } from '@/utils/letter-access';
import type { JwtPayload } from '@/lib/jwt';
import type { GetSasUrlResult } from '@cipansor/shared';

/** The subset of the authenticated user the SAS owner check needs. */
export type BlobActor = Pick<JwtPayload, 'id' | 'roleCode' | 'unitId' | 'permissions'>;

/** Blob URLs are opaque stable references; this is the record they resolve to. */
type BlobOwner =
  | { kind: 'letter'; letterId: string; unitId: string | null }
  | { kind: 'employee-document'; userId: string; unitId?: string | null };

/**
 * Locate the record that references `blobUrl` among the application's private
 * containers. Returns null when no record owns it.
 *
 * This is a forward index over the record types that persist cloud blob URLs;
 * the on-demand SAS endpoint must not mint a link for a blob that no record in
 * this application references, or for a record the caller may not read.
 */
async function findBlobOwner(containerName: string, blobUrl: string): Promise<BlobOwner | null> {
  if (containerName === 'e-office-documents') {
    const letter = await prisma.letter.findFirst({
      where: { fileUrl: blobUrl },
      select: { id: true, unitId: true, createdById: true },
    });
    if (letter) return { kind: 'letter', letterId: letter.id, unitId: letter.unitId };
    const attachment = await prisma.letterAttachment.findFirst({
      where: { fileUrl: blobUrl },
      select: { letterId: true, letter: { select: { unitId: true } } },
    });
    if (attachment) {
      return {
        kind: 'letter',
        letterId: attachment.letterId,
        unitId: attachment.letter.unitId,
      };
    }
    return null;
  }

  if (containerName === 'cipansor-documents') {
    const doc = await prisma.employeeDocument.findFirst({
      where: { fileUrl: blobUrl },
      select: { userId: true, user: { select: { unitId: true } } },
    });
    if (doc) return { kind: 'employee-document', userId: doc.userId, unitId: doc.user.unitId };
    return null;
  }

  if (containerName === 'student-documents') {
    const doc = await prisma.studentDocument.findFirst({
      where: { fileUrl: blobUrl },
      select: {
        student: { select: { userId: true, unitId: true } },
      },
    });
    if (doc) {
      return {
        kind: 'employee-document',
        userId: doc.student.userId,
        unitId: doc.student.unitId,
      };
    }
    return null;
  }

  return null;
}

/**
 * True when the authenticated actor may read the record that owns `blob`.
 *
 * Letter access reuses the correspondence scoping rules (`letterScopeWhere`),
 * so an actor only reaches a blob URL for a letter they are part of. Employee
 * / student documents fall back to a unit-scope check mirrored from the HR
 * module: foundation executives and super admins see everyone; others only
 * records in their own unit.
 */
async function assertActorMayReadBlob(actor: BlobActor, owner: BlobOwner): Promise<boolean> {
  if (owner.kind === 'letter') {
    if (seesAllUnits(actor)) return true;
    // A letter is readable only if it falls within the actor's correspondence scope.
    const scope = letterScopeWhere(actor);
    const matches = await prisma.letter.count({
      where: { id: owner.letterId, ...scope },
    });
    return matches > 0;
  }

  // employee / student document — unit scope.
  if (seesAllUnits(actor)) return true;
  if (!owner.unitId) return false;
  return owner.unitId === actor.unitId;
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

  // Not a cloud blob at all (local /uploads path, external URL, unparsable) —
  // nothing to sign; the caller renders `url` directly.
  if (!parsed) {
    return { url };
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
