import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    unit: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    performanceAgreement: {
      findMany: vi.fn(),
    },
    pKEvaluation: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    strategicPlan: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { pkAnalyticsService } from '../analytics.service';

const mocked = prisma as unknown as {
  unit: Record<string, ReturnType<typeof vi.fn>>;
  performanceAgreement: Record<string, ReturnType<typeof vi.fn>>;
  pKEvaluation: Record<string, ReturnType<typeof vi.fn>>;
  strategicPlan: Record<string, ReturnType<typeof vi.fn>>;
};

describe('PKAnalyticsService unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUnitPerformanceDashboard - totalEvaluations count', () => {
    it('counts all evaluations (including DRAFT and APPROVED) for totalEvaluations', async () => {
      mocked.unit.findMany.mockResolvedValue([
        { id: 'unit-1', name: 'SDIT' },
      ]);
      mocked.performanceAgreement.findMany
        .mockResolvedValueOnce([
          { status: 'APPROVED', overallScore: 85, totalScore: 80, behaviorScore: 90 },
        ])
        .mockResolvedValueOnce([
          { status: 'APPROVED', overallScore: 85, totalScore: 80, behaviorScore: 90 },
        ])
        .mockResolvedValueOnce([
          { overallScore: 85, totalScore: 80, behaviorScore: 90 },
        ]);

      // Foundation evaluation count mock
      mocked.pKEvaluation.count.mockResolvedValueOnce(3); // 3 foundation evaluations (draft + approved)
      // Unit evaluation count mock
      mocked.pKEvaluation.count.mockResolvedValueOnce(7); // 7 unit evaluations (draft + approved)

      const result = await pkAnalyticsService.getUnitPerformanceDashboard();

      expect(result.totalEvaluations).toBe(10);
      // Verify pKEvaluation.count query did NOT restrict status to APPROVED
      expect(mocked.pKEvaluation.count.mock.calls[0][0].where.status).toBeUndefined();
      expect(mocked.pKEvaluation.count.mock.calls[1][0].where.status).toBeUndefined();
    });
  });

  describe('getUnitPerformanceDashboard - ranking', () => {
    it('tidak memasukkan unit tanpa evaluasi APPROVED ke daftar ranking', async () => {
      mocked.unit.findMany.mockResolvedValue([
        { id: 'unit-1', name: 'SDIT' },
        { id: 'unit-2', name: 'SMPIT' },
      ]);
      // unit-1: PK APPROVED tetapi evCount = 0 (belum pernah dinilai).
      // unit-2: PK APPROVED dan evCount = 1 (ada evaluasi, skor rendah).
      mocked.performanceAgreement.findMany
        .mockResolvedValueOnce([]) // foundationPks
        .mockResolvedValueOnce([{ status: 'APPROVED', overallScore: 90, totalScore: 90, behaviorScore: 90 }]) // unit-1
        .mockResolvedValueOnce([{ status: 'APPROVED', overallScore: 40, totalScore: 40, behaviorScore: 40 }]) // unit-2
        .mockResolvedValueOnce([{ overallScore: 90, totalScore: 90, behaviorScore: 90 }]); // approvedPksAll

      mocked.pKEvaluation.count
        .mockResolvedValueOnce(0) // foundationEvCount
        .mockResolvedValueOnce(0) // unit-1 evCount
        .mockResolvedValueOnce(1); // unit-2 evCount

      const result = await pkAnalyticsService.getUnitPerformanceDashboard();

      // Sebelum perbaikan, unit-1 (pkCount=1, skor 0) ikut diperingkat dan
      // tampil di "kinerja terburuk". Sekarang ia harus keluar dari ranking.
      expect(result.bestPerformingUnits.map((u) => u.id)).not.toContain('unit-1');
      expect(result.worstPerformingUnits.map((u) => u.id)).not.toContain('unit-1');
      // Hanya unit yang benar-benar dinilai (evCount > 0) yang masuk ranking.
      expect(result.worstPerformingUnits.map((u) => u.id)).toContain('unit-2');
      // unit-1 dilaporkan terpisah sebagai "belum ada data".
      expect(result.unitsWithoutApprovedPk.map((u) => u.id)).toContain('unit-1');
    });
  });
});
