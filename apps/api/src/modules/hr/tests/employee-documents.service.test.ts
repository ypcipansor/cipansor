import { describe, it, expect, vi, beforeEach } from 'vitest';
import { employeeDocumentService } from '../employee-documents.service';
import { prisma } from '@/lib/prisma';
import { cleanupBlobBestEffort } from '@/utils/cloud-storage';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employeeDocument: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/utils/cloud-storage', () => ({
  cleanupBlobBestEffort: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/utils/resolve-unit-id', async () => {
  const actual = await vi.importActual<typeof import('@/utils/resolve-unit-id')>(
    '@/utils/resolve-unit-id'
  );
  return { ...actual, seesAllUnits: vi.fn(() => false) };
});

import { seesAllUnits } from '@/utils/resolve-unit-id';

const BLOB = 'https://store.blob.core.windows.net/cipansor-documents/ktp.pdf';

/** Owner of `doc-1`: user `target`, in unit-2. */
function mockDoc(overrides: Record<string, unknown> = {}) {
  (prisma.employeeDocument.findUnique as any).mockResolvedValue({
    id: 'doc-1',
    fileUrl: BLOB,
    userId: 'target',
    user: {
      unitId: 'unit-2',
      userRoles: [{ unitId: 'unit-2' }],
    },
    ...overrides,
  });
}

describe('employeeDocumentService.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (seesAllUnits as any).mockReturnValue(false);
    (prisma.employeeDocument.delete as any).mockResolvedValue({ id: 'doc-1' });
  });

  it('deletes the DB row FIRST, then cleans the blob best-effort (BUG 1)', async () => {
    mockDoc();
    const order: string[] = [];
    (prisma.employeeDocument.delete as any).mockImplementation(async () => {
      order.push('db-delete');
      return { id: 'doc-1' };
    });
    (cleanupBlobBestEffort as any).mockImplementation(async () => {
      order.push('blob-cleanup');
      return true;
    });

    await employeeDocumentService.delete('doc-1', {
      id: 'user-3',
      roleCode: 'SDIT_ADMIN',
      unitId: 'unit-2',
    });

    expect(order).toEqual(['db-delete', 'blob-cleanup']);
    expect(cleanupBlobBestEffort).toHaveBeenCalledWith(BLOB);
  });

  it('does not lose the file when the DB delete fails (blob not touched)', async () => {
    mockDoc();
    (prisma.employeeDocument.delete as any).mockRejectedValue(new Error('db down'));

    await expect(
      employeeDocumentService.delete('doc-1', {
        id: 'user-3',
        roleCode: 'SDIT_ADMIN',
        unitId: 'unit-2',
      })
    ).rejects.toThrow('db down');

    expect(cleanupBlobBestEffort).not.toHaveBeenCalled();
  });

  it('REFUSES a unit admin deleting a document owned by another unit (BUG 1)', async () => {
    mockDoc({ user: { unitId: 'unit-99', userRoles: [{ unitId: 'unit-99' }] } });

    await expect(
      employeeDocumentService.delete('doc-1', {
        id: 'user-3',
        roleCode: 'SDIT_ADMIN',
        unitId: 'unit-2',
      })
    ).rejects.toThrow(/tidak berwenang mengelola dokumen pegawai/);

    expect(prisma.employeeDocument.delete).not.toHaveBeenCalled();
    expect(cleanupBlobBestEffort).not.toHaveBeenCalled();
  });

  it('REFUSES a same-unit peer without the HR document role', async () => {
    mockDoc();

    await expect(
      employeeDocumentService.delete('doc-1', {
        id: 'user-9',
        roleCode: 'SDIT_GURU',
        unitId: 'unit-2',
      })
    ).rejects.toThrow(/tidak berwenang mengelola dokumen pegawai/);

    expect(prisma.employeeDocument.delete).not.toHaveBeenCalled();
  });

  it('allows a personnel admin in the same unit to delete', async () => {
    mockDoc();

    await employeeDocumentService.delete('doc-1', {
      id: 'user-3',
      roleCode: 'SDIT_ADMIN',
      unitId: 'unit-2',
    });

    expect(prisma.employeeDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
  });

  it('allows the owner to delete their own document', async () => {
    mockDoc();

    await employeeDocumentService.delete('doc-1', {
      id: 'target',
      roleCode: 'SDIT_GURU',
      unitId: 'unit-2',
    });

    expect(prisma.employeeDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
  });

  it('allows a foundation role to delete across units', async () => {
    mockDoc({ user: { unitId: 'unit-99', userRoles: [{ unitId: 'unit-99' }] } });
    (seesAllUnits as any).mockReturnValue(true);

    await employeeDocumentService.delete('doc-1', {
      id: 'user-1',
      roleCode: 'YAYASAN_KETUA',
      unitId: null,
    });

    expect(prisma.employeeDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
  });

  it('preserves not-found behaviour when the record is absent', async () => {
    (prisma.employeeDocument.findUnique as any).mockResolvedValue(null);
    (prisma.employeeDocument.delete as any).mockRejectedValue(new Error('P2025'));

    await expect(
      employeeDocumentService.delete('doc-3', { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: null })
    ).rejects.toThrow('P2025');

    expect(cleanupBlobBestEffort).not.toHaveBeenCalled();
  });
});

describe('employeeDocumentService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (seesAllUnits as any).mockReturnValue(false);
    (prisma.employeeDocument.create as any).mockResolvedValue({ id: 'new' });
  });

  it('REFUSES creating a document for a user in another unit', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      unitId: 'unit-99',
      userRoles: [{ unitId: 'unit-99' }],
    });

    await expect(
      employeeDocumentService.create(
        { userId: 'target', name: 'KTP', type: 'KTP' as any, fileUrl: BLOB },
        { id: 'user-3', roleCode: 'SDIT_ADMIN', unitId: 'unit-2' }
      )
    ).rejects.toThrow(/tidak berwenang mengelola dokumen pegawai/);

    expect(prisma.employeeDocument.create).not.toHaveBeenCalled();
  });

  it('allows a personnel admin to create for a user in their unit', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      unitId: 'unit-2',
      userRoles: [{ unitId: 'unit-2' }],
    });

    await employeeDocumentService.create(
      { userId: 'target', name: 'KTP', type: 'KTP' as any, fileUrl: BLOB },
      { id: 'user-3', roleCode: 'SDIT_ADMIN', unitId: 'unit-2' }
    );

    expect(prisma.employeeDocument.create).toHaveBeenCalled();
  });
});
