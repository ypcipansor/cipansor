import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pkAnalyticsService } from '@/modules/performance-management/analytics.service';
import { pkService } from '@/modules/performance-management/pk.service';
import { evaluationService } from '@/modules/performance-management/evaluation.service';
import { prisma } from '@/lib/prisma';
import { PlanStatus, RoleCode } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((callback) => callback(prisma)),
    user: {
      findMany: vi.fn(),
    },
    pKEvaluation: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    performanceAgreement: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    pKIndicator: {
      update: vi.fn(),
    },
    pKIndicatorEvaluation: {
      createMany: vi.fn(),
    },
    pKBehaviorEvaluation: {
      createMany: vi.fn(),
    },
    behavioralValue: {
      findMany: vi.fn(),
    },
    talentProfile: {
      findUnique: vi.fn(),
    },
    unit: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    strategicPlan: {
      findFirst: vi.fn(),
    },
  },
}));

describe('Performance Management Analytics & Supervisor Allowlist Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should query eligible supervisors excluding students, parents, alumni, and komite', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'user-sup1',
        name: 'Ahmad Guru',
        unit: { id: 'u-1', name: 'SD IT' },
        userRoles: [{ role: { code: 'SDIT_KEPALA_SEKOLAH' } }],
      },
    ] as any);

    const supervisors = await pkService.getSupervisors();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          userRoles: expect.objectContaining({
            some: expect.objectContaining({
              isActive: true,
              role: expect.objectContaining({
                code: expect.objectContaining({
                  in: expect.arrayContaining(['SUPER_ADMIN', 'SDIT_KEPALA_SEKOLAH', 'SDIT_GURU']),
                }),
              }),
            }),
          }),
        }),
      })
    );
    expect(supervisors).toHaveLength(1);
    expect(supervisors[0].name).toBe('Ahmad Guru');
    // Tanpa id pemanggil tidak ada peran untuk dijadikan dasar saran, jadi
    // tidak ada satu pun baris yang boleh ditandai "disarankan".
    expect(supervisors[0].suggested).toBe(false);
    expect(supervisors[0].roleCodes).toEqual(['SDIT_KEPALA_SEKOLAH']);
  });

  it('should aggregate unit performance dashboard metrics correctly', async () => {
    vi.mocked(prisma.unit.findMany).mockResolvedValue([{ id: 'unit-1', name: 'SD IT' }] as any);
    // Global: satu query PK mengembalikan unit-1 (dua PK disetujui).
    vi.mocked(prisma.performanceAgreement.findMany).mockResolvedValue([
      {
        status: PlanStatus.APPROVED,
        overallScore: 87,
        totalScore: 85,
        behaviorScore: 90,
        user: { unitId: 'unit-1' },
        strategicPlan: { unitId: 'unit-1' },
      },
      {
        status: PlanStatus.APPROVED,
        overallScore: 91,
        totalScore: 95,
        behaviorScore: 85,
        user: { unitId: 'unit-1' },
        strategicPlan: { unitId: 'unit-1' },
      },
    ] as any);
    // Evaluasi global: dua evaluasi APPROVED untuk unit-1.
    vi.mocked(prisma.pKEvaluation.findMany).mockResolvedValue([
      {
        status: PlanStatus.APPROVED,
        pk: { user: { unitId: 'unit-1' }, strategicPlan: { unitId: 'unit-1' } },
      },
      {
        status: PlanStatus.APPROVED,
        pk: { user: { unitId: 'unit-1' }, strategicPlan: { unitId: 'unit-1' } },
      },
    ] as any);

    const dashboard = await pkAnalyticsService.getUnitPerformanceDashboard();

    expect(dashboard.totalAgreements).toBe(2);
    expect(dashboard.approvedAgreements).toBe(2);
    expect(dashboard.totalEvaluations).toBe(2);
    expect(dashboard.avgPerformanceScore).toBe(90);
    expect(dashboard.avgBehaviorScore).toBe(87.5);
  });

  it('should scope unit drilldown to the specified unit', async () => {
    vi.mocked(prisma.unit.findUnique).mockResolvedValue({ id: 'unit-1', name: 'SD IT' } as any);
    vi.mocked(prisma.strategicPlan.findFirst).mockResolvedValue({
      id: 'sp-1',
      title: 'RKA SD IT',
      progress: 75,
    } as any);
    vi.mocked(prisma.performanceAgreement.findMany).mockResolvedValue([
      {
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: null,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-12-31'),
        status: PlanStatus.APPROVED,
        totalScore: 88,
        behaviorScore: 88,
        overallScore: 88,
        user: { id: 'u-1', name: 'Guru SD', unitId: 'unit-1' },
        supervisor: null,
        indicators: [],
        strategicPlan: { unitId: 'unit-1' },
      },
    ] as any);

    const drilldown = await pkAnalyticsService.getUnitDrilldown('unit-1');

    expect(drilldown.unit?.name).toBe('SD IT');
    expect(drilldown.strategicPlan?.title).toBe('RKA SD IT');
    expect(drilldown.agreements).toHaveLength(1);
  });

  it('should generate consolidated report including foundation evaluations when global', async () => {
    vi.mocked(prisma.unit.findMany).mockResolvedValue([{ id: 'unit-1', name: 'SD IT' }] as any);
    // Laporan global: satu query PK dan satu query evaluasi mengembalikan
    // unit-1 DAN foundation (yayasan); keduanya dikelompokkan di JS.
    vi.mocked(prisma.performanceAgreement.findMany).mockResolvedValue([
      {
        status: PlanStatus.APPROVED,
        user: { unitId: 'unit-1' },
        strategicPlan: { unitId: 'unit-1' },
      },
      { status: PlanStatus.APPROVED, user: { unitId: null }, strategicPlan: { unitId: null } },
    ] as any);
    vi.mocked(prisma.pKEvaluation.findMany).mockResolvedValue([
      {
        overallScore: 90,
        performanceScore: 92,
        behaviorScore: 87,
        pk: { user: { unitId: 'unit-1' }, strategicPlan: { unitId: 'unit-1' } },
      },
      {
        overallScore: 80,
        performanceScore: 85,
        behaviorScore: 72,
        pk: { user: { unitId: null }, strategicPlan: { unitId: null } },
      },
    ] as any);

    const report = await pkAnalyticsService.getConsolidatedReport({ year: 2026, month: 5 });

    expect(report.units).toHaveLength(2); // Yayasan (Pusat) + unit-1
    expect(report.units[0].name).toContain('Yayasan');
    expect(report.units[0].avgOverallScore).toBe(80);
    expect(report.units[1].name).toBe('SD IT');
    expect(report.units[1].avgOverallScore).toBe(90);
  });

  it('should filter consolidated report by unitId when requested', async () => {
    vi.mocked(prisma.unit.findMany).mockResolvedValue([{ id: 'unit-1', name: 'SD IT' }] as any);
    vi.mocked(prisma.performanceAgreement.findMany).mockResolvedValue([
      {
        status: PlanStatus.APPROVED,
        user: { unitId: 'unit-1' },
        strategicPlan: { unitId: 'unit-1' },
      },
    ] as any);
    vi.mocked(prisma.pKEvaluation.findMany).mockResolvedValue([
      {
        overallScore: 95,
        performanceScore: 96,
        behaviorScore: 93.5,
        pk: { user: { unitId: 'unit-1' }, strategicPlan: { unitId: 'unit-1' } },
      },
    ] as any);

    const report = await pkAnalyticsService.getConsolidatedReport({ year: 2026, unitId: 'unit-1' });

    expect(report.units).toHaveLength(1);
    expect(report.units[0].id).toBe('unit-1');
    expect(report.units[0].avgOverallScore).toBe(95);
  });
});
