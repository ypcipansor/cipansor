import { prisma } from '@/lib/prisma';
import {
  CreateQualityEvidenceInput,
  QualityDashboardSummary,
  QualityStandardType,
} from '@cipansor/shared';
import { ApiError, ErrorCode, Errors } from '@/middleware/error';
import { claimBlobForRecord, releaseBlobClaimById, type BlobClaimHandle } from '@/utils/blob-claim';

// Define inputs locally if not in shared
interface CreateAuditInput {
  unitId: string;
  academicYearId: string;
  code: string;
  name: string;
  startDate: string; // ISO Date string
  endDate: string; // ISO Date string
  leadAuditorId?: string;
  notes?: string;
}

interface UpdateAuditItemInput {
  score?: number;
  notes?: string;
}

export const qualityService = {
  // Get all standards with indicators
  getAllStandards: async () => {
    return prisma.qualityStandard.findMany({
      include: {
        indicators: {
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: {
              select: { evidences: true },
            },
          },
        },
      },
      orderBy: { type: 'asc' },
    });
  },

  // Get standard details with evidence for a specific unit
  getStandardDetails: async (standardId: string, unitId: string, academicYearId: string) => {
    return prisma.qualityStandard.findUnique({
      where: { id: standardId },
      include: {
        indicators: {
          orderBy: { sortOrder: 'asc' },
          include: {
            evidences: {
              where: {
                unitId,
                academicYearId,
              },
              include: {
                uploadedBy: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    });
  },

  // Upload evidence
  createEvidence: async (data: CreateQualityEvidenceInput, userId: string) => {
    // Claim the evidence blob before the row references it, so a concurrent
    // discard of a just-uploaded file cannot delete it between its reference
    // probe and this insert (BUG 4 / flag 9).
    const claim = await claimBlobForRecord(data.fileUrl, userId);
    if (!claim) {
      throw Errors.conflict(
        'Berkas bukti sedang diproses pihak lain; unggah ulang berkas tersebut'
      );
    }
    try {
      return await prisma.qualityEvidence.create({
        data: {
          unitId: data.unitId,
          indicatorId: data.indicatorId,
          academicYearId: data.academicYearId,
          name: data.name,
          fileUrl: data.fileUrl,
          description: data.description,
          uploadedById: userId,
        },
      });
    } finally {
      // The row (or the failure) is now durable; the reference is the claim.
      if (claim) await releaseBlobClaimById(claim).catch(() => undefined);
    }
  },

  // Delete evidence
  deleteEvidence: async (evidenceId: string) => {
    return prisma.qualityEvidence.delete({
      where: { id: evidenceId },
    });
  },

  // Get dashboard summary (compliance per standard)
  getDashboardSummary: async (
    unitId: string,
    academicYearId: string
  ): Promise<QualityDashboardSummary[]> => {
    const standards = await prisma.qualityStandard.findMany({
      include: {
        indicators: {
          include: {
            _count: {
              select: {
                evidences: {
                  where: {
                    unitId,
                    academicYearId,
                  },
                },
              },
            },
          },
        },
      },
    });

    return standards.map((std) => {
      const totalIndicators = std.indicators.length;
      // An indicator is "compliant" if it has at least one evidence uploaded
      const compliantIndicators = std.indicators.filter((ind) => ind._count.evidences > 0).length;

      return {
        id: std.id,
        standardType: std.type as unknown as QualityStandardType,
        standardName: std.name,
        totalIndicators,
        uploadedEvidenceCount: std.indicators.reduce((acc, curr) => acc + curr._count.evidences, 0),
        compliancePercentage:
          totalIndicators > 0 ? (compliantIndicators / totalIndicators) * 100 : 0,
      };
    });
  },

  // --- Audit Management ---

  createAudit: async (data: CreateAuditInput, userRole: string, userUnitId?: string) => {
    // Security check: If not SUPER_ADMIN, ensure user can only create audit for their own unit
    if (userRole !== 'SUPER_ADMIN') {
      if (!userUnitId || data.unitId !== userUnitId) {
        throw new ApiError(
          ErrorCode.FORBIDDEN,
          'Access denied: You can only create audits for your own unit'
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      // 1. Create the Audit
      const audit = await tx.qualityAudit.create({
        data: {
          unitId: data.unitId,
          academicYearId: data.academicYearId,
          code: data.code,
          name: data.name,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          leadAuditorId: data.leadAuditorId,
          notes: data.notes,
          status: 'PLANNED',
        },
      });

      // 2. Fetch all indicators
      const indicators = await tx.qualityIndicator.findMany({
        where: { isActive: true },
      });

      // 3. Create Audit Items for each indicator
      if (indicators.length > 0) {
        await tx.qualityAuditItem.createMany({
          data: indicators.map((ind) => ({
            auditId: audit.id,
            indicatorId: ind.id,
          })),
        });
      }

      return audit;
    });
  },

  getAudits: async (
    unitId: string,
    academicYearId: string,
    userRole: string,
    userUnitId?: string
  ) => {
    // Security check: If not SUPER_ADMIN, ensure user can only list audits for their own unit
    if (userRole !== 'SUPER_ADMIN') {
      if (!userUnitId || unitId !== userUnitId) {
        throw new ApiError(
          ErrorCode.FORBIDDEN,
          'Access denied: You can only view audits for your own unit'
        );
      }
    }

    return prisma.qualityAudit.findMany({
      where: {
        unitId,
        academicYearId,
      },
      include: {
        leadAuditor: {
          select: { id: true, name: true },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });
  },

  getAuditDetails: async (auditId: string, userRole: string, userUnitId?: string) => {
    const audit = await prisma.qualityAudit.findUnique({
      where: { id: auditId },
      include: {
        leadAuditor: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            indicator: {
              include: {
                standard: true,
              },
            },
            auditor: {
              select: { id: true, name: true },
            },
          },
          orderBy: [
            { indicator: { standard: { type: 'asc' } } },
            { indicator: { sortOrder: 'asc' } },
          ],
        },
      },
    });

    if (!audit) {
      return null;
    }

    // Security check: If not SUPER_ADMIN, ensure user belongs to the same unit
    if (userRole !== 'SUPER_ADMIN') {
      if (!userUnitId || audit.unitId !== userUnitId) {
        throw new ApiError(
          ErrorCode.FORBIDDEN,
          'Access denied: You can only view audits for your own unit'
        );
      }
    }

    return audit;
  },

  updateAuditItem: async (
    itemId: string,
    data: UpdateAuditItemInput,
    userId: string,
    userRole: string,
    userUnitId?: string
  ) => {
    const item = await prisma.qualityAuditItem.findUnique({
      where: { id: itemId },
      include: { audit: true },
    });

    if (!item) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Audit item not found');
    }

    // Security check: If not SUPER_ADMIN, ensure user belongs to the same unit
    if (userRole !== 'SUPER_ADMIN') {
      if (!userUnitId || item.audit.unitId !== userUnitId) {
        throw new ApiError(ErrorCode.FORBIDDEN, 'Access denied: You can only audit your own unit');
      }
    }

    return prisma.qualityAuditItem.update({
      where: { id: itemId },
      data: {
        score: data.score,
        notes: data.notes,
        auditorId: userId,
        updatedAt: new Date(),
      },
    });
  },
};
