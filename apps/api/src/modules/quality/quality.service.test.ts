import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { qualityService } from './quality.service';
import { ApiError } from '@/middleware/error';

// The create path claims the blob before inserting the record (BUG 4). The
// protocol itself has its own unit + DB integration tests; here we only need a
// claim that always succeeds.
vi.mock('@/utils/blob-claim', () => ({
  claimBlobForRecord: vi.fn().mockResolvedValue(true),
  releaseBlobClaim: vi.fn().mockResolvedValue(undefined),
}));

// Mock all external dependencies
vi.mock('../../lib/prisma', () => ({
  prisma: {
    qualityStandard: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    qualityEvidence: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    qualityAudit: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    qualityIndicator: {
      findMany: vi.fn(),
    },
    qualityAuditItem: {
      createMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe('Quality Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllStandards', () => {
    it('should return all standards with indicators', async () => {
      const mockStandards = [
        { id: 'std-1', name: 'Standard 1', indicators: [] },
      ];
      vi.mocked(prisma.qualityStandard.findMany).mockResolvedValue(mockStandards as any);

      const result = await qualityService.getAllStandards();

      expect(prisma.qualityStandard.findMany).toHaveBeenCalled();
      expect(result).toEqual(mockStandards);
    });
  });

  describe('createEvidence', () => {
    it('should create evidence successfully', async () => {
      const dto = {
        unitId: 'unit-1',
        indicatorId: 'ind-1',
        academicYearId: 'ay-1',
        name: 'Evidence 1',
        fileUrl: 'http://example.com/file.pdf',
        description: 'Test description',
      };
      const userId = 'user-1';

      const mockCreated = {
        id: 'ev-1',
        ...dto,
        uploadedById: userId,
      };

      vi.mocked(prisma.qualityEvidence.create).mockResolvedValue(mockCreated as any);

      const result = await qualityService.createEvidence(dto, userId);

      expect(prisma.qualityEvidence.create).toHaveBeenCalledWith({
        data: {
          unitId: dto.unitId,
          indicatorId: dto.indicatorId,
          academicYearId: dto.academicYearId,
          name: dto.name,
          fileUrl: dto.fileUrl,
          description: dto.description,
          uploadedById: userId,
        },
      });
      expect(result).toEqual(mockCreated);
    });
  });

  describe('getDashboardSummary', () => {
    it('should calculate compliance percentage correctly', async () => {
      const mockStandards = [
        {
          id: 'std-1',
          type: 'KOMPETENSI_LULUSAN',
          name: 'Standar Kompetensi Lulusan',
          indicators: [
            { _count: { evidences: 2 } }, // Compliant
            { _count: { evidences: 0 } }, // Non-compliant
          ],
        },
      ];

      vi.mocked(prisma.qualityStandard.findMany).mockResolvedValue(mockStandards as any);

      const result = await qualityService.getDashboardSummary('unit-1', 'ay-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'std-1',
        standardType: 'KOMPETENSI_LULUSAN',
        standardName: 'Standar Kompetensi Lulusan',
        totalIndicators: 2,
        uploadedEvidenceCount: 2,
        compliancePercentage: 50, // 1 out of 2 indicators have evidence
      });
    });
  });

  describe('createAudit', () => {
    it('should allow SUPER_ADMIN to create audit for any unit', async () => {
      const dto = {
        unitId: 'unit-2',
        academicYearId: 'ay-1',
        code: 'AUD-2026',
        name: 'Annual Audit',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-31T00:00:00.000Z',
      };

      const mockAudit = { id: 'audit-1', ...dto };
      vi.mocked(prisma.qualityAudit.create).mockResolvedValue(mockAudit as any);
      vi.mocked(prisma.qualityIndicator.findMany).mockResolvedValue([{ id: 'ind-1' }] as any);
      vi.mocked(prisma.qualityAuditItem.createMany).mockResolvedValue({ count: 1 } as any);

      const result = await qualityService.createAudit(dto, 'SUPER_ADMIN');

      expect(prisma.qualityAudit.create).toHaveBeenCalled();
      expect(prisma.qualityAuditItem.createMany).toHaveBeenCalledWith({
        data: [{ auditId: mockAudit.id, indicatorId: 'ind-1' }],
      });
      expect(result).toEqual(mockAudit);
    });

    it('should block UNIT_ADMIN from creating audit for another unit', async () => {
      const dto = {
        unitId: 'unit-2', // different unit
        academicYearId: 'ay-1',
        code: 'AUD-2026',
        name: 'Annual Audit',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-31T00:00:00.000Z',
      };

      await expect(qualityService.createAudit(dto, 'UNIT_ADMIN', 'unit-1')).rejects.toThrow(ApiError);
    });
  });
});
