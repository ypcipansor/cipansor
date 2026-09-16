import { prisma } from '@/lib/prisma';
import {
  generateSasUrl,
  parseBlobUrl,
  isAllowedContainer,
  isPublicContainer,
  deleteFromCloudStorage,
} from '@/utils/cloud-storage';
import { Errors } from '@/middleware/error';
import { seesAllUnits, isFoundationScopedRole } from '@/utils/resolve-unit-id';
import { letterScopeWhere } from '@/utils/letter-access';
import { mayAdministerEmployeeDocuments } from '@cipansor/shared';
import type { JwtPayload } from '@/lib/jwt';
import type { GetSasUrlResult } from '@cipansor/shared';

/** The subset of the authenticated user the SAS owner check needs. */
export type BlobActor = Pick<JwtPayload, 'id' | 'roleCode' | 'unitId' | 'permissions'>;

type UnitId = string | null | undefined;

/**
 * The record a persisted blob URL resolves to, and therefore the rule that
 * decides who may read it.
 *
 * The container is NOT the type: `cipansor-documents` is the upload
 * middleware's shared default, so it holds employee documents, student
 * documents, portfolio files, report photos, asset/book/package images and
 * more. Treating every blob in it as an employee document meant every one of
 * those other records 403'd (its blob had "no owner"), so a file that had
 * been uploaded successfully could never be opened again.
 */
type BlobOwner =
  /** A letter or one of its attachments — scoped by correspondence rules. */
  | { kind: 'letter'; letterId: string }
  /**
   * A personal document belonging to one user (employee or student). Only the
   * owner, a personnel-record administrator in the same unit, or a foundation
   * role may read it — NOT everyone in the same unit. A leaked stable URL
   * would otherwise open one person's KTP/Ijazah to every colleague.
   */
  | { kind: 'user-document'; userId: string; unitId: UnitId }
  /** A record owned by a unit (report, photo, asset, book, …). */
  | { kind: 'unit'; unitId: UnitId }
  /** A foundation-owned record (board member photo, foundation document). */
  | { kind: 'foundation' }
  /** Intentionally public — e.g. a portfolio marked `isShowcase`. */
  | { kind: 'public' };

/** Locate a student's owning user id + unit, for a personal-document blob. */
async function ownerForStudentDocument(blobUrl: string): Promise<BlobOwner | null> {
  const doc = await prisma.studentDocument.findFirst({
    where: { fileUrl: blobUrl },
    select: { student: { select: { userId: true, unitId: true } } },
  });
  if (doc) {
    return { kind: 'user-document', userId: doc.student.userId, unitId: doc.student.unitId };
  }
  return null;
}

