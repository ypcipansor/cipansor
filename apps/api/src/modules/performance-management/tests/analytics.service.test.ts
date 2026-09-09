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

// Helper untuk membentuk PK dengan pembawa unit (user.unitId + strategicPlan.unitId)
// sesuai bentuk hasil select di analytics.service.
function pk(over: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'APPROVED',
    overallScore: 0,
    totalScore: 0,
    behaviorScore: 0,
    user: { unitId: 'unit-1' },
    strategicPlan: { unitId: 'unit-1' },
    ...over,
  };
}

// Evaluasi dengan pembawa unit pada PK-nya.
function ev(status: string, unitKey: string | null) {
  return {
    status,
    pk: { user: { unitId: unitKey }, strategicPlan: { unitId: unitKey } },
  };
}

describe('PKAnalyticsService unit tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getUnitPerformanceDashboard - totalEvaluations count', () => {
    it('counts all evaluations (including DRAFT and APPROVED) for totalEvaluations', async () => {
      mocked.unit.findMany.mockResolvedValue([{ id: 'unit-1', name: 'SDIT' }]);
      // Global: satu query PK mengembalikan foundation + unit-1.
      mocked.performanceAgreement.findMany.mockResolvedValue([
        pk({
          status: 'APPROVED',
          overallScore: 70,
          totalScore: 70,
          behaviorScore: 70,
          user: { unitId: null },
          strategicPlan: { unitId: null },
        }),
        pk({ status: 'APPROVED', overallScore: 85, totalScore: 80, behaviorScore: 90 }),
      ]);
      // Evaluasi global: foundation 3 total (2 approved + 1 draft), unit-1 7 total (6 approved + 1 draft).
      mocked.pKEvaluation.findMany.mockResolvedValue([
        ev('APPROVED', null),
        ev('DRAFT', null),
        ev('APPROVED', null),
        ...Array.from({ length: 6 }, () => ev('APPROVED', 'unit-1')),
        ev('DRAFT', 'unit-1'),
      ]);

      const result = await pkAnalyticsService.getUnitPerformanceDashboard();

      // totalEvaluations tetap menghitung SEMUA evaluasi (foundation 3 + unit-1 7).
      expect(result.totalEvaluations).toBe(10);
      // unit-1: 7 evaluasi total, 6 di antaranya APPROVED.
      expect(result.allUnits[0].evCount).toBe(7);
      expect(result.allUnits[0].approvedEvCount).toBe(6);
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
      mocked.performanceAgreement.findMany.mockResolvedValue([
        pk({ status: 'APPROVED', overallScore: 90, totalScore: 90, behaviorScore: 90 }),
        pk({
          status: 'APPROVED',
          overallScore: 40,
          totalScore: 40,
          behaviorScore: 40,
          user: { unitId: 'unit-2' },
          strategicPlan: { unitId: 'unit-2' },
        }),
      ]);
      mocked.pKEvaluation.findMany.mockResolvedValue([ev('APPROVED', 'unit-2')]);

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
      // unit-1: PK APPROVED, punya 2 evaluasi DRAFT (evCount total = 2,
      // approvedEvCount = 0) → harus KELUAR dari ranking.
      // unit-2: PK APPROVED, punya 1 evaluasi APPROVED → masuk ranking.
      mocked.performanceAgreement.findMany.mockResolvedValue([
        pk({ status: 'APPROVED', overallScore: 90, totalScore: 90, behaviorScore: 90 }),
        pk({
          status: 'APPROVED',
          overallScore: 40,
          totalScore: 40,
          behaviorScore: 40,
          user: { unitId: 'unit-2' },
          strategicPlan: { unitId: 'unit-2' },
        }),
      ]);
      mocked.pKEvaluation.findMany.mockResolvedValue([
        ev('DRAFT', 'unit-1'),
        ev('DRAFT', 'unit-1'),
        ev('APPROVED', 'unit-2'),
      ]);

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

    // REGRESI (bug NON-SEVERE 3): pegawai multi-unit tidak boleh masuk laporan
    // unit asalnya. Seorang guru yang rumah unitnya unit-1 tetapi PK-nya
    // mengimplementasikan RKA unit-2 harus dihitung di unit-2, bukan unit-1.
    it('mengatribusikan PK pegawai multi-unit ke unit rencana yang diimplementasikan', async () => {
      mocked.unit.findMany.mockResolvedValue([
        { id: 'unit-1', name: 'SDIT' },
        { id: 'unit-2', name: 'SMPIT' },
      ]);
      // PK milik user yang unit asalnya unit-1, tetapi mengacu RKA unit-2.
      mocked.performanceAgreement.findMany.mockResolvedValue([
        pk({
          status: 'APPROVED',
          overallScore: 85,
          totalScore: 85,
          behaviorScore: 85,
          user: { unitId: 'unit-1' },
          strategicPlan: { unitId: 'unit-2' },
        }),
      ]);
      mocked.pKEvaluation.findMany.mockResolvedValue([
        ev('APPROVED', 'unit-2'),
        ev('APPROVED', 'unit-2'),
      ]);

      const result = await pkAnalyticsService.getUnitPerformanceDashboard();

      // PK harus dihitung di unit-2, bukan unit asal pegawai (unit-1).
      expect(result.allUnits.find((u) => u.id === 'unit-2')?.totalPksCount).toBe(1);
      expect(result.allUnits.find((u) => u.id === 'unit-1')?.totalPksCount).toBe(0);
      expect(result.allUnits.find((u) => u.id === 'unit-2')?.avgScore).toBe(85);
      // unit-1 tidak punya data → dilaporkan terpisah.
      expect(result.unitsWithoutApprovedPk.map((u) => u.id)).toContain('unit-1');
      // totalAgreements hanya menghitung satu PK.
      expect(result.totalAgreements).toBe(1);
    });
  });
});
