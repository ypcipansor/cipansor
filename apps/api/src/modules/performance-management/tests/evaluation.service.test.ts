import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    performanceAgreement: { findUnique: vi.fn(), update: vi.fn() },
    pKEvaluation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    pKIndicator: { update: vi.fn() },
    pKIndicatorEvaluation: { findUnique: vi.fn(), update: vi.fn() },
    pKBehaviorEvaluation: { findUnique: vi.fn(), update: vi.fn() },
    behavioralValue: { findMany: vi.fn() },
    talentProfile: { findUnique: vi.fn() },
    talentAssessment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { evaluationService } from '../evaluation.service';

const mocked = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
  $transaction: ReturnType<typeof vi.fn>;
};

describe('EvaluationService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('recalculateEvaluationScores', () => {
    it('computes weighted performance, weighted SAFTI behavior, and 70/30 overall', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        pkId: 'pk-1',
        status: 'DRAFT',
        indicatorDetails: [
          { score: 100, indicator: { weight: 60 } },
          { score: 50, indicator: { weight: 40 } },
        ],
        behaviorDetails: [
          { score: 90, behaviorValue: { weight: 1 } },
          { score: 70, behaviorValue: { weight: 1 } },
        ],
      });
      mocked.pKEvaluation.update.mockResolvedValue({});

      await evaluationService.recalculateEvaluationScores('ev-1');

      const args = mocked.pKEvaluation.update.mock.calls[0][0];
      // performance = 100*0.6 + 50*0.4 = 80; behavior = (90+70)/2 = 80
      // overall = 80 * 0.6 + 80 * 0.4 = 80
      expect(args.data.performanceScore).toBe(80);
      expect(args.data.behaviorScore).toBe(80);
      expect(args.data.overallScore).toBeCloseTo(80);
    });

    it('respects unequal behavioral-value weights', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        pkId: 'pk-1',
        status: 'DRAFT',
        indicatorDetails: [],
        behaviorDetails: [
          { score: 100, behaviorValue: { weight: 3 } },
          { score: 0, behaviorValue: { weight: 1 } },
        ],
      });
      mocked.pKEvaluation.update.mockResolvedValue({});

      await evaluationService.recalculateEvaluationScores('ev-1');

      const args = mocked.pKEvaluation.update.mock.calls[0][0];
      expect(args.data.behaviorScore).toBe(75);
    });
  });

  describe('concurrent edit after approval regression tests', () => {
    let mockQueryRaw: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockQueryRaw = vi.fn().mockResolvedValue([]);
      mocked.$transaction.mockImplementation(async (cb: any) =>
        cb({
          ...prisma,
          $queryRaw: mockQueryRaw,
        })
      );
    });

    it('rejects updateIndicatorRealization when evaluation status becomes APPROVED after lock', async () => {
      mocked.pKEvaluation.findUnique
        .mockResolvedValueOnce({ id: 'ev-1', pkId: 'pk-1' }) // initial check in loadEditableEvaluationInTx
        .mockResolvedValueOnce({
          id: 'ev-1',
          pkId: 'pk-1',
          status: 'APPROVED', // status re-checked after locking row
          pk: { userId: 'u-1', supervisorId: 'u-boss' },
        });

      await expect(
        evaluationService.updateIndicatorRealization('ev-1', 'ind-1', 'u-1', false, { realization: 100 })
      ).rejects.toThrow(/approved/i);

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      const sqlStrings = mockQueryRaw.mock.calls[0][0];
      expect(sqlStrings.join('')).toContain('SELECT id FROM "performance_agreements" WHERE id =');
      expect(sqlStrings.join('')).toContain('FOR UPDATE');
      expect(mocked.pKIndicatorEvaluation.update).not.toHaveBeenCalled();
    });

    it('rejects updateBehaviorScore when evaluation status becomes APPROVED after lock', async () => {
      mocked.pKEvaluation.findUnique
        .mockResolvedValueOnce({ id: 'ev-1', pkId: 'pk-1' })
        .mockResolvedValueOnce({
          id: 'ev-1',
          pkId: 'pk-1',
          status: 'APPROVED',
          pk: { userId: 'u-1', supervisorId: 'u-boss' },
        });

      await expect(
        evaluationService.updateBehaviorScore('ev-1', 'bv-1', 'u-boss', false, { score: 95 })
      ).rejects.toThrow(/approved/i);

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mocked.pKBehaviorEvaluation.update).not.toHaveBeenCalled();
    });

    it('blocks PK owner from scoring their own SAFTI behavior (403 Forbidden)', async () => {
      mocked.pKEvaluation.findUnique
        .mockResolvedValueOnce({ id: 'ev-1', pkId: 'pk-1' })
        .mockResolvedValueOnce({
          id: 'ev-1',
          pkId: 'pk-1',
          status: 'DRAFT',
          pk: { userId: 'u-1', supervisorId: 'u-boss' },
        });

      await expect(
        evaluationService.updateBehaviorScore('ev-1', 'bv-1', 'u-1', false, { score: 95 })
      ).rejects.toThrow(/supervisor/i);

      expect(mocked.pKBehaviorEvaluation.update).not.toHaveBeenCalled();
    });

    it('allows assigned supervisor to update SAFTI behavior score', async () => {
      mocked.pKEvaluation.findUnique
        .mockResolvedValueOnce({ id: 'ev-1', pkId: 'pk-1' })
        .mockResolvedValueOnce({
          id: 'ev-1',
          pkId: 'pk-1',
          status: 'DRAFT',
          pk: { userId: 'u-1', supervisorId: 'u-boss' },
        });
      mocked.pKBehaviorEvaluation.findUnique.mockResolvedValueOnce({
        id: 'bev-1',
        evaluationId: 'ev-1',
        behaviorValueId: 'bv-1',
      });
      mocked.pKBehaviorEvaluation.update.mockResolvedValueOnce({ id: 'bev-1' });

      await evaluationService.updateBehaviorScore('ev-1', 'bv-1', 'u-boss', false, { score: 95 });

      expect(mocked.pKBehaviorEvaluation.update).toHaveBeenCalled();
    });
  });

  describe('createEvaluation', () => {
    it('refuses to evaluate a PK that is not APPROVED', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: null,
        status: 'DRAFT',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-12-31'),
        indicators: [],
      });

      await expect(
        evaluationService.createEvaluation('u-1', false, { pkId: 'pk-1', month: 1, year: 2026 })
      ).rejects.toThrow(/APPROVED/);
      expect(mocked.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('approveEvaluation', () => {
    let mockQueryRaw: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockQueryRaw = vi.fn().mockResolvedValue([]);
      mocked.$transaction.mockImplementation(async (cb: any) =>
        cb({
          ...prisma,
          $queryRaw: mockQueryRaw,
        })
      );
    });

    it('executes row lock query with correct performance_agreements table name', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        pkId: 'pk-1',
        status: 'DRAFT',
        pk: { userId: 'u-1', supervisorId: 'u-boss' },
      });
      mocked.pKEvaluation.updateMany.mockResolvedValue({ count: 1 });
      mocked.performanceAgreement.findUnique.mockResolvedValue(null);

      await evaluationService.approveEvaluation('ev-1', 'u-boss', false);

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      const rawCall = mockQueryRaw.mock.calls[0];
      // Assert SQL string contains correct table name "performance_agreements"
      const sqlStrings = rawCall[0];
      expect(sqlStrings.join('')).toContain('SELECT id FROM "performance_agreements" WHERE id =');
      expect(sqlStrings.join('')).toContain('FOR UPDATE');
    });

    it('only the supervisor may approve and double approval conflicts', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        pkId: 'pk-1',
        status: 'DRAFT',
        pk: { userId: 'u-1', supervisorId: 'u-boss' },
      });

      await expect(evaluationService.approveEvaluation('ev-1', 'u-1', false)).rejects.toThrow();

      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        pkId: 'pk-1',
        status: 'APPROVED',
        pk: { userId: 'u-1', supervisorId: 'u-boss' },
      });
      mocked.pKEvaluation.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        evaluationService.approveEvaluation('ev-1', 'u-boss', false)
      ).rejects.toThrow(/already approved/i);
    });

    it('approves and rolls YTD + PK aggregates up, skipping talent sync without supervisor', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        pkId: 'pk-1',
        status: 'DRAFT',
        pk: { userId: 'u-1', supervisorId: 'u-boss' },
      });
      mocked.pKEvaluation.updateMany.mockResolvedValue({ count: 1 });
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: null, // supervisor removed since — no talent sync
        periodStart: new Date('2026-01-01'),
        indicators: [
          { id: 'ind-1', evaluations: [{ realization: 3 }, { realization: 4 }] },
        ],
        evaluations: [
          { performanceScore: 80, behaviorScore: 90, overallScore: 83 },
          { performanceScore: 60, behaviorScore: 70, overallScore: 63 },
        ],
      });
      mocked.pKIndicator.update.mockResolvedValue({});
      mocked.performanceAgreement.update.mockResolvedValue({});

      await evaluationService.approveEvaluation('ev-1', 'u-boss', false);

      expect(mocked.pKIndicator.update).toHaveBeenCalledWith({
        where: { id: 'ind-1' },
        data: { realization: 7 },
      });
      const pkUpdate = mocked.performanceAgreement.update.mock.calls[0][0];
      expect(pkUpdate.data.totalScore).toBe(70);
      expect(pkUpdate.data.behaviorScore).toBe(80);
      expect(pkUpdate.data.overallScore).toBe(73);
      expect(mocked.talentProfile.findUnique).not.toHaveBeenCalled();
    });

    it('updates the existing talent assessment instead of stacking new rows', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        pkId: 'pk-1',
        status: 'DRAFT',
        pk: { userId: 'u-1', supervisorId: 'u-boss' },
      });
      mocked.pKEvaluation.updateMany.mockResolvedValue({ count: 1 });
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: 'u-boss',
        periodStart: new Date('2026-01-01'),
        indicators: [],
        evaluations: [{ performanceScore: 95, behaviorScore: 90, overallScore: 93.5 }],
      });
      mocked.performanceAgreement.update.mockResolvedValue({});
      mocked.talentProfile.findUnique.mockResolvedValue({
        id: 'tp-1',
        assessments: [{ potentialRating: 'EXCEEDS' }],
      });
      mocked.talentAssessment.findFirst.mockResolvedValue({ id: 'ta-existing' });
      mocked.talentAssessment.update.mockResolvedValue({});

      await evaluationService.approveEvaluation('ev-1', 'u-boss', false);

      expect(mocked.talentAssessment.create).not.toHaveBeenCalled();
      const taUpdate = mocked.talentAssessment.update.mock.calls[0][0];
      expect(taUpdate.where).toEqual({ id: 'ta-existing' });
      expect(taUpdate.data.performanceRating).toBe('OUTSTANDING');
      // Potential is carried forward from the latest human assessment.
      expect(taUpdate.data.potentialRating).toBe('EXCEEDS');
    });
  });
});
