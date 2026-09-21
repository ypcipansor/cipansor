import { describe, it, expect, vi, beforeEach } from 'vitest';
import { qualityService } from '../../../../src/modules/quality/quality.service';
import { prisma } from '../../../../src/lib/prisma';

// The create path claims the blob before inserting the record (BUG 4). The
// protocol has its own unit + DB integration tests; here the claim succeeds.
vi.mock('@/utils/blob-claim', () => ({
  claimBlobForRecord: vi.fn().mockResolvedValue(true),
  releaseBlobClaim: vi.fn().mockResolvedValue(undefined),
}));

// Mock Prisma
vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    qualityStandard: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    qualityEvidence: {
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('QualityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDashboardSummary', () => {
    it('should calculate compliance percentage correctly', async () => {
      const mockStandards = [
        {
          id: 'std-1',
          type: 'STANDAR_ISI',
          name: 'Standar Isi',
          indicators: [
            { id: 'ind1', _count: { evidences: 1 } }, // Compliant
            { id: 'ind2', _count: { evidences: 0 } }, // Non-compliant
          ],
        },
      ];

      (prisma.qualityStandard.findMany as any).mockResolvedValue(mockStandards);

      const result = await qualityService.getDashboardSummary('unit-1', 'year-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('std-1');
      expect(result[0].standardType).toBe('STANDAR_ISI');
      expect(result[0].totalIndicators).toBe(2);
      expect(result[0].uploadedEvidenceCount).toBe(1);
      expect(result[0].compliancePercentage).toBe(50); // 1 out of 2
    });

    it('should handle zero indicators', async () => {
      const mockStandards = [
        {
          id: 'std-2',
          type: 'STANDAR_PROSES',
          name: 'Standar Proses',
          indicators: [],
        },
      ];

      (prisma.qualityStandard.findMany as any).mockResolvedValue(mockStandards);

      const result = await qualityService.getDashboardSummary('unit-1', 'year-1');

      expect(result[0].compliancePercentage).toBe(0);
    });
  });

  describe('createEvidence', () => {
    it('should create evidence record', async () => {
      const input = {
        unitId: 'unit-1',
        indicatorId: 'ind-1',
        academicYearId: 'year-1',
        name: 'Evidence 1',
        fileUrl: 'http://example.com/file.pdf',
        description: 'Test evidence',
      };
      const userId = 'user-1';

      (prisma.qualityEvidence.create as any).mockResolvedValue({ id: 'ev-1', ...input });

      await qualityService.createEvidence(input, userId);

      expect(prisma.qualityEvidence.create).toHaveBeenCalledWith({
        data: {
          ...input,
          uploadedById: userId,
        },
      });
    });
  });
});
