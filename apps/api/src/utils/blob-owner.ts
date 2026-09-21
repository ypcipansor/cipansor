import { prisma } from '@/lib/prisma';
import { activeUserRoleWhere } from '@/utils/active-role';

export type UnitId = string | null | undefined;

/**
 * The unit a user's access is scoped to: their primary active role
 * assignment, falling back to the home unit on the profile.
 *
 * Mirrors `findDocumentOwnerTarget` in `modules/hr/employee-documents.service.ts`
 * and the token scope every login path mints (`tokenUnitId`). An employee's
 * `user.unitId` is a home address; the assignment is what a token carries, and
 * the two legitimately disagree when a person holds a role scoped to another
 * unit. Using the home unit here let a home-unit admin download a personal
 * document while the assignment-unit admin—whose token scope actually reaches
 * it—was refused: the two halves of the same authorization decision disagreed.
 */
function assignmentUnit(user: {
  unitId: string | null;
  userRoles?: Array<{ unitId: string | null }>;
}): UnitId {
  return user.userRoles?.[0]?.unitId ?? user.unitId;
}

/** Select a user's assignment-scoped unit, primary role assignment first. */
const ASSIGNMENT_UNIT_SELECT = {
  unitId: true,
  userRoles: {
    where: activeUserRoleWhere(),
    orderBy: { isPrimary: 'desc' },
    select: { unitId: true },
  },
} as const;

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
  /**
   * A parent/student's transfer proof (`Payment.proofUrl`). Personal financial
   * data, but read by a DIFFERENT set than employee documents: the student it
   * pays for, a foundation role, or a finance verifier (TU/treasurer/admin) in
   * the student's unit. Kept distinct because the HR-document rule excludes the
   * unit treasurer, who is exactly who verifies payments — folding this into
   * `user-document` 403'd every proof for the verifier.
   */
  | { kind: 'payment-proof'; studentUserId: string; unitId: UnitId }
  /** A record owned by a unit (report, photo, asset, book, …). */
  | { kind: 'unit'; unitId: UnitId }
  /** A foundation-owned record (board member photo, foundation document). */
  | { kind: 'foundation' }
  /**
   * A site-wide asset with no per-unit owner (foundation/unit logo, library
   * catalog cover). Any signed-in user may read it; it is not a personal
   * document, so unit scoping would deny the very people who display it.
   */
  | { kind: 'authenticated' }
  /** Intentionally public — e.g. a portfolio marked `isShowcase`. */
  | { kind: 'public' };

/**
 * One stored reference to a blob, or the set of equivalent spellings of it.
 * See {@link findBlobOwnerByRefs} for why more than one is needed.
 */
export type BlobRef = string | readonly string[];

/** `where` fragment matching `column` against one reference or any of several. */
function refWhere(column: string, ref: BlobRef): Record<string, unknown> {
  return Array.isArray(ref) ? { [column]: { in: ref } } : { [column]: ref };
}

/** `where` fragment for a `String[]` column containing one reference or any of several. */
function refHas(column: string, ref: BlobRef): Record<string, unknown> {
  return Array.isArray(ref) ? { [column]: { hasSome: ref } } : { [column]: { has: ref } };
}

/** Normalise a candidate list: one entry stays a scalar for the indexed path. */
function normalizeRef(refs: readonly string[]): BlobRef {
  return refs.length === 1 ? refs[0] : refs;
}

/** Locate a student's owning user id + unit, for a personal-document blob. */
async function ownerForStudentDocument(ref: BlobRef): Promise<BlobOwner | null> {
  const doc = await prisma.studentDocument.findFirst({
    where: refWhere('fileUrl', ref),
    select: { student: { select: { userId: true, unitId: true } } },
  });
  if (doc) {
    return { kind: 'user-document', userId: doc.student.userId, unitId: doc.student.unitId };
  }
  return null;
}

/** A unit-owned record, readably by every signed-in user when it has no unit. */
function unitOrAuthenticatedOwner(unitId: UnitId): BlobOwner {
  return unitId ? { kind: 'unit', unitId } : { kind: 'authenticated' };
}

