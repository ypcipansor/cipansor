import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resolveSasForBlob, discardOrphanBlob, actorMayReadBlob } from '../upload.service';
import {
  generateSasUrl,
  parseBlobUrl,
  isAllowedContainer,
  isPublicContainer,
  deleteFromCloudStorage,
  getBlobUploaderId,
} from '@/utils/cloud-storage';
import {
  claimBlobForDiscard,
  releaseBlobClaimById,
  blobClaimStillHeld,
} from '@/utils/blob-claim';

/**
 * Every record type `findBlobOwner` probes for in the shared
 * `cipansor-documents` container. Kept as one object so a new probe in the
 * service surfaces here as an "undefined is not a function" rather than a
 * silently-passing test.
 */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    letter: { findFirst: vi.fn(), count: vi.fn() },
    letterAttachment: { findFirst: vi.fn(), count: vi.fn() },
    employeeDocument: { findFirst: vi.fn(), count: vi.fn() },
    studentDocument: { findFirst: vi.fn(), count: vi.fn() },
    portfolioFile: { findFirst: vi.fn(), count: vi.fn() },
    dailyReportPhoto: { findFirst: vi.fn(), count: vi.fn() },
    pAUDReportPhoto: { findFirst: vi.fn(), count: vi.fn() },
    pAUDAssessmentEvidence: { findFirst: vi.fn(), count: vi.fn() },
    registrantDocument: { findFirst: vi.fn(), count: vi.fn() },
    courseCertificate: { findFirst: vi.fn(), count: vi.fn() },
    qualityEvidence: { findFirst: vi.fn(), count: vi.fn() },
    studentPackage: { findFirst: vi.fn(), count: vi.fn() },
    extracurricularAchievement: { findFirst: vi.fn(), count: vi.fn() },
    book: { findFirst: vi.fn(), count: vi.fn() },
    asset: { findFirst: vi.fn(), count: vi.fn() },
    student: { findFirst: vi.fn(), count: vi.fn() },
    boardMember: { findFirst: vi.fn(), count: vi.fn() },
    foundationDocument: { findFirst: vi.fn(), count: vi.fn() },
    payment: { findFirst: vi.fn(), count: vi.fn() },
    donation: { findFirst: vi.fn(), count: vi.fn() },
    tahfidzRecord: { findFirst: vi.fn(), count: vi.fn() },
    muhadatsah: { findFirst: vi.fn(), count: vi.fn() },
    announcement: { findFirst: vi.fn(), count: vi.fn() },
    letterRevocationRequest: { findFirst: vi.fn(), count: vi.fn() },
    employmentContract: { findFirst: vi.fn(), count: vi.fn() },
    alumni: { findFirst: vi.fn(), count: vi.fn() },
    course: { findFirst: vi.fn(), count: vi.fn() },
    extracurricular: { findFirst: vi.fn(), count: vi.fn() },
    canteenItem: { findFirst: vi.fn(), count: vi.fn() },
    muhadhoroh: { findFirst: vi.fn(), count: vi.fn() },
    researchProject: { findFirst: vi.fn(), count: vi.fn() },
    assetMaintenance: { findFirst: vi.fn(), count: vi.fn() },
    letterDispatch: { findFirst: vi.fn(), count: vi.fn() },
    calendarEvent: { findFirst: vi.fn(), count: vi.fn() },
    donationCampaign: { findFirst: vi.fn(), count: vi.fn() },
    kitabKuning: { findFirst: vi.fn(), count: vi.fn() },
    unit: { findFirst: vi.fn(), count: vi.fn() },
    foundation: { findFirst: vi.fn(), count: vi.fn() },
    digitalCertificate: { findFirst: vi.fn(), count: vi.fn() },
    studentNote: { findFirst: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('@/utils/cloud-storage', () => ({
  generateSasUrl: vi
    .fn()
    .mockResolvedValue(
      'https://cipansorstore.blob.core.windows.net/cipansor-documents/ktp.pdf?sig=fakeSas'
    ),
  parseBlobUrl: vi.fn(),
  isAllowedContainer: vi.fn(),
  isPublicContainer: vi.fn(),
  deleteFromCloudStorage: vi.fn().mockResolvedValue(undefined),
  // The uploader-metadata read is stubbed; its own behaviour is covered in
  // cloud-storage.test.ts. Here the service's use of it (authorize vs refuse)
  // is what gets exercised.
  getBlobUploaderId: vi.fn().mockResolvedValue(null),
  SAS_TTL_MINUTES: 60,
}));

vi.mock('@/utils/blob-claim', () => ({
  claimBlobForRecord: vi.fn().mockResolvedValue(true),
  claimBlobForDiscard: vi.fn().mockResolvedValue('claim-1'),
  releaseBlobClaim: vi.fn().mockResolvedValue(undefined),
  releaseBlobClaimById: vi.fn().mockResolvedValue(undefined),
  claimBlobsForRecord: vi.fn().mockResolvedValue(true),
  releaseBlobClaims: vi.fn().mockResolvedValue(undefined),
  blobClaimStillHeld: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/utils/letter-access', () => ({
  letterScopeWhere: vi.fn(() => ({})),
}));

vi.mock('@/utils/resolve-unit-id', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/resolve-unit-id')>('@/utils/resolve-unit-id');
  return {
    ...actual,
    seesAllUnits: vi.fn(),
  };
});

