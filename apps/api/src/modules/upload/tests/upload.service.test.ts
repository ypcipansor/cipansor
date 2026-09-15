import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resolveSasForBlob } from '../upload.service';
import {
  generateSasUrl,
  parseBlobUrl,
  isAllowedContainer,
  isPublicContainer,
} from '@/utils/cloud-storage';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    letter: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    letterAttachment: {
      findFirst: vi.fn(),
    },
    employeeDocument: {
      findFirst: vi.fn(),
    },
    studentDocument: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/utils/cloud-storage', () => ({
  generateSasUrl: vi
    .fn()
    .mockResolvedValue(
      'https://cipansorstore.blob.core.windows.net/e-office-documents/naskah.pdf?sig=fakeSas'
    ),
  parseBlobUrl: vi.fn(),
  isAllowedContainer: vi.fn(),
  isPublicContainer: vi.fn(),
}));

vi.mock('@/utils/letter-access', () => ({
  letterScopeWhere: vi.fn(() => ({})),
}));

vi.mock('@/utils/resolve-unit-id', () => ({
  seesAllUnits: vi.fn(),
}));

import { seesAllUnits } from '@/utils/resolve-unit-id';

const superAdmin = { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: 'unit-1', permissions: [] };
const unitUser = { id: 'user-2', roleCode: 'SDIT_STAFF', unitId: 'unit-2', permissions: [] };

describe('resolveSasForBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    (prisma.letter.findFirst as any).mockResolvedValue(null);
    (prisma.letterAttachment.findFirst as any).mockResolvedValue(null);

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
        unitUser
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
      unitUser
    );
    expect(result.downloadUrl).toContain('sig=fakeSas');
    expect(generateSasUrl).toHaveBeenCalledWith('e-office-documents', 'naskah.pdf', 60);
  });

  it("mints a SAS for an employee document in the actor's own unit", async () => {
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
      unitUser
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
      resolveSasForBlob('https://store.blob.core.windows.net/cipansor-documents/ktp.pdf', unitUser)
    ).rejects.toThrow(/Anda tidak berwenang mengakses berkas tersebut/);
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
