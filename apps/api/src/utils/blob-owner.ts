import { prisma } from '@/lib/prisma';

export type UnitId = string | null | undefined;

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
export type BlobOwner =
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
 *
 * Every model that stores an uploaded URL needs a probe here — an unprobed
 * record is a blob the upload endpoint can persist but the SAS endpoint can
 * never sign, so its consumer 403s forever. The `upload.service.test.ts`
 * "every URL field has an owner probe" guard fails when a new field is added
 * without one.
 */
export async function findBlobOwner(
  containerName: string,
  blobUrl: string
): Promise<BlobOwner | null> {
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
      portfolio: {
        select: { student: { select: { userId: true, unitId: true } }, isShowcase: true },
      },
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

  // A parent/student's transfer proof (Payment.proofUrl) is personal financial
  // data: only the student it pays for, a personnel-record administrator in
  // their unit, or a foundation role may read it.
  const payment = await prisma.payment.findFirst({
    where: { proofUrl: blobUrl },
    select: { invoice: { select: { student: { select: { userId: true, unitId: true } } } } },
  });
  if (payment) {
    return {
      kind: 'user-document',
      userId: payment.invoice.student.userId,
      unitId: payment.invoice.student.unitId,
    };
  }

  // Donation transfer proof. A donation may be foundation-wide (no unit), in
  // which case only a foundation role may read it.
  const donation = await prisma.donation.findFirst({
    where: { paymentProof: blobUrl },
    select: { unitId: true },
  });
  if (donation) return { kind: 'unit', unitId: donation.unitId };

  // E-Simaan recitation recording: personal to the santri it belongs to.
  const tahfidzRecord = await prisma.tahfidzRecord.findFirst({
    where: { audioUrl: blobUrl },
    select: { student: { select: { userId: true, unitId: true } } },
  });
  if (tahfidzRecord) {
    return {
      kind: 'user-document',
      userId: tahfidzRecord.student.userId,
      unitId: tahfidzRecord.student.unitId,
    };
  }

  const muhadatsah = await prisma.muhadatsah.findFirst({
    where: { recordingUrl: blobUrl },
    select: { unitId: true },
  });
  if (muhadatsah) return { kind: 'unit', unitId: muhadatsah.unitId };

  // Announcement attachment: unit-owned (null unitId = all units).
  const announcement = await prisma.announcement.findFirst({
    where: { attachmentUrl: blobUrl },
    select: { unitId: true },
  });
  if (announcement) return { kind: 'unit', unitId: announcement.unitId };

  // A revocation request's supporting document shares the letter's scope.
  const revocationRequest = await prisma.letterRevocationRequest.findFirst({
    where: { attachmentUrl: blobUrl },
    select: { letterId: true },
  });
  if (revocationRequest) return { kind: 'letter', letterId: revocationRequest.letterId };

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

/**
 * Every persisted blob-URL field in the application, with the record count
 * query that decides whether any row still references a URL.
 *
 * `findBlobOwner` stops at the first match; this index deliberately looks at
 * ALL of them. Delete paths must not remove a blob while a *second* record
 * still points at the same URL, and cloning a record forward is a legitimate
 * way for that to happen. An unprobed field here is a URL that could be
 * deleted out from under a live record (BUG: shared-URL destruction).
 *
 * Keep in sync with `findBlobOwner` above — the `blob-owner.test.ts`
 * "every findBlobOwner probe has a reference probe" guard fails on drift.
 */
const BLOB_REFERENCE_COUNTERS: ReadonlyArray<{
  label: string;
  where: (url: string) => Record<string, unknown>;
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
}> = [
  { label: 'letter', where: (u) => ({ fileUrl: u }), count: (a) => prisma.letter.count(a) },
  {
    label: 'letterAttachment',
    where: (u) => ({ fileUrl: u }),
    count: (a) => prisma.letterAttachment.count(a),
  },
  {
    label: 'employeeDocument',
    where: (u) => ({ fileUrl: u }),
    count: (a) => prisma.employeeDocument.count(a),
  },
  {
    label: 'studentDocument',
    where: (u) => ({ fileUrl: u }),
    count: (a) => prisma.studentDocument.count(a),
  },
  {
    label: 'portfolioFile',
    where: (u) => ({ fileUrl: u }),
    count: (a) => prisma.portfolioFile.count(a),
  },
  {
    label: 'dailyReportPhoto',
    where: (u) => ({ photoUrl: u }),
    count: (a) => prisma.dailyReportPhoto.count(a),
  },
  {
    label: 'paudReportPhoto',
    where: (u) => ({ photoUrl: u }),
    count: (a) => prisma.pAUDReportPhoto.count(a),
  },
  {
    label: 'paudAssessmentEvidence',
    where: (u) => ({ fileUrl: u }),
    count: (a) => prisma.pAUDAssessmentEvidence.count(a),
  },
  {
    label: 'registrantDocument',
    where: (u) => ({ fileUrl: u }),
    count: (a) => prisma.registrantDocument.count(a),
  },
  {
    label: 'courseCertificate',
    where: (u) => ({ fileUrl: u }),
    count: (a) => prisma.courseCertificate.count(a),
  },
  {
    label: 'qualityEvidence',
    where: (u) => ({ fileUrl: u }),
    count: (a) => prisma.qualityEvidence.count(a),
  },
  {
    label: 'studentPackage',
    where: (u) => ({ photoUrl: u }),
    count: (a) => prisma.studentPackage.count(a),
  },
  {
    label: 'extracurricularAchievement',
    where: (u) => ({ OR: [{ certificateUrl: u }, { photoUrl: u }] }),
    count: (a) => prisma.extracurricularAchievement.count(a),
  },
  {
    label: 'book',
    where: (u) => ({ OR: [{ coverUrl: u }, { fileUrl: u }] }),
    count: (a) => prisma.book.count(a),
  },
  { label: 'asset', where: (u) => ({ photoUrl: u }), count: (a) => prisma.asset.count(a) },
  { label: 'payment', where: (u) => ({ proofUrl: u }), count: (a) => prisma.payment.count(a) },
  {
    label: 'donation',
    where: (u) => ({ paymentProof: u }),
    count: (a) => prisma.donation.count(a),
  },
  {
    label: 'tahfidzRecord',
    where: (u) => ({ audioUrl: u }),
    count: (a) => prisma.tahfidzRecord.count(a),
  },
  {
    label: 'muhadatsah',
    where: (u) => ({ recordingUrl: u }),
    count: (a) => prisma.muhadatsah.count(a),
  },
  {
    label: 'announcement',
    where: (u) => ({ attachmentUrl: u }),
    count: (a) => prisma.announcement.count(a),
  },
  {
    label: 'letterRevocationRequest',
    where: (u) => ({ attachmentUrl: u }),
    count: (a) => prisma.letterRevocationRequest.count(a),
  },
  { label: 'student', where: (u) => ({ photoUrl: u }), count: (a) => prisma.student.count(a) },
  {
    label: 'boardMember',
    where: (u) => ({ photoUrl: u }),
    count: (a) => prisma.boardMember.count(a),
  },
  {
    label: 'foundationDocument',
    where: (u) => ({ fileUrl: u }),
    count: (a) => prisma.foundationDocument.count(a),
  },
];

/**
 * True when any record in this application still references `blobUrl`.
 *
 * Delete paths call this before removing a blob. The URL-uniqueness
 * assumption (one `crypto.randomUUID()` per physical upload) does not hold
 * across all data: a copy/clone path or imported legacy rows can point two
 * records at one blob, and deleting on the first record's removal would
 * destroy a file the second still needs. Only a genuinely orphaned blob may
 * be reclaimed.
 */
export async function isBlobStillReferenced(blobUrl: string): Promise<boolean> {
  for (const counter of BLOB_REFERENCE_COUNTERS) {
    const count = await counter.count({ where: counter.where(blobUrl) });
    if (count > 0) return true;
  }
  return false;
}