import { seesAllUnits } from '@/utils/resolve-unit-id';

const superAdmin = { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: 'unit-1', permissions: [] };
/** Same unit as the target document's owner, but NOT a personnel-record admin. */
const sameUnitPeer = { id: 'user-2', roleCode: 'SDIT_GURU', unitId: 'unit-2', permissions: [] };
/** Unit admin who may administer employee documents. */
const unitHrAdmin = { id: 'user-3', roleCode: 'SDIT_ADMIN', unitId: 'unit-2', permissions: [] };
/** Unit treasurer: verifies payments in unit-2 but is NOT a personnel admin. */
const unitTreasurer = { id: 'user-4', roleCode: 'SDIT_BENDAHARA', unitId: 'unit-2', permissions: [] };
/** A pupil/parent actor: authenticated, but no document or finance role. */
const waliSantri = { id: 'user-5', roleCode: 'SDIT_ORANG_TUA', unitId: 'unit-2', permissions: [] };

/** Reset every `findFirst` probe to "no record". */
function clearOwners() {
  const models = [
    'letter',
    'letterAttachment',
    'employeeDocument',
    'studentDocument',
    'portfolioFile',
    'dailyReportPhoto',
    'pAUDReportPhoto',
    'pAUDAssessmentEvidence',
    'registrantDocument',
    'courseCertificate',
    'qualityEvidence',
    'studentPackage',
    'extracurricularAchievement',
    'book',
    'asset',
    'student',
    'boardMember',
    'foundationDocument',
    'payment',
    'donation',
    'tahfidzRecord',
    'muhadatsah',
    'announcement',
    'letterRevocationRequest',
    'employmentContract',
    'alumni',
    'course',
    'extracurricular',
    'canteenItem',
    'muhadhoroh',
    'researchProject',
    'assetMaintenance',
    'letterDispatch',
    'calendarEvent',
    'donationCampaign',
    'kitabKuning',
    'unit',
    'foundation',
    'digitalCertificate',
    'studentNote',
  ] as const;
  for (const model of models) {
    (prisma as any)[model].findFirst.mockResolvedValue(null);
    (prisma as any)[model].count.mockResolvedValue(0);
  }
}

