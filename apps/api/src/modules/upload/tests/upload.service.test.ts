import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resolveSasForBlob, discardOrphanBlob } from '../upload.service';
import {
  generateSasUrl,
  parseBlobUrl,
  isAllowedContainer,
  isPublicContainer,
  deleteFromCloudStorage,
} from '@/utils/cloud-storage';

/**
 * Every record type `findBlobOwner` probes for in the shared
 * `cipansor-documents` container. Kept as one object so a new probe in the
 * service surfaces here as an "undefined is not a function" rather than a
 * silently-passing test.
 */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    letter: { findFirst: vi.fn(), count: vi.fn() },
    letterAttachment: { findFirst: vi.fn() },
    employeeDocument: { findFirst: vi.fn() },
    studentDocument: { findFirst: vi.fn() },
    portfolioFile: { findFirst: vi.fn() },
    dailyReportPhoto: { findFirst: vi.fn() },
    pAUDReportPhoto: { findFirst: vi.fn() },
    pAUDAssessmentEvidence: { findFirst: vi.fn() },
    registrantDocument: { findFirst: vi.fn() },
    courseCertificate: { findFirst: vi.fn() },
    qualityEvidence: { findFirst: vi.fn() },
    studentPackage: { findFirst: vi.fn() },
    extracurricularAchievement: { findFirst: vi.fn() },
    book: { findFirst: vi.fn() },
    asset: { findFirst: vi.fn() },
    student: { findFirst: vi.fn() },
    boardMember: { findFirst: vi.fn() },
    foundationDocument: { findFirst: vi.fn() },
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
}));

vi.mock('@/utils/letter-access', () => ({
  letterScopeWhere: vi.fn(() => ({})),
}));

vi.mock('@/utils/resolve-unit-id', async () => {
  const actual = await vi.importActual<typeof import('@/utils/resolve-unit-id')>(
    '@/utils/resolve-unit-id'
  );
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
  ] as const;
  for (const model of models) {
    (prisma as any)[model].findFirst.mockResolvedValue(null);
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

  it('returns url unchanged (no SAS) for a non-blob /uploads path', async () => {
    (parseBlobUrl as any).mockReturnValue(null);

    const result = await resolveSasForBlob('https://cipansor.or.id/uploads/a.pdf', superAdmin);
    expect(result).toEqual({ url: 'https://cipansor.or.id/uploads/a.pdf' });
    expect(generateSasUrl).not.toHaveBeenCalled();
  });

  it('refuses an arbitrary external URL instead of vouching for it (BUG 11)', async () => {
    (parseBlobUrl as any).mockReturnValue(null);

    await expect(resolveSasForBlob('https://evil.example.com/steal.pdf', superAdmin)).rejects.toThrow(
      /Referensi berkas tidak dikenali/
    );
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
      user: { unitId: 'unit-2' },
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
      user: { unitId: 'unit-2' },
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
      user: { unitId: 'unit-2' },
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
      user: { unitId: 'unit-99' },
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
  });

  it('deletes a blob no record references (BUG 4)', async () => {
    await discardOrphanBlob(
      'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
      superAdmin
    );

    expect(deleteFromCloudStorage).toHaveBeenCalledWith('cipansor-documents', 'orphan.pdf');
  });

  it('refuses to discard a blob a live record references', async () => {
    (prisma.book.findFirst as any).mockResolvedValue({ unitId: 'unit-2' });

    await expect(
      discardOrphanBlob(
        'https://store.blob.core.windows.net/cipansor-documents/orphan.pdf',
        superAdmin
      )
    ).rejects.toThrow(/Berkas sudah tersimpan/);
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
  });

  it('is a no-op for a local /uploads path', async () => {
    (parseBlobUrl as any).mockReturnValue(null);

    await discardOrphanBlob('https://cipansor.or.id/uploads/a.pdf', superAdmin);
    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
  });

  it('refuses a foreign container', async () => {
    (isAllowedContainer as any).mockReturnValue(false);

    await expect(
      discardOrphanBlob('https://store.blob.core.windows.net/foreign/a.pdf', superAdmin)
    ).rejects.toThrow(/Akses ke kontainer penyimpanan tersebut ditolak/);
  });
});
