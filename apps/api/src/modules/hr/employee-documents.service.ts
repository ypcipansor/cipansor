import { prisma } from '../../lib/prisma';
import { EmployeeDocumentType } from '@prisma/client';
import { deleteFromCloudStorage, parseBlobUrl } from '../../utils/cloud-storage';

export const employeeDocumentService = {
  async create(data: {
    userId: string;
    name: string;
    type: EmployeeDocumentType;
    fileUrl: string;
    expiryDate?: Date;
    notes?: string;
  }) {
    return prisma.employeeDocument.create({
      data: {
        userId: data.userId,
        name: data.name,
        type: data.type,
        fileUrl: data.fileUrl,
        expiryDate: data.expiryDate,
        notes: data.notes,
      },
    });
  },

  async findAll(userId: string) {
    return prisma.employeeDocument.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async delete(id: string) {
    // Best-effort cleanup of the backing cloud blob alongside the record, so a
    // deleted personal document does not linger in private storage forever.
    const doc = await prisma.employeeDocument.findUnique({ where: { id } });
    if (doc) {
      const parsed = parseBlobUrl(doc.fileUrl);
      if (parsed) {
        await deleteFromCloudStorage(parsed.containerName, parsed.blobName);
      }
    }
    return prisma.employeeDocument.delete({
      where: { id },
    });
  },
};