/** Locate the letter or letter attachment that references `ref`. */
async function ownerForLetter(ref: BlobRef): Promise<BlobOwner | null> {
  const letter = await prisma.letter.findFirst({
    where: refWhere('fileUrl', ref),
    select: { id: true },
  });
  if (letter) return { kind: 'letter', letterId: letter.id };

  const attachment = await prisma.letterAttachment.findFirst({
    where: refWhere('fileUrl', ref),
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
  return findBlobOwnerByRefs(containerName, [blobUrl]);
}

/**
 * {@link findBlobOwner} over any of several equivalent stored references.
 *
 * A single physical upload can be stored in more than one spelling: the local
 * provider persists a host-relative `/uploads/<file>` path, while the same
 * recording may also be addressed absolutely (`https://host/uploads/<file>`),
 * and a URL persisted before a host change may name a different origin for the
 * same blob. The probes below are therefore parameterised by every reference the
 * caller considers equivalent (see `blobReferenceCandidates`), and every
 * `where` clause compares against the whole set. Passing one reference keeps the
 * original behaviour.
 *
 * The first record type that matches in priority order still decides the rule:
 * the widening adds address spellings, not record types, so it cannot change
 * which owner wins when one URL is referenced by several records.
 */
export async function findBlobOwnerByRefs(
  containerName: string,
  refs: readonly string[]
): Promise<BlobOwner | null> {
  if (refs.length === 0) return null;
  // The probes compare a single column against each candidate. A one-element
  // list stays a scalar, which keeps `where: { fileUrl: <url> }` on the fast,
  // index-friendly path and leaves a single-URL lookup byte-for-byte unchanged.
  const ref = normalizeRef(refs);
  if (containerName === 'e-office-documents') {
    return ownerForLetter(ref);
  }

  if (containerName === 'student-documents') {
    return ownerForStudentDocument(ref);
  }

  if (containerName !== 'cipansor-documents') return null;

  // ---- cipansor-documents: the shared default container ----
  //
  // Every distinct record type that can land here is tried, and the
  // highest-priority match decides the authorization rule. The probes are
  // grouped into ordered batches that run in parallel: the probes are
  // independent `findFirst`s on different tables, so 40 of them serially is
  // 40 round trips (~30ms measured) where a bounded number of parallel
  // round trips does the same work. Within a batch the winner is the first
  // non-null in array order, and batches run in order, so the priority
  // order below is exactly the one a fully serial version had.
  //
  // Correspondence is probed here too, not only in `e-office-documents`. The
  // upload middleware routes every upload to this container (its default), so
  // a letter attachment uploaded through it lands here; searching only
  // `e-office-documents` meant a letter file had "no owner" and its SAS request
  // 403'd even though the record existed and the caller could read it.
  const batches: Array<Array<() => Promise<BlobOwner | null>>> = [
    [
      async () => {
        const letter = await ownerForLetter(ref);
        if (letter) return letter;
        return null;
      },
      async () => {
        const employeeDoc = await prisma.employeeDocument.findFirst({
          where: { ...refWhere('fileUrl', ref) },
          select: { userId: true, user: { select: ASSIGNMENT_UNIT_SELECT } },
        });
        if (employeeDoc) {
          return {
            kind: 'user-document',
            userId: employeeDoc.userId,
            unitId: assignmentUnit(employeeDoc.user),
          };
        }
        return null;
      },
      async () => {
        const studentDoc = await ownerForStudentDocument(ref);
        if (studentDoc) return studentDoc;
        return null;
      },
    ],
    [
      async () => {
        const portfolioFile = await prisma.portfolioFile.findFirst({
          where: { ...refWhere('fileUrl', ref) },
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
        return null;
      },
      async () => {
        const reportPhoto = await prisma.dailyReportPhoto.findFirst({
          where: { ...refWhere('photoUrl', ref) },
          select: { report: { select: { unitId: true, student: { select: { userId: true } } } } },
        });
        if (reportPhoto) {
          return { kind: 'unit', unitId: reportPhoto.report.unitId };
        }
        return null;
      },
      async () => {
        const paudPhoto = await prisma.pAUDReportPhoto.findFirst({
          where: { ...refWhere('photoUrl', ref) },
          select: { report: { select: { unitId: true } } },
        });
        if (paudPhoto) return { kind: 'unit', unitId: paudPhoto.report.unitId };
        return null;
      },
      async () => {
        const paudEvidence = await prisma.pAUDAssessmentEvidence.findFirst({
          where: { ...refWhere('fileUrl', ref) },
          select: { assessment: { select: { unitId: true } } },
        });
        if (paudEvidence) return { kind: 'unit', unitId: paudEvidence.assessment.unitId };
        return null;
      },
      async () => {
        const registrantDoc = await prisma.registrantDocument.findFirst({
          where: { ...refWhere('fileUrl', ref) },
          select: { registrant: { select: { admissionPeriod: { select: { unitId: true } } } } },
        });
        if (registrantDoc) {
          return { kind: 'unit', unitId: registrantDoc.registrant.admissionPeriod.unitId };
        }
        return null;
      },
      async () => {
        const courseCert = await prisma.courseCertificate.findFirst({
          where: { ...refWhere('fileUrl', ref) },
          select: { enrollment: { select: { course: { select: { unitId: true } } } } },
        });
        if (courseCert) return { kind: 'unit', unitId: courseCert.enrollment.course.unitId };
        return null;
      },
      async () => {
        const qualityEvidence = await prisma.qualityEvidence.findFirst({
          where: { ...refWhere('fileUrl', ref) },
          select: { unitId: true },
        });
        if (qualityEvidence) return { kind: 'unit', unitId: qualityEvidence.unitId };
        return null;
      },
    ],
    [
      async () => {
        const studentPackage = await prisma.studentPackage.findFirst({
          where: { ...refWhere('photoUrl', ref) },
          select: { unitId: true },
        });
        if (studentPackage) return { kind: 'unit', unitId: studentPackage.unitId };
        return null;
      },
      async () => {
        const achievement = await prisma.extracurricularAchievement.findFirst({
          where: { OR: [refWhere('certificateUrl', ref), refWhere('photoUrl', ref)] },
          select: { extracurricular: { select: { unitId: true } } },
        });
        if (achievement) return { kind: 'unit', unitId: achievement.extracurricular.unitId };
        return null;
      },
      async () => {
        const book = await prisma.book.findFirst({
          where: { OR: [refWhere('coverUrl', ref), refWhere('fileUrl', ref)] },
          select: { unitId: true },
        });
        if (book) return { kind: 'unit', unitId: book.unitId };
        return null;
      },
      async () => {
        const asset = await prisma.asset.findFirst({
          where: { ...refWhere('photoUrl', ref) },
          select: { unitId: true },
        });
        if (asset) return { kind: 'unit', unitId: asset.unitId };

        // A parent/student's transfer proof (Payment.proofUrl) is personal financial
        // data: the student it pays for, a finance verifier in their unit, or a
        // foundation role may read it. Deliberately NOT `user-document`: the unit
        // treasurer verifies payments but is not a personnel-record administrator, so
        // the employee-document rule refused them the proof they judge.
        return null;
      },
      async () => {
        const payment = await prisma.payment.findFirst({
          where: { ...refWhere('proofUrl', ref) },
          select: { invoice: { select: { student: { select: { userId: true, unitId: true } } } } },
        });
        if (payment) {
          return {
            kind: 'payment-proof',
            studentUserId: payment.invoice.student.userId,
            unitId: payment.invoice.student.unitId,
          };
        }

        // Donation transfer proof. A donation may be foundation-wide (no unit), in
        // which case only a foundation role may read it.
        return null;
      },
      async () => {
        const donation = await prisma.donation.findFirst({
          where: { ...refWhere('paymentProof', ref) },
          select: { unitId: true },
        });
        if (donation) return { kind: 'unit', unitId: donation.unitId };

        // E-Simaan recitation recording: personal to the santri it belongs to.
        return null;
      },
      async () => {
        const tahfidzRecord = await prisma.tahfidzRecord.findFirst({
          where: { ...refWhere('audioUrl', ref) },
          select: { student: { select: { userId: true, unitId: true } } },
        });
        if (tahfidzRecord) {
          return {
            kind: 'user-document',
            userId: tahfidzRecord.student.userId,
            unitId: tahfidzRecord.student.unitId,
          };
        }
        return null;
      },
    ],
    [
      async () => {
        const muhadatsah = await prisma.muhadatsah.findFirst({
          where: { ...refWhere('recordingUrl', ref) },
          select: { unitId: true },
        });
        if (muhadatsah) return { kind: 'unit', unitId: muhadatsah.unitId };

        // Announcement attachment. `unitId = null` means "all units": an
        // announcement every user is meant to receive. Treating that as an unowned
        // unit blob made `actorInUnit` reject everyone but a cross-unit role, so the
        // attachment 403'd for the recipients the announcement was addressed to.
        return null;
      },
      async () => {
        const announcement = await prisma.announcement.findFirst({
          where: { ...refWhere('attachmentUrl', ref) },
          select: { unitId: true },
        });
        if (announcement) return unitOrAuthenticatedOwner(announcement.unitId);

        // A revocation request's supporting document shares the letter's scope.
        return null;
      },
      async () => {
        const revocationRequest = await prisma.letterRevocationRequest.findFirst({
          where: { ...refWhere('attachmentUrl', ref) },
          select: { letterId: true },
        });
        if (revocationRequest) return { kind: 'letter', letterId: revocationRequest.letterId };

        // A student's own photo is personal data: reachable by the student
        // themselves, a personnel administrator in their unit, or foundation only.
        return null;
      },
      async () => {
        const student = await prisma.student.findFirst({
          where: { ...refWhere('photoUrl', ref) },
          select: { userId: true, unitId: true },
        });
        if (student) {
          return { kind: 'user-document', userId: student.userId, unitId: student.unitId };
        }
        return null;
      },
      async () => {
        const boardMember = await prisma.boardMember.findFirst({
          where: { ...refWhere('photoUrl', ref) },
          select: { id: true },
        });
        if (boardMember) return { kind: 'foundation' };
        return null;
      },
      async () => {
        const foundationDocument = await prisma.foundationDocument.findFirst({
          where: { ...refWhere('fileUrl', ref) },
          select: { id: true },
        });
        if (foundationDocument) return { kind: 'foundation' };

        // ---- Fields found by auditing every stored blob-URL field in the schema ----
        // (flag 9). Each of these the upload middleware can persist — they share the
        // default private container — but without a probe the SAS endpoint treated
        // the blob as unowned and refused every signed-in consumer.

        // An employment contract scan is personal: same rule as an employee document.
        return null;
      },
      async () => {
        const employmentContract = await prisma.employmentContract.findFirst({
          where: { ...refWhere('documentUrl', ref) },
          select: { userId: true, user: { select: ASSIGNMENT_UNIT_SELECT } },
        });
        if (employmentContract) {
          return {
            kind: 'user-document',
            userId: employmentContract.userId,
            unitId: assignmentUnit(employmentContract.user),
          };
        }

        // Alumni photo: an alumnus belongs to a unit, so a unit-owned record.
        return null;
      },
    ],
    [
      async () => {
        const alumni = await prisma.alumni.findFirst({
          where: { ...refWhere('photo', ref) },
          select: { unitId: true },
        });
        if (alumni) return { kind: 'unit', unitId: alumni.unitId };

        // Course / extracurricular / canteen-item images are catalogue media owned by
        // a unit; extension and video likewise.
        return null;
      },
      async () => {
        const course = await prisma.course.findFirst({
          where: { ...refWhere('imageUrl', ref) },
          select: { unitId: true },
        });
        if (course) return { kind: 'unit', unitId: course.unitId };
        return null;
      },
      async () => {
        const extracurricular = await prisma.extracurricular.findFirst({
          where: { ...refWhere('imageUrl', ref) },
          select: { unitId: true },
        });
        if (extracurricular) return { kind: 'unit', unitId: extracurricular.unitId };
        return null;
      },
      async () => {
        const canteenItem = await prisma.canteenItem.findFirst({
          where: { ...refWhere('imageUrl', ref) },
          select: { unitId: true },
        });
        if (canteenItem) return { kind: 'unit', unitId: canteenItem.unitId };
        return null;
      },
      async () => {
        const muhadhoroh = await prisma.muhadhoroh.findFirst({
          where: { ...refWhere('videoUrl', ref) },
          select: { unitId: true },
        });
        if (muhadhoroh) return { kind: 'unit', unitId: muhadhoroh.unitId };
        return null;
      },
      async () => {
        // A maintenance invoice belongs to the asset it was filed against.
        const assetMaintenance = await prisma.assetMaintenance.findFirst({
          where: { ...refWhere('invoiceUrl', ref) },
          select: { asset: { select: { unitId: true } } },
        });
        if (assetMaintenance) return { kind: 'unit', unitId: assetMaintenance.asset.unitId };

        // A dispatch receipt shares the scope of the letter it proves delivery of.
        return null;
      },
    ],
    [
      async () => {
        const letterDispatch = await prisma.letterDispatch.findFirst({
          where: { ...refWhere('receiptUrl', ref) },
          select: { letterId: true },
        });
        if (letterDispatch) return { kind: 'letter', letterId: letterDispatch.letterId };

        // A calendar's meeting link: `unitId = null` means every unit may see it.
        return null;
      },
      async () => {
        const calendarEvent = await prisma.calendarEvent.findFirst({
          where: { ...refWhere('onlineUrl', ref) },
          select: { unitId: true },
        });
        if (calendarEvent) return unitOrAuthenticatedOwner(calendarEvent.unitId);

        // Campaign image: a foundation-wide campaign (null unit) is readable by all.
        return null;
      },
      async () => {
        const donationCampaign = await prisma.donationCampaign.findFirst({
          where: { ...refWhere('imageUrl', ref) },
          select: { unitId: true },
        });
        if (donationCampaign) return unitOrAuthenticatedOwner(donationCampaign.unitId);

        // Branding / catalog media with no unit owner: any signed-in user displays it.
        return null;
      },
      async () => {
        const kitab = await prisma.kitabKuning.findFirst({
          where: { ...refWhere('coverUrl', ref) },
          select: { id: true },
        });
        if (kitab) return { kind: 'authenticated' };
        return null;
      },
      async () => {
        const unit = await prisma.unit.findFirst({
          where: { ...refWhere('logoUrl', ref) },
          select: { id: true },
        });
        if (unit) return { kind: 'authenticated' };
        return null;
      },
      async () => {
        const foundation = await prisma.foundation.findFirst({
          where: { ...refWhere('logoUrl', ref) },
          select: { id: true },
        });
        if (foundation) return { kind: 'authenticated' };

        // A digital certificate's stored artefacts (PDF, signature image, thumbnail)
        // belong to the certificate's student. Nothing writes these fields today —
        // certificates render from data rather than a stored PDF — but they are
        // `String?` URL columns, so a future writer must not be a silent 403.
        return null;
      },
      async () => {
        const digitalCertificate = await prisma.digitalCertificate.findFirst({
          where: {
            OR: [
              refWhere('pdfUrl', ref),
              refWhere('signatureUrl', ref),
              refWhere('thumbnailUrl', ref),
            ],
          },
          select: { student: { select: { userId: true, unitId: true } } },
        });
        if (digitalCertificate) {
          return {
            kind: 'user-document',
            userId: digitalCertificate.student.userId,
            unitId: digitalCertificate.student.unitId,
          };
        }

        // `verificationUrl` is built from `config.publicSiteUrl` — a public link, not
        // a private upload — so it is readable by any signed-in user.
        return null;
      },
    ],
    [
      async () => {
        const certificateVerification = await prisma.digitalCertificate.findFirst({
          where: { ...refWhere('verificationUrl', ref) },
          select: { id: true },
        });
        if (certificateVerification) return { kind: 'authenticated' };

        // A homeroom note's attachments are a `String[]` of URLs about one student.
        // Same personal-document rule as that student's own documents. Nothing
        // persists these today, but the field is a URL list the upload middleware
        // could populate, so a future writer must not become a silent 403.
        return null;
      },
      async () => {
        const studentNote = await prisma.studentNote.findFirst({
          where: { ...refHas('attachments', ref) },
          select: { student: { select: { userId: true, unitId: true } } },
        });
        if (studentNote) {
          return {
            kind: 'user-document',
            userId: studentNote.student.userId,
            unitId: studentNote.student.unitId,
          };
        }
        return null;
      },
    ],
  ];

  for (const batch of batches) {
    const results = await Promise.all(batch.map((probe) => probe()));
    const match = results.find((owner): owner is BlobOwner => owner !== null);
    if (match) return match;
  }

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
  {
    label: 'employmentContract',
    where: (u) => ({ documentUrl: u }),
    count: (a) => prisma.employmentContract.count(a),
  },
  { label: 'alumni', where: (u) => ({ photo: u }), count: (a) => prisma.alumni.count(a) },
  {
    label: 'course',
    where: (u) => ({ imageUrl: u }),
    count: (a) => prisma.course.count(a),
  },
  {
    label: 'extracurricular',
    where: (u) => ({ imageUrl: u }),
    count: (a) => prisma.extracurricular.count(a),
  },
  {
    label: 'canteenItem',
    where: (u) => ({ imageUrl: u }),
    count: (a) => prisma.canteenItem.count(a),
  },
  {
    label: 'muhadhoroh',
    where: (u) => ({ videoUrl: u }),
    count: (a) => prisma.muhadhoroh.count(a),
  },
  {
    label: 'assetMaintenance',
    where: (u) => ({ invoiceUrl: u }),
    count: (a) => prisma.assetMaintenance.count(a),
  },
  {
    label: 'letterDispatch',
    where: (u) => ({ receiptUrl: u }),
    count: (a) => prisma.letterDispatch.count(a),
  },
  {
    label: 'calendarEvent',
    where: (u) => ({ onlineUrl: u }),
    count: (a) => prisma.calendarEvent.count(a),
  },
  {
    label: 'donationCampaign',
    where: (u) => ({ imageUrl: u }),
    count: (a) => prisma.donationCampaign.count(a),
  },
  {
    label: 'kitabKuning',
    where: (u) => ({ coverUrl: u }),
    count: (a) => prisma.kitabKuning.count(a),
  },
  { label: 'unit', where: (u) => ({ logoUrl: u }), count: (a) => prisma.unit.count(a) },
  {
    label: 'foundation',
    where: (u) => ({ logoUrl: u }),
    count: (a) => prisma.foundation.count(a),
  },
  {
    label: 'digitalCertificate',
    where: (u) => ({ OR: [{ pdfUrl: u }, { signatureUrl: u }, { thumbnailUrl: u }] }),
    count: (a) => prisma.digitalCertificate.count(a),
  },
  {
    label: 'digitalCertificateVerification',
    where: (u) => ({ verificationUrl: u }),
    count: (a) => prisma.digitalCertificate.count(a),
  },
  {
    label: 'studentNote',
    where: (u) => ({ attachments: { has: u } }),
    count: (a) => prisma.studentNote.count(a),
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

/**
 * Every stored spelling of the blob named by `url` that a record could hold.
 *
 * The local storage provider persists a host-relative path (`/uploads/<file>`)
 * while a caller may address it absolutely (`https://host/uploads/<file>`), and
 * a URL persisted before a host change may name a different origin for the same
 * file. All three identify one blob on disk, so an authorization or reference
 * check that compares only the string it was handed will call a live file
 * unowned (403) or an orphan (destroy a live document) depending on which
 * spelling happened to be stored.
 *
 * Azure URLs are canonical — the account + container + blob path IS the
 * identity, and there is only one spelling of it — so they return unchanged.
 * The widening is limited to the local provider, where the path is the identity
 * and the origin is incidental.
 */
export function blobReferenceCandidates(url: string): string[] {
  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    return [url];
  }
  if (!pathname.startsWith('/uploads/')) return [url];
  // The blob path is the identity; every origin (relative, absolute, or a URL
  // that carried a SAS/query) refers to the same file.
  return Array.from(new Set([url, pathname]));
}
