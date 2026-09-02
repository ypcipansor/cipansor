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
});