describe('resolveSasForBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOwners();
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'e-office-documents',
      blobName: 'naskah.pdf',
    });
    (isAllowedContainer as any).mockImplementation((c: string) =>
      ['cipansor-documents', 'e-office-documents', 'student-documents', 'media-public'].includes(c)
    );
    (isPublicContainer as any).mockImplementation((c: string) => c === 'media-public');
  });

  it('returns a scoped local file token (not a raw passthrough) for a /uploads path (BUG 5)', async () => {
    (parseBlobUrl as any).mockReturnValue(null);
    (seesAllUnits as any).mockReturnValue(true);
    // A record references the local file; without one it is refused outright.
    (prisma.letter.findFirst as any).mockResolvedValue({ id: 'letter-1' });

    const result = await resolveSasForBlob('https://cipansor.or.id/uploads/a.pdf', superAdmin);
    // The local provider has no SAS, so it returns a short-lived, path-bound
    // file token instead of handing back the raw path unauthenticated.
    expect(result.url).toBe('https://cipansor.or.id/uploads/a.pdf');
    expect(result.accessToken).toBeTruthy();
    expect(result.expiresIn).toBeGreaterThan(0);
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  it('refuses a /uploads file no record owns, even for a super admin (BUG 5)', async () => {
    (parseBlobUrl as any).mockReturnValue(null);

    await expect(
      resolveSasForBlob('https://cipansor.or.id/uploads/unowned.pdf', superAdmin)
    ).rejects.toThrow(/Berkas tidak ditemukan atau tidak dapat diakses/);
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  it('refuses an arbitrary external URL instead of vouching for it (BUG 11)', async () => {
    (parseBlobUrl as any).mockReturnValue(null);

    await expect(
      resolveSasForBlob('https://evil.example.com/steal.pdf', superAdmin)
    ).rejects.toThrow(/Referensi berkas tidak dikenali/);
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  it('returns url unchanged for a public container blob', async () => {
    (parseBlobUrl as any).mockReturnValue({ containerName: 'media-public', blobName: 'pic.jpg' });

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/media-public/pic.jpg',
      superAdmin
    );
    expect(result).toEqual({ url: 'https://store.blob.core.windows.net/media-public/pic.jpg' });
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  it('rejects a private blob in a foreign (non-allowlisted) container', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'human-resources',
      blobName: 'kirain-pergi.pdf',
    });
    (isAllowedContainer as any).mockReturnValue(false);

    await expect(
      resolveSasForBlob(
        'https://store.blob.core.windows.net/human-resources/kirain-pergi.pdf',
        superAdmin
      )
    ).rejects.toThrow(/Akses ke kontainer penyimpanan tersebut ditolak/);
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  it('rejects a private blob with no backing record in this application', async () => {
    await expect(
      resolveSasForBlob(
        'https://store.blob.core.windows.net/e-office-documents/orphan.pdf',
        superAdmin
      )
    ).rejects.toThrow(/Berkas tidak ditemukan atau tidak dapat diakses/);
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  it('rejects a private letter blob owned by a record the actor may not read', async () => {
    (seesAllUnits as any).mockReturnValue(false);
    (prisma.letter.findFirst as any).mockResolvedValue({
      id: 'letter-9',
      unitId: 'unit-9',
      createdById: 'someone-else',
    });
    // count() returning 0 means the letter falls outside the actor's scope.
    (prisma.letter.count as any).mockResolvedValue(0);

    await expect(
      resolveSasForBlob(
        'https://store.blob.core.windows.net/e-office-documents/others-letter.pdf',
        sameUnitPeer
      )
    ).rejects.toThrow(/Anda tidak berwenang mengakses berkas tersebut/);
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  it('mints a SAS for a letter blob the actor may read (unit scope passes)', async () => {
    (seesAllUnits as any).mockReturnValue(false);
    (prisma.letter.findFirst as any).mockResolvedValue({
      id: 'letter-1',
      unitId: 'unit-2',
      createdById: 'someone',
    });
    (prisma.letter.count as any).mockResolvedValue(1);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/e-office-documents/naskah.pdf',
      sameUnitPeer
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
    expect(generateSasUrl).toHaveBeenCalledWith('e-office-documents', 'naskah.pdf', 60);
  });

  it("mints a SAS for an employee document for a personnel admin in the owner's unit (BUG 2/3)", async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'ktp.pdf',
    });
    (prisma.employeeDocument.findFirst as any).mockResolvedValue({
      userId: 'target',
      user: { unitId: 'unit-2', userRoles: [{ unitId: 'unit-2' }] },
    });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/ktp.pdf',
      unitHrAdmin
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it("REFUSES a same-unit non-HR role reading another person's document (BUG 3)", async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'ktp.pdf',
    });
    (prisma.employeeDocument.findFirst as any).mockResolvedValue({
      userId: 'someone-else',
      user: { unitId: 'unit-2', userRoles: [{ unitId: 'unit-2' }] },
    });
    (seesAllUnits as any).mockReturnValue(false);

    await expect(
      resolveSasForBlob(
        'https://store.blob.core.windows.net/cipansor-documents/ktp.pdf',
        sameUnitPeer
      )
    ).rejects.toThrow(/Anda tidak berwenang mengakses berkas tersebut/);
  });

  it('allows the owner to read their own document regardless of role', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'ktp.pdf',
    });
    (prisma.employeeDocument.findFirst as any).mockResolvedValue({
      userId: 'user-2',
      user: { unitId: 'unit-2', userRoles: [{ unitId: 'unit-2' }] },
    });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/ktp.pdf',
      sameUnitPeer
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it("rejects an employee document outside the actor's unit", async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'ktp.pdf',
    });
    (prisma.employeeDocument.findFirst as any).mockResolvedValue({
      userId: 'target',
      user: { unitId: 'unit-99', userRoles: [{ unitId: 'unit-99' }] },
    });
    (seesAllUnits as any).mockReturnValue(false);

    await expect(
      resolveSasForBlob(
        'https://store.blob.core.windows.net/cipansor-documents/ktp.pdf',
        unitHrAdmin
      )
    ).rejects.toThrow(/Anda tidak berwenang mengakses berkas tersebut/);
  });

  it('resolves a NON-employee blob in the shared cipansor-documents container (BUG 2)', async () => {
    // A book cover lives in the shared container; it must not be mistaken for
    // an employee document and 403'd.
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'cover.jpg',
    });
    (prisma.book.findFirst as any).mockResolvedValue({ unitId: 'unit-2' });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/cover.jpg',
      sameUnitPeer
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it('allows a super admin to read any private letter blob', async () => {
    (seesAllUnits as any).mockReturnValue(true);
    (prisma.letter.findFirst as any).mockResolvedValue({
      id: 'letter-x',
      unitId: 'unit-x',
      createdById: 'someone',
    });

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/e-office-documents/naskah.pdf',
      superAdmin
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
    expect(generateSasUrl).toHaveBeenCalledWith('e-office-documents', 'naskah.pdf', 60);
  });

  it('resolves a letter attachment uploaded into the shared cipansor-documents container (BUG 4)', async () => {
    // The upload middleware routes to `cipansor-documents` (its default), so a
    // letter file can live there. Probing only `e-office-documents` left the
    // letter with no owner and its SAS request 403'd.
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'lampiran.pdf',
    });
    (prisma.letterAttachment.findFirst as any).mockResolvedValue({ letterId: 'letter-1' });
    (seesAllUnits as any).mockReturnValue(false);
    (prisma.letter.count as any).mockResolvedValue(1);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/lampiran.pdf',
      unitHrAdmin
    );

    expect(result.downloadUrl).toContain('sig=fakeSas');
    expect(generateSasUrl).toHaveBeenCalledWith('cipansor-documents', 'lampiran.pdf', 60);
  });

  it('resolves a letter naskah stored in the shared cipansor-documents container (BUG 4)', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'naskah.pdf',
    });
    (prisma.letter.findFirst as any).mockResolvedValue({ id: 'letter-1' });
    (seesAllUnits as any).mockReturnValue(false);
    (prisma.letter.count as any).mockResolvedValue(1);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/naskah.pdf',
      unitHrAdmin
    );

    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it('still refuses a shared-container letter blob for an actor outside its scope (BUG 4)', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'lampiran.pdf',
    });
    (prisma.letterAttachment.findFirst as any).mockResolvedValue({ letterId: 'letter-1' });
    (seesAllUnits as any).mockReturnValue(false);
    (prisma.letter.count as any).mockResolvedValue(0);

    await expect(
      resolveSasForBlob(
        'https://store.blob.core.windows.net/cipansor-documents/lampiran.pdf',
        sameUnitPeer
      )
    ).rejects.toThrow(/tidak berwenang/);
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // BUG 6 — records whose blob URL had no probe 403'd forever.
  // -----------------------------------------------------------------

  it("mints a SAS for a payment proof for the student's own unit admin (BUG 6)", async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'bukti.pdf',
    });
    (prisma.payment.findFirst as any).mockResolvedValue({
      invoice: { student: { userId: 'student-user', unitId: 'unit-2' } },
    });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/bukti.pdf',
      unitHrAdmin
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
    expect(generateSasUrl).toHaveBeenCalledWith('cipansor-documents', 'bukti.pdf', 60);
  });

  it("refuses a payment proof to an actor outside the paying student's unit (BUG 6)", async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'bukti.pdf',
    });
    (prisma.payment.findFirst as any).mockResolvedValue({
      invoice: { student: { userId: 'student-user', unitId: 'unit-99' } },
    });
    (seesAllUnits as any).mockReturnValue(false);

    await expect(
      resolveSasForBlob(
        'https://store.blob.core.windows.net/cipansor-documents/bukti.pdf',
        unitHrAdmin
      )
    ).rejects.toThrow(/tidak berwenang/);
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  it('mints a SAS for an E-Simaan tahfidz recording for its owner (BUG 6)', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'setoran.m4a',
    });
    (prisma.tahfidzRecord.findFirst as any).mockResolvedValue({
      student: { userId: 'user-2', unitId: 'unit-2' },
    });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/setoran.m4a',
      sameUnitPeer
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it('resolves a donation transfer proof through its unit scope (BUG 6)', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'infaq.jpg',
    });
    (prisma.donation.findFirst as any).mockResolvedValue({ unitId: 'unit-2' });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/infaq.jpg',
      unitHrAdmin
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it('lets a unit treasurer open a payment proof in their own unit (FLAG 4)', async () => {
    // The verifier's whole job is judging the proof. Before the dedicated
    // payment-proof rule, the proof was classified as an employee document and
    // the treasurer — who does NOT administer personnel records — got a 403 on
    // the very file the verification queue sends them to read.
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'bukti.jpg',
    });
    (prisma.payment.findFirst as any).mockResolvedValue({
      invoice: { student: { userId: 'student-user', unitId: 'unit-2' } },
    });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/bukti.jpg',
      unitTreasurer
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it('refuses a payment proof to an unrelated role in the same unit (FLAG 4)', async () => {
    // The treasurer rule must NOT widen to every colleague: a plain teacher in
    // the unit still cannot read a family's transfer proof.
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'bukti.jpg',
    });
    (prisma.payment.findFirst as any).mockResolvedValue({
      invoice: { student: { userId: 'student-user', unitId: 'unit-2' } },
    });
    (seesAllUnits as any).mockReturnValue(false);

    await expect(
      resolveSasForBlob(
        'https://store.blob.core.windows.net/cipansor-documents/bukti.jpg',
        sameUnitPeer
      )
    ).rejects.toThrow(/Anda tidak berwenang mengakses berkas tersebut/);
  });

  it('refuses a payment proof to a verifier from another unit (FLAG 4)', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'bukti.jpg',
    });
    (prisma.payment.findFirst as any).mockResolvedValue({
      invoice: { student: { userId: 'student-user', unitId: 'unit-9' } },
    });
    (seesAllUnits as any).mockReturnValue(false);

    await expect(
      resolveSasForBlob(
        'https://store.blob.core.windows.net/cipansor-documents/bukti.jpg',
        unitTreasurer
      )
    ).rejects.toThrow(/Anda tidak berwenang mengakses berkas tersebut/);
  });

  it('lets the student a payment is for read their own proof (FLAG 4)', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'bukti.jpg',
    });
    (prisma.payment.findFirst as any).mockResolvedValue({
      invoice: { student: { userId: sameUnitPeer.id, unitId: 'unit-9' } },
    });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/bukti.jpg',
      sameUnitPeer
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it('resolves an announcement attachment through its unit scope (BUG 6)', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'pengumuman.pdf',
    });
    (prisma.announcement.findFirst as any).mockResolvedValue({ unitId: 'unit-2' });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/pengumuman.pdf',
      unitHrAdmin
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it('lets an ordinary recipient read a global announcement attachment (unitId = null)', async () => {
    // A global announcement is addressed to everyone; its attachment must not
    // be treated as an unowned unit blob, which `actorInUnit` rejects for every
    // actor but a cross-unit role.
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'pengumuman-global.pdf',
    });
    (prisma.announcement.findFirst as any).mockResolvedValue({ unitId: null });
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/pengumuman-global.pdf',
      sameUnitPeer
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it('resolves a revocation-request attachment through its letter scope (BUG 6)', async () => {
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'bukti-cabut.pdf',
    });
    (prisma.letterRevocationRequest.findFirst as any).mockResolvedValue({ letterId: 'letter-1' });
    (prisma.letter.count as any).mockResolvedValue(1);
    (seesAllUnits as any).mockReturnValue(false);

    const result = await resolveSasForBlob(
      'https://store.blob.core.windows.net/cipansor-documents/bukti-cabut.pdf',
      unitHrAdmin
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
  });

  it('has a findBlobOwner probe for every stored blob-URL field it must serve (BUG 6)', async () => {
    // Guard: each probe below, given a matching row, must resolve or refuse
    // deliberately rather than falling through to "no record".
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'probe.bin',
    });
    (seesAllUnits as any).mockReturnValue(true);

    const probes: Array<[string, unknown]> = [
      ['payment', { invoice: { student: { userId: 'u', unitId: 'unit-2' } } }],
      ['donation', { unitId: 'unit-2' }],
      ['tahfidzRecord', { student: { userId: 'u', unitId: 'unit-2' } }],
      ['muhadatsah', { unitId: 'unit-2' }],
      ['announcement', { unitId: 'unit-2' }],
      ['letterRevocationRequest', { letterId: 'letter-1' }],
    ];

    for (const [model, row] of probes) {
      clearOwners();
      (prisma as any)[model].findFirst.mockResolvedValue(row);
      const result = await resolveSasForBlob(
        'https://store.blob.core.windows.net/cipansor-documents/probe.bin',
        superAdmin
      );
      expect(result.downloadUrl, model).toContain('sig=fakeSas');
    }
  });
});

