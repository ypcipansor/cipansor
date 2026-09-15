import { describe, it, expect, vi, beforeEach } from 'vitest';
import { employeeDocumentService } from '../employee-documents.service';
import { prisma } from '@/lib/prisma';
import { deleteFromCloudStorage, parseBlobUrl } from '@/utils/cloud-storage';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employeeDocument: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/utils/cloud-storage', () => ({
  deleteFromCloudStorage: vi.fn().mockResolvedValue(undefined),
  parseBlobUrl: vi.fn(),
}));

describe('employeeDocumentService.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the backing cloud blob before removing a document stored on Azure', async () => {
    (prisma.employeeDocument.findUnique as any).mockResolvedValue({
      id: 'doc-1',
      fileUrl: 'https://store.blob.core.windows.net/cipansor-documents/ktp.pdf',
    });
    (prisma.employeeDocument.delete as any).mockResolvedValue({ id: 'doc-1' });
    (parseBlobUrl as any).mockReturnValue({
      containerName: 'cipansor-documents',
      blobName: 'ktp.pdf',
    });

    await employeeDocumentService.delete('doc-1');

    expect(parseBlobUrl).toHaveBeenCalledWith(
      'https://store.blob.core.windows.net/cipansor-documents/ktp.pdf'
    );
    expect(deleteFromCloudStorage).toHaveBeenCalledWith('cipansor-documents', 'ktp.pdf');
    expect(prisma.employeeDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
  });

  it('deletes the record without cloud cleanup for a non-blob fileUrl', async () => {
    (prisma.employeeDocument.findUnique as any).mockResolvedValue({
      id: 'doc-2',
      fileUrl: '/uploads/local.pdf',
    });
    (prisma.employeeDocument.delete as any).mockResolvedValue({ id: 'doc-2' });
    (parseBlobUrl as any).mockReturnValue(null);

    await employeeDocumentService.delete('doc-2');

    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
    expect(prisma.employeeDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-2' } });
  });

  it('deletes the record when the document is no longer present', async () => {
    (prisma.employeeDocument.findUnique as any).mockResolvedValue(null);
    (prisma.employeeDocument.delete as any).mockResolvedValue({ id: 'doc-3' });

    await employeeDocumentService.delete('doc-3');

    expect(deleteFromCloudStorage).not.toHaveBeenCalled();
    expect(prisma.employeeDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-3' } });
  });
});
