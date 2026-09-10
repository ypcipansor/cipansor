import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndicatorAggregation } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    performanceAgreement: { findUnique: vi.fn(), update: vi.fn() },
    pKEvaluation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    pKIndicator: { update: vi.fn() },
    pKIndicatorEvaluation: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
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
    it('computes weighted performance, weighted SAFTI behavior, and overall', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        pkId: 'pk-1',
        status: 'DRAFT',
        indicatorDetails: [
          {
            id: 'dev-1',
            indicatorId: 'ind-1',
            indicator: { weight: 60, target: 100, aggregation: IndicatorAggregation.KUMULATIF },
          },
          {
            id: 'dev-2',
            indicatorId: 'ind-2',
            indicator: { weight: 40, target: 40, aggregation: IndicatorAggregation.KUMULATIF },
          },
        ],
        behaviorDetails: [
          { score: 90, behaviorValue: { weight: 1 } },
          { score: 70, behaviorValue: { weight: 1 } },
        ],
      });
      // YTD untuk ind-1 = 100 → skor 100; ind-2 = 20 → skor 50.
      mocked.pKIndicatorEvaluation.findMany.mockResolvedValue([
        { indicatorId: 'ind-1', realization: 40, evaluation: { year: 2026, month: 1 } },
        { indicatorId: 'ind-1', realization: 60, evaluation: { year: 2026, month: 2 } },
        { indicatorId: 'ind-2', realization: 20, evaluation: { year: 2026, month: 1 } },
      ]);
      mocked.pKEvaluation.update.mockResolvedValue({});

      await evaluationService.recalculateEvaluationScores('ev-1');

      const args = mocked.pKEvaluation.update.mock.calls[0][0];
      // performance = 100*0.6 + 50*0.4 = 80; behavior = (90+70)/2 = 80
      // overall = 80 * 0.6 + 80 * 0.4 = 80
      expect(args.data.performanceScore).toBe(80);
      expect(args.data.behaviorScore).toBe(80);
      expect(args.data.overallScore).toBeCloseTo(80);
      // Skor yang dihitung dari capaian YTD dipersist ke detail evaluasi.
      const scoreUpdateArgs = mocked.pKIndicatorEvaluation.update.mock.calls.map((c) => c[0]);
      expect(scoreUpdateArgs).toContainEqual({ where: { id: 'dev-1' }, data: { score: 100 } });
      expect(scoreUpdateArgs).toContainEqual({ where: { id: 'dev-2' }, data: { score: 50 } });
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
      mocked.pKIndicatorEvaluation.findMany.mockResolvedValue([]);
      mocked.pKEvaluation.update.mockResolvedValue({});

      await evaluationService.recalculateEvaluationScores('ev-1');

      const args = mocked.pKEvaluation.update.mock.calls[0][0];
      expect(args.data.behaviorScore).toBe(75);
    });

    // Bug regresi #2 — indikator KUMULATIF dinilai dari capaian YTD ter-agregasi
    // (jumlah seluruh bulan) dibanding target, TIDAK dari rata-rata skor bulanan
    // mentah. Target setahun 120 yang dicicil 10/bulan selama 12 bulan harus
    // memberi ~100, bukan ~8.
    it('menilai indikator KUMULATIF dari capaian YTD (target 120 dicicil 12 bulan → ~100)', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-12',
        pkId: 'pk-1',
        status: 'DRAFT',
        indicatorDetails: [
          {
            id: 'dev-kum',
            indicatorId: 'ind-kum',
            indicator: { weight: 100, target: 120, aggregation: IndicatorAggregation.KUMULATIF },
          },
        ],
        behaviorDetails: [],
      });
      mocked.pKIndicatorEvaluation.findMany.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => ({
          indicatorId: 'ind-kum',
          realization: 10,
          evaluation: { year: 2026, month: i + 1 },
        }))
      );
      mocked.pKEvaluation.update.mockResolvedValue({});

      await evaluationService.recalculateEvaluationScores('ev-12');

      const args = mocked.pKEvaluation.update.mock.calls[0][0];
      expect(args.data.performanceScore).toBeCloseTo(100, 5);
      expect(mocked.pKIndicatorEvaluation.update).toHaveBeenCalledWith({
        where: { id: 'dev-kum' },
        data: { score: 100 },
      });
    });

    it('menghitung skor RATA_RATA dari rata-rata realisasi bulanan', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-rata',
        pkId: 'pk-1',
        status: 'DRAFT',
        indicatorDetails: [
          {
            id: 'dev-rata',
            indicatorId: 'ind-rata',
            indicator: { weight: 100, target: 85, aggregation: IndicatorAggregation.RATA_RATA },
          },
        ],
        behaviorDetails: [],
      });
      // Rata-rata 3 bulan = (90 + 80 + 85)/3 = 85 terhadap target 85 → 100.
      mocked.pKIndicatorEvaluation.findMany.mockResolvedValue([
        { indicatorId: 'ind-rata', realization: 90, evaluation: { year: 2026, month: 1 } },
        { indicatorId: 'ind-rata', realization: 80, evaluation: { year: 2026, month: 2 } },
        { indicatorId: 'ind-rata', realization: 85, evaluation: { year: 2026, month: 3 } },
      ]);
      mocked.pKEvaluation.update.mockResolvedValue({});

      await evaluationService.recalculateEvaluationScores('ev-rata');

      const args = mocked.pKEvaluation.update.mock.calls[0][0];
      expect(args.data.performanceScore).toBeCloseTo(100, 5);
      expect(mocked.pKIndicatorEvaluation.update).toHaveBeenCalledWith({
        where: { id: 'dev-rata' },
        data: { score: 100 },
      });
    });

    it('mengambil periode TERAKHIR untuk indikator keadaan akhir', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-akhir',
        pkId: 'pk-1',
        status: 'DRAFT',
        indicatorDetails: [
          {
            id: 'dev-akhir',
            indicatorId: 'ind-akhir',
            indicator: { weight: 100, target: 50, aggregation: IndicatorAggregation.TERAKHIR },
          },
        ],
        behaviorDetails: [],
      });
      // Keadaan akhir = 40 (bulan terakhir) terhadap target 50 → 80, BUKAN jumlah.
      mocked.pKIndicatorEvaluation.findMany.mockResolvedValue([
        { indicatorId: 'ind-akhir', realization: 25, evaluation: { year: 2026, month: 1 } },
        { indicatorId: 'ind-akhir', realization: 15, evaluation: { year: 2026, month: 2 } },
        { indicatorId: 'ind-akhir', realization: 40, evaluation: { year: 2026, month: 3 } },
      ]);
      mocked.pKEvaluation.update.mockResolvedValue({});

      await evaluationService.recalculateEvaluationScores('ev-akhir');

      const args = mocked.pKEvaluation.update.mock.calls[0][0];
      expect(args.data.performanceScore).toBeCloseTo(80, 5);
      expect(mocked.pKIndicatorEvaluation.update).toHaveBeenCalledWith({
        where: { id: 'dev-akhir' },
        data: { score: 80 },
      });
    });