/** Locate the letter or letter attachment that references `blobUrl`. */
async function ownerForLetter(blobUrl: string): Promise<BlobOwner | null> {
  const letter = await prisma.letter.findFirst({
    where: { fileUrl: blobUrl },
    select: { id: true },
  });
  if (letter) return { kind: 'letter', letterId: letter.id };

  const attachment = await prisma.letterAttachment.findFirst({
    where: { fileUrl: blobUrl },
    select: { letterId: true },
  });
  if (attachment) return { kind: 'letter', letterId: attachment.letterId };
  return null;
}

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
    return ownerForLetter(blobUrl);
  }

  if (containerName === 'student-documents') {
    return ownerForStudentDocument(blobUrl);
  }

  if (containerName !== 'cipansor-documents') return null;

  // ---- cipansor-documents: the shared default container ----
  // Every distinct record type that can land here is tried in turn; the first
  // match decides the authorization rule.
  //
  // Correspondence is probed here too, not only in `e-office-documents`. The
  // upload middleware routes every upload to this container (its default), so
  // a letter attachment uploaded through it lands here; searching only
  // `e-office-documents` meant a letter file had "no owner" and its SAS request
  // 403'd even though the record existed and the caller could read it.
  const letter = await ownerForLetter(blobUrl);
  if (letter) return letter;

  const employeeDoc = await prisma.employeeDocument.findFirst({
    where: { fileUrl: blobUrl },
    select: { userId: true, user: { select: { unitId: true } } },
  });
  if (employeeDoc) {
    return { kind: 'user-document', userId: employeeDoc.userId, unitId: employeeDoc.user.unitId };
  }

  const studentDoc = await ownerForStudentDocument(blobUrl);
  if (studentDoc) return studentDoc;

  const portfolioFile = await prisma.portfolioFile.findFirst({
    where: { fileUrl: blobUrl },
    select: {
      portfolio: { select: { student: { select: { userId: true, unitId: true } }, isShowcase: true } },
    },
  });
  if (portfolioFile) {
    if (portfolioFile.portfolio.isShowcase) return { kind: 'public' };
    return {
      kind: 'user-document',
      userId: portfolioFile.portfolio.student.userId,
      unitId: portfolioFile.portfolio.student.unitId,
    };
  }

  const reportPhoto = await prisma.dailyReportPhoto.findFirst({
    where: { photoUrl: blobUrl },
    select: { report: { select: { unitId: true, student: { select: { userId: true } } } } },
  });
  if (reportPhoto) {
    return { kind: 'unit', unitId: reportPhoto.report.unitId };
  }

  const paudPhoto = await prisma.pAUDReportPhoto.findFirst({
    where: { photoUrl: blobUrl },
    select: { report: { select: { unitId: true } } },
  });
  if (paudPhoto) return { kind: 'unit', unitId: paudPhoto.report.unitId };

  const paudEvidence = await prisma.pAUDAssessmentEvidence.findFirst({
    where: { fileUrl: blobUrl },
    select: { assessment: { select: { unitId: true } } },
  });
  if (paudEvidence) return { kind: 'unit', unitId: paudEvidence.assessment.unitId };

  const registrantDoc = await prisma.registrantDocument.findFirst({
    where: { fileUrl: blobUrl },
    select: { registrant: { select: { admissionPeriod: { select: { unitId: true } } } } },
  });
  if (registrantDoc) {
    return { kind: 'unit', unitId: registrantDoc.registrant.admissionPeriod.unitId };
  }

  const courseCert = await prisma.courseCertificate.findFirst({
    where: { fileUrl: blobUrl },
    select: { enrollment: { select: { course: { select: { unitId: true } } } } },
  });
  if (courseCert) return { kind: 'unit', unitId: courseCert.enrollment.course.unitId };

  const qualityEvidence = await prisma.qualityEvidence.findFirst({
    where: { fileUrl: blobUrl },
    select: { unitId: true },
  });
  if (qualityEvidence) return { kind: 'unit', unitId: qualityEvidence.unitId };

  const studentPackage = await prisma.studentPackage.findFirst({
    where: { photoUrl: blobUrl },
    select: { unitId: true },
  });
  if (studentPackage) return { kind: 'unit', unitId: studentPackage.unitId };

  const achievement = await prisma.extracurricularAchievement.findFirst({
    where: { OR: [{ certificateUrl: blobUrl }, { photoUrl: blobUrl }] },
    select: { extracurricular: { select: { unitId: true } } },
  });
  if (achievement) return { kind: 'unit', unitId: achievement.extracurricular.unitId };

  const book = await prisma.book.findFirst({
    where: { OR: [{ coverUrl: blobUrl }, { fileUrl: blobUrl }] },
    select: { unitId: true },
  });
  if (book) return { kind: 'unit', unitId: book.unitId };

  const asset = await prisma.asset.findFirst({
    where: { photoUrl: blobUrl },
    select: { unitId: true },
  });
  if (asset) return { kind: 'unit', unitId: asset.unitId };

  // A student's own photo is personal data: reachable by the student
  // themselves, a personnel administrator in their unit, or foundation only.
  const student = await prisma.student.findFirst({
    where: { photoUrl: blobUrl },
    select: { userId: true, unitId: true },
  });
  if (student) {
    return { kind: 'user-document', userId: student.userId, unitId: student.unitId };
  }

  const boardMember = await prisma.boardMember.findFirst({
    where: { photoUrl: blobUrl },
    select: { id: true },
  });
  if (boardMember) return { kind: 'foundation' };

  const foundationDocument = await prisma.foundationDocument.findFirst({
    where: { fileUrl: blobUrl },
    select: { id: true },
  });
  if (foundationDocument) return { kind: 'foundation' };

  return null;
}

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
 * exact cross-record destruction the ownership checks exist to prevent). The
 * caller must already know the exact, unguessable blob URL, which bounds the
 * blast radius of an authenticated user discarding an orphan.
 */
export async function discardOrphanBlob(url: string, _actor: BlobActor): Promise<void> {
  const parsed = parseBlobUrl(url);
  if (!parsed) return; // local /uploads path — nothing in this application to remove
  if (!isAllowedContainer(parsed.containerName)) {
    throw Errors.forbidden('Akses ke kontainer penyimpanan tersebut ditolak');
  }

  const owner = await findBlobOwner(parsed.containerName, url);
  if (owner) {
    throw Errors.conflict('Berkas sudah tersimpan pada sebuah catatan dan tidak dapat dibuang');
  }

  await deleteFromCloudStorage(parsed.containerName, parsed.blobName);
}
