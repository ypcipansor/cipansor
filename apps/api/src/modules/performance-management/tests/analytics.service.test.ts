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

// Count mock yang bergantung pada unit + status, bukan pada urutan pemanggilan
// microtask di Promise.all. `approved` dipakai untuk syarat eligibility ranking
// (status APPROVED), `total` untuk metrik totalEvaluations (semua status).
function mockEvaluationCount(
  config: Record<string, { total: number; approved: number }>,
  foundationTotal = 0
) {
  mocked.pKEvaluation.count.mockImplementation(async (args?: any) => {
    const unitId = args?.where?.pk?.user?.unitId;
    const status = args?.where?.status;
    if (!unitId) return status === 'APPROVED' ? 0 : foundationTotal;
    const c = config[unitId] ?? { total: 0, approved: 0 };
    return status === 'APPROVED' ? c.approved : c.total;
  });
}

describe('PKAnalyticsService unit tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getUnitPerformanceDashboard - totalEvaluations count', () => {
    it('counts all evaluations (including DRAFT and APPROVED) for totalEvaluations', async () => {
      mocked.unit.findMany.mockResolvedValue([
        { id: 'unit-1', name: 'SDIT' },
      ]);
      mocked.performanceAgreement.findMany
        .mockResolvedValueOnce([]) // foundationPks
        .mockResolvedValueOnce([
          { status: 'APPROVED', overallScore: 85, totalScore: 80, behaviorScore: 90 },
        ]) // unit-1 allPks
        .mockResolvedValueOnce([
          { overallScore: 85, totalScore: 80, behaviorScore: 90 },
        ]); // approvedPksAll

      // Foundation evaluation count (all statuses) = 3; unit-1 total = 7,
      // approved-only = 6 — totalEvaluations tetap menghitung SEMUA evaluasi.
      mockEvaluationCount({ 'unit-1': { total: 7, approved: 6 } }, 3);

      const result = await pkAnalyticsService.getUnitPerformanceDashboard();

      expect(result.totalEvaluations).toBe(10);
      // Verify the total evaluation counts do NOT restrict status to APPROVED
      expect(mocked.pKEvaluation.count.mock.calls[0][0].where.status).toBeUndefined();
      expect(mocked.pKEvaluation.count.mock.calls[1][0].where.status).toBeUndefined();
      // Verify the ranking-eligibility count DOES restrict status to APPROVED
      expect(mocked.pKEvaluation.count.mock.calls[2][0].where.status).toBe('APPROVED');
      expect(mocked.pKEvaluation.count.mock.calls[2][0].where).toHaveProperty('pk');
    });
  });

  describe('getUnitPerformanceDashboard - ranking', () => {
    it('tidak memasukkan unit tanpa evaluasi APPROVED ke daftar ranking', async () => {
      mocked.unit.findMany.mockResolvedValue([
        { id: 'unit-1', name: 'SDIT' },
        { id: 'unit-2', name: 'SMPIT' },
      ]);
      // unit-1: PK APPROVED tetapi approvedEvCount = 0 (belum pernah dinilai).
      // unit-2: PK APPROVED dan approvedEvCount = 1 (ada evaluasi, skor rendah).
      mocked.performanceAgreement.findMany
        .mockResolvedValueOnce([]) // foundationPks
        .mockResolvedValueOnce([{ status: 'APPROVED', overallScore: 90, totalScore: 90, behaviorScore: 90 }]) // unit-1
        .mockResolvedValueOnce([{ status: 'APPROVED', overallScore: 40, totalScore: 40, behaviorScore: 40 }]) // unit-2
        .mockResolvedValueOnce([{ overallScore: 90, totalScore: 90, behaviorScore: 90 }]); // approvedPksAll

      // Order-independent count mock: buat hasil bergantung pada unit + status,
      // agar tidak bergantung pada urutan microtask antar-unit di Promise.all.
      mockEvaluationCount({
        'unit-1': { total: 0, approved: 0 },
        'unit-2': { total: 1, approved: 1 },
      });

      const result = await pkAnalyticsService.getUnitPerformanceDashboard();

      // Sebelum perbaikan, unit-1 (pkCount=1, skor 0) ikut diperingkat dan
      // tampil di "kinerja terburuk". Sekarang ia harus keluar dari ranking.
      expect(result.bestPerformingUnits.map((u) => u.id)).not.toContain('unit-1');
      expect(result.worstPerformingUnits.map((u) => u.id)).not.toContain('unit-1');
      // Hanya unit yang benar-benar dinilai (approvedEvCount > 0) yang masuk ranking.
      expect(result.worstPerformingUnits.map((u) => u.id)).toContain('unit-2');
      // unit-1 dilaporkan terpisah sebagai "belum ada data".
      expect(result.unitsWithoutApprovedPk.map((u) => u.id)).toContain('unit-1');
    });

    // REGRESI (bug #2): unit yang hanya punya evaluasi DRAFT (belum
    // disetujui) tidak boleh masuk ranking — agregat skor PK-nya belum sah.
    it('mengecualikan unit yang hanya punya evaluasi DRAFT dari ranking (regresi)', async () => {
      mocked.unit.findMany.mockResolvedValue([
        { id: 'unit-1', name: 'SDIT' },
        { id: 'unit-2', name: 'SMPIT' },
      ]);
      // unit-1: PK APPROVED, punya 2 evaluasi DRAFT (evaCount total = 2,
      // approvedEvCount = 0) → harus KELUAR dari ranking.
      // unit-2: PK APPROVED, punya 1 evaluasi APPROVED → masuk ranking.
      mocked.performanceAgreement.findMany
        .mockResolvedValueOnce([]) // foundationPks
        .mockResolvedValueOnce([{ status: 'APPROVED', overallScore: 90, totalScore: 90, behaviorScore: 90 }]) // unit-1
        .mockResolvedValueOnce([{ status: 'APPROVED', overallScore: 40, totalScore: 40, behaviorScore: 40 }]) // unit-2
        .mockResolvedValueOnce([{ overallScore: 90, totalScore: 90, behaviorScore: 90 }]); // approvedPksAll

      mockEvaluationCount({
        'unit-1': { total: 2, approved: 0 },
        'unit-2': { total: 1, approved: 1 },
      });

      const result = await pkAnalyticsService.getUnitPerformanceDashboard();

      // Sebelum perbaikan, unit-1 masuk ranking karena evCount total = 2 (> 0),
      // tampil dengan skor agregat dari evaluasi DRAFT yang belum disetujui.
      expect(result.bestPerformingUnits.map((u) => u.id)).not.toContain('unit-1');
      expect(result.worstPerformingUnits.map((u) => u.id)).not.toContain('unit-1');
      expect(result.worstPerformingUnits.map((u) => u.id)).toContain('unit-2');
      expect(result.unitsWithoutApprovedPk.map((u) => u.id)).toContain('unit-1');
      // totalEvaluations tetap menghitung SEMUA evaluasi, termasuk DRAFT.
      expect(result.totalEvaluations).toBe(3);
    });
  });
});
