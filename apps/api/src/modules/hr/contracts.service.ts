import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SharedPaginatedResponse } from '@cipansor/shared';
import { Errors } from '@/middleware/error';
import { claimBlobForRecord, releaseBlobClaimById, type BlobClaimHandle } from '@/utils/blob-claim';

export const contractService = {
  async create(data: {
    userId: string;
    contractNumber: string;
    type: string;
    startDate: Date;
    endDate?: Date;
    documentUrl?: string;
    notes?: string;
    /** The actor creating the reference, used to claim the blob (flag 9). */
    actorId?: string;
  }) {
    // Claim the contract document before the row references it, so a concurrent
    // discard of a just-uploaded file cannot delete it between its reference
    // probe and this insert (BUG 4 / flag 9).
    let claim: BlobClaimHandle | null = null;
    if (data.documentUrl) {
      claim = await claimBlobForRecord(data.documentUrl, data.actorId ?? data.userId);
      if (!claim) {
        throw Errors.conflict(
          'Dokumen kontrak sedang diproses pihak lain; unggah ulang berkas tersebut'
        );
      }
    }
    try {
      return await prisma.employmentContract.create({
        data: {
          user: { connect: { id: data.userId } },
          contractNumber: data.contractNumber,
          type: data.type,
          startDate: data.startDate,
          endDate: data.endDate,
          documentUrl: data.documentUrl,
          notes: data.notes,
        },
      });
    } finally {
      if (data.documentUrl) {
        if (claim) await releaseBlobClaimById(claim).catch(() => undefined);
      }
    }
  },

  async update(
    id: string,
    data: {
      type?: string;
      startDate?: Date;
      endDate?: Date;
      status?: any;
      documentUrl?: string;
      notes?: string;
      /** The actor updating, used to claim a new blob (flag 9). */
      actorId?: string;
    }
  ) {
    const holderId = data.actorId ?? 'hr-contract';
    let claim: BlobClaimHandle | null = null;
    if (data.documentUrl) {
      claim = await claimBlobForRecord(data.documentUrl, holderId);
      if (!claim) {
        throw Errors.conflict(
          'Dokumen kontrak sedang diproses pihak lain; unggah ulang berkas tersebut'
        );
      }
    }
    const { actorId: _actorId, ...updateData } = data;
    try {
      return await prisma.employmentContract.update({
        where: { id },
        data: updateData,
      });
    } finally {
      if (data.documentUrl) {
        if (claim) await releaseBlobClaimById(claim).catch(() => undefined);
      }
    }
  },

  async findAll(
    unitId: string,
    params: { page: number; limit: number; search?: string; status?: string }
  ): Promise<SharedPaginatedResponse<unknown>> {
    const { page, limit, search, status } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.EmploymentContractWhereInput = {
      user: {
        unitId, // Filter contracts by users in the unit
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      status: status ? (status as any) : undefined,
    };

    const [total, data] = await Promise.all([
      prisma.employmentContract.count({ where }),
      prisma.employmentContract.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
      }),
    ]);

    return {
      success: true,
      data,
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  },

  async findByUser(userId: string) {
    return prisma.employmentContract.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
    });
  },

  async findExpiring(unitId: string, days: number = 30) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    return prisma.employmentContract.findMany({
      where: {
        user: { unitId },
        endDate: {
          lte: expiryDate,
          gte: new Date(),
        },
        status: 'ACTIVE',
      },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { endDate: 'asc' },
    });
  },
};