// Bug regresi #3 — evaluasi periode berikutnya (atau status yang belum
    // dikunci) tidak boleh mengontaminasi skor YTD periode yang lebih awal.
    // Saat menghitung ulang skor Januari, agregasi realisasi wajib dibatasi ke
    // tahun/bulan <= Januari dan hanya status yang relevan (APPROVED/PROPOSED).
    it('membatasi agregasi YTD ke periode dan status yang relevan (Bug regresi #3)', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-jan',
        pkId: 'pk-1',
        status: 'DRAFT',
        year: 2026,
        month: 1,
        indicatorDetails: [
          {
            id: 'dev-jan',
            indicatorId: 'ind-jan',
            indicator: { weight: 100, target: 100, aggregation: IndicatorAggregation.KUMULATIF },
          },
        ],
        behaviorDetails: [],
      });
      mocked.pKIndicatorEvaluation.findMany.mockResolvedValue([]);
      mocked.pKEvaluation.update.mockResolvedValue({});

      await evaluationService.recalculateEvaluationScores('ev-jan');

      const callArgs = mocked.pKIndicatorEvaluation.findMany.mock.calls[0][0];
      const evalFilter = callArgs.where.evaluation;
      expect(evalFilter.AND).toEqual(
        expect.arrayContaining([
          { pkId: 'pk-1' },
          { OR: [{ id: 'ev-jan' }, { status: { in: ['APPROVED', 'PROPOSED'] } }] },
          { OR: [{ year: { lt: 2026 } }, { year: 2026, month: { lte: 1 } }] },
        ])
      );
    });

    // Versi perilaku Bug regresi #3: dengan where dipatuhi, realisasi Februari
    // tidak ikut — skor Januari (realisasi 40, target 100) = 40, bukan 100.
    it('menghitung skor Januari tanpa memakai realisasi Februari (Bug regresi #3)', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-jan',
        pkId: 'pk-1',
        status: 'DRAFT',
        year: 2026,
        month: 1,
        indicatorDetails: [
          {
            id: 'dev-jan',
            indicatorId: 'ind-jan',
            indicator: { weight: 100, target: 100, aggregation: IndicatorAggregation.KUMULATIF },
          },
        ],
        behaviorDetails: [],
      });

      // findMany mengabaikan where karena di-mock, jadi kita meniru basis data
      // dengan memfilter baris sesuai where periode evaluasi (<= Jan 2026):
      // realisasi Februari (month 2) TIDAK boleh ikut.
      mocked.pKIndicatorEvaluation.findMany.mockImplementation(async (args: any) => {
        const rows = [
          { indicatorId: 'ind-jan', realization: 40, evaluation: { year: 2026, month: 1 } },
          { indicatorId: 'ind-jan', realization: 60, evaluation: { year: 2026, month: 2 } },
        ];
        // Bentuk where.evaluation.AND[2].OR = [{year:{lt}}, {year, month:{lte}}]
        const periodCond = args.where.evaluation.AND.find(
          (c: any) => Array.isArray(c.OR) && c.OR[1] !== undefined && c.OR[1].year !== undefined
        );
        const y = periodCond?.OR?.[1]?.year ?? 2026;
        const m = periodCond?.OR?.[1]?.month?.lte ?? 1;
        return rows.filter(
          (r) => r.evaluation.year < y || (r.evaluation.year === y && r.evaluation.month <= m)
        );
      });
      mocked.pKEvaluation.update.mockResolvedValue({});

      await evaluationService.recalculateEvaluationScores('ev-jan');

      const args = mocked.pKEvaluation.update.mock.calls[0][0];
      expect(args.data.performanceScore).toBeCloseTo(40, 5);
      expect(mocked.pKIndicatorEvaluation.update).toHaveBeenCalledWith({
        where: { id: 'dev-jan' },
        data: { score: 40 },
      });
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
      // Bug regresi #4: agregat PK memakai capaian YTD TERKINI (evaluasi
      // terakhir), bukan rata-rata skor bulanan yang menaik. Evaluasi terakhir
      // dalam daftar (60/70/63) — bukan rata-rata (70/80/73).
      expect(pkUpdate.data.totalScore).toBe(60);
      expect(pkUpdate.data.behaviorScore).toBe(70);
      expect(pkUpdate.data.overallScore).toBe(63);
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
// Bug regresi #4 — agregat PK memakai capaian YTD TERKINI, bukan rata-rata
    // skor bulanan yang menaik. Target 120 dicicil 10/bulan selama 12 bulan
    // memberi skor YTD per bulan 8,33; 16,67; …; 100. Rata-rata dari 12 angka
    // itu ~54; capaian YTD terkini (bulan ke-12) = 100.
    it('mencapai ~100 untuk target tahunan yang dicicil penuh (Bug regresi #4)', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        id: 'ev-12',
        pkId: 'pk-1',
        status: 'DRAFT',
        pk: { userId: 'u-1', supervisorId: 'u-boss' },
      });
      mocked.pKEvaluation.updateMany.mockResolvedValue({ count: 1 });
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: null, // tanpa supervisor — tidak ada sinkron talent
        periodStart: new Date('2026-01-01'),
        indicators: [],
        evaluations: Array.from({ length: 12 }, (_, i) => {
          const p = Math.round((((i + 1) * 10) / 120) * 100 * 100) / 100;
          return { performanceScore: p, behaviorScore: 100 - i, overallScore: (p * 0.6 + (100 - i) * 0.4) };
        }),
      });
      mocked.pKIndicator.update.mockResolvedValue({});
      mocked.performanceAgreement.update.mockResolvedValue({});

      await evaluationService.approveEvaluation('ev-12', 'u-boss', false);

      const pkUpdate = mocked.performanceAgreement.update.mock.calls[0][0];
      // Evaluasi terakhir (bulan ke-12): performanceScore 100, behavior 89.
      expect(pkUpdate.data.totalScore).toBeCloseTo(100, 5);
      expect(pkUpdate.data.behaviorScore).toBeCloseTo(89, 5);
    });
  });
});