describe('actorMayReadBlob (BUG 5 ownership matrix)', () => {
  // The local `/uploads` middleware applies this exact function. The middleware
  // suite mocks it to prove the middleware *calls* it; these tests prove the
  // function itself returns the right answer for each kind of owner and actor,
  // which is what makes the mocked call meaningful. A file served from disk and
  // the same file served from a private blob container must agree here.
  beforeEach(() => {
    vi.clearAllMocks();
    // `seesAllUnits` is module-mocked and `clearAllMocks` does not reset a
    // leaked implementation, so state the real rule explicitly: only foundation
    // roles (SUPER_ADMIN + YAYASAN_*) see across units.
    (seesAllUnits as any).mockImplementation(
      (u: { roleCode?: string | null }) =>
        u?.roleCode === 'SUPER_ADMIN' || !!u?.roleCode?.startsWith('YAYASAN_')
    );
  });

  it('user-document: the owner may read, a same-unit peer may not', async () => {
    // The owner is the HR admin (user-3); sameUnitPeer sits in the same unit but
    // is neither the owner nor a personnel admin, so it must be refused.
    const owner = { kind: 'user-document' as const, userId: unitHrAdmin.id, unitId: 'unit-2' };
    await expect(actorMayReadBlob(unitHrAdmin, owner)).resolves.toBe(true);
    await expect(actorMayReadBlob(sameUnitPeer, owner)).resolves.toBe(false);
    await expect(actorMayReadBlob(waliSantri, owner)).resolves.toBe(false);
    await expect(actorMayReadBlob(superAdmin, owner)).resolves.toBe(true);
  });

  it('user-document: a personnel admin from ANOTHER unit may not read it', async () => {
    // The HR role grants reach only inside its own unit; a cross-unit admin is
    // refused, which is the whole point of pinning the write/read boundary.
    const owner = { kind: 'user-document' as const, userId: 'someone-else', unitId: 'unit-2' };
    const crossUnitHrAdmin = { ...unitHrAdmin, unitId: 'unit-9' };
    await expect(actorMayReadBlob(crossUnitHrAdmin, owner)).resolves.toBe(false);
  });

  it('unit: a same-unit actor may read, a cross-unit actor may not', async () => {
    const owner = { kind: 'unit' as const, unitId: 'unit-2' };
    await expect(actorMayReadBlob(waliSantri, owner)).resolves.toBe(true);
    await expect(actorMayReadBlob({ ...waliSantri, unitId: 'unit-3' }, owner)).resolves.toBe(false);
    await expect(actorMayReadBlob(superAdmin, owner)).resolves.toBe(true);
  });

  it('payment-proof: a finance verifier may read its unit\u2019s proof, a teacher may not', async () => {
    const owner = { kind: 'payment-proof' as const, studentUserId: 'some-student', unitId: 'unit-2' };
    // The treasurer verifies payments but is not a personnel admin; the proof
    // rule must admit them without opening employee documents.
    await expect(actorMayReadBlob(unitTreasurer, owner)).resolves.toBe(true);
    await expect(actorMayReadBlob(waliSantri, owner)).resolves.toBe(false);
    await expect(actorMayReadBlob(sameUnitPeer, owner)).resolves.toBe(false);
  });

  it('payment-proof: the student it pays for reaches their own proof', async () => {
    const owner = {
      kind: 'payment-proof' as const,
      studentUserId: waliSantri.id,
      unitId: 'unit-2',
    };
    await expect(actorMayReadBlob(waliSantri, owner)).resolves.toBe(true);
  });

  it('payment-proof: a finance verifier from another unit may not read it', async () => {
    const owner = { kind: 'payment-proof' as const, studentUserId: 'some-student', unitId: 'unit-2' };
    await expect(
      actorMayReadBlob({ ...unitTreasurer, unitId: 'unit-9' }, owner)
    ).resolves.toBe(false);
  });

  it('foundation: only a foundation-scoped role may read it', async () => {
    const owner = { kind: 'foundation' as const };
    const yayasan = { id: 'user-6', roleCode: 'YAYASAN_SEKRETARIS', unitId: null, permissions: [] };
    await expect(actorMayReadBlob(yayasan, owner)).resolves.toBe(true);
    await expect(actorMayReadBlob(unitHrAdmin, owner)).resolves.toBe(false);
  });

  it('authenticated: any signed-in actor may read site-wide media', async () => {
    await expect(actorMayReadBlob(waliSantri, { kind: 'authenticated' })).resolves.toBe(true);
  });

  it('public: readable with no ownership check', async () => {
    await expect(actorMayReadBlob(waliSantri, { kind: 'public' })).resolves.toBe(true);
  });

  it('letter: a foundation role bypasses the correspondence scope, others go through it', async () => {
    const owner = { kind: 'letter' as const, letterId: 'letter-1' };
    (seesAllUnits as any).mockReturnValue(false);
    (prisma.letter.count as any).mockResolvedValue(0);
    await expect(actorMayReadBlob(waliSantri, owner)).resolves.toBe(false);
    (prisma.letter.count as any).mockResolvedValue(1);
    await expect(actorMayReadBlob(waliSantri, owner)).resolves.toBe(true);

    (seesAllUnits as any).mockReturnValue(true);
    (prisma.letter.count as any).mockResolvedValue(0);
    await expect(actorMayReadBlob(superAdmin, owner)).resolves.toBe(true);
  });
});

describe('discardOrphanBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOwners();
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'orphan.pdf',
    });
    (isAllowedContainer as any).mockReturnValue(true);
    (claimBlobForDiscard as any).mockResolvedValue('claim-1');
    // Default to "we still hold the claim"; a test that wants the stolen-claim
    // path overrides it for itself only.
    (blobClaimStillHeld as any).mockResolvedValue(true);
  });

  it('claims the blob then deletes it, releasing the claim (BUG 4)', async () => {
    await discardOrphanBlob(
      'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
      superAdmin
    );

    expect(claimBlobForDiscard).toHaveBeenCalledWith(
      'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
      superAdmin.id
    );
    expect(deleteFromCloudStorage).toHaveBeenCalledWith('cipansor-documents', 'orphan.pdf');
    expect(releaseBlobClaimById).toHaveBeenCalledWith('claim-1', superAdmin.id);
  });

  it('refuses when a live claim held by another actor already owns the blob (BUG 4)', async () => {
    // A concurrent create (or another discard) holds the claim. The delete must
    // not proceed; the loser backs off rather than racing.
    (claimBlobForDiscard as any).mockResolvedValue(null);

    await expect(
      discardOrphanBlob(
        'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
        superAdmin
      )
    ).rejects.toThrow(/sedang diproses pihak lain/);
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
  });

  it('re-probes under the claim, so a create that committed before the claim blocks it (race)', async () => {
    // First probe says orphan; by the time the claim is held a record has
    // committed. The claim cannot undo that, so the under-claim re-probe must
    // report referenced and the delete must not happen.
    (prisma as any).book.count
      .mockResolvedValueOnce(0) // first exhaustive probe
      .mockResolvedValue(1); // re-probe under the claim

    await expect(
      discardOrphanBlob(
        'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
        superAdmin
      )
    ).rejects.toThrow(/Berkas sudah tersimpan/);
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
    // The claim is released so a later retry is possible.
    expect(releaseBlobClaimById).toHaveBeenCalledWith('claim-1', superAdmin.id);
  });

  it('releases the claim when the delete itself fails, so a retry is possible', async () => {
    (deleteFromCloudStorage as any).mockRejectedValueOnce(new Error('azure down'));

    await expect(
      discardOrphanBlob(
        'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
        superAdmin
      )
    ).rejects.toThrow('azure down');
    expect(releaseBlobClaimById).toHaveBeenCalledWith('claim-1', superAdmin.id);
  });

  it('refuses to discard a blob a live record references', async () => {
    // The exhaustive reference probe counts, rather than stopping at the first
    // owner, so it is `count` that must report a live reference here.
    (prisma.book.count as any).mockResolvedValue(1);

    await expect(
      discardOrphanBlob(
        'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
        superAdmin
      )
    ).rejects.toThrow(/Berkas sudah tersimpan/);
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
    expect(claimBlobForDiscard).not.toHaveBeenCalled();
  });

  it('refuses to discard when ANY stored blob-URL field still references the URL', async () => {
    // A record type whose own `findBlobOwner` probe does not cover this field
    // must still block the delete: `findBlobOwner` alone would have called this
    // an orphan and destroyed a live file.
    (prisma.payment.count as any).mockResolvedValue(1);

    await expect(
      discardOrphanBlob(
        'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
        superAdmin
      )
    ).rejects.toThrow(/Berkas sudah tersimpan/);
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
  });

  it('refuses to delete when the claim was taken over between the re-probe and the delete (BUG 4 residual)', async () => {
    // The re-probe says orphan, but by the time the delete would run a create
    // has committed and now holds the claim. Deleting here would destroy a blob
    // the new record points at, so the liveness check must abort.
    (blobClaimStillHeld as any).mockResolvedValue(false);

    await expect(
      discardOrphanBlob(
        'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
        superAdmin
      )
    ).rejects.toThrow(/sedang diproses pihak lain/);

    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
    // The (now-lost) claim is released so a later retry can reclaim the blob.
    expect(releaseBlobClaimById).toHaveBeenCalledWith('claim-1', superAdmin.id);
  });

  it('re-asserts the claim immediately before the irreversible delete', async () => {
    // Ordering is the point: the liveness check must sit after the reference
    // re-probe and before the delete, or it proves nothing.
    await discardOrphanBlob(
      'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
      superAdmin
    );

    expect(blobClaimStillHeld).toHaveBeenCalledWith('claim-1', superAdmin.id);
    expect(deleteFromCloudStorage).toHaveBeenCalled();
  });

  it('is a no-op for a local /uploads path', async () => {
    (parseBlobUrl as any).mockReturnValue(null);

    await discardOrphanBlob('https://cipansor.or.id/uploads/a.pdf', superAdmin);
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
  });

  it('refuses a foreign container', async () => {
    (isAllowedContainer as any).mockReturnValue(false);

    await expect(
      discardOrphanBlob('https://store.blob.core.windows.net/foreign/a.pdf', superAdmin)
    ).rejects.toThrow(/Akses ke kontainer penyimpanan tersebut ditolak/);
  });

  it('refuses an actor who is not the uploader (BUG 2)', async () => {
    // The blob was uploaded by someone else; the caller is a plain teacher.
    // An orphan has no record to name an owner, so without this binding anyone
    // who knew the URL could destroy someone else's in-flight upload.
    (getBlobUploaderId as any).mockResolvedValue('some-other-user');
    (seesAllUnits as any).mockReturnValue(false);

    await expect(
      discardOrphanBlob(
        'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
        sameUnitPeer
      )
    ).rejects.toThrow(/tidak berwenang membuang berkas/);
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
  });

  it('allows the uploader to discard their own orphan blob (BUG 2)', async () => {
    (getBlobUploaderId as any).mockResolvedValue(sameUnitPeer.id);
    (seesAllUnits as any).mockReturnValue(false);

    await discardOrphanBlob(
      'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
      sameUnitPeer
    );

    expect(getBlobUploaderId).toHaveBeenCalledWith('cipansor-documents', 'orphan.pdf');
    expect(deleteFromCloudStorage).toHaveBeenCalled();
  });

  it('refuses everyone when the blob has no recorded uploader (fail-closed) (BUG 2)', async () => {
    (getBlobUploaderId as any).mockResolvedValue(null);
    (seesAllUnits as any).mockReturnValue(false);

    await expect(
      discardOrphanBlob(
        'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
        sameUnitPeer
      )
    ).rejects.toThrow(/tidak berwenang membuang berkas/);
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
  });

  it('lets a foundation/super-admin role sweep any orphan, without a metadata read', async () => {
    (seesAllUnits as any).mockReturnValue(true);

    await discardOrphanBlob(
      'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
      superAdmin
    );

    expect(getBlobUploaderId).not.toHaveBeenCalled();
    expect(deleteFromCloudStorage).toHaveBeenCalled();
  });
});
