import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGRCStats } from './grc-analytics.service';
import { prisma } from '../../lib/prisma';

vi.mock('../pengawasan/pengawasan.service', () => ({
  pengawasanService: {
    suggestAuditSchedules: vi.fn().mockResolvedValue([]),
  },
}));

// Mock Prisma Client Enums
vi.mock('@prisma/client', () => ({
  RiskLevel: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    EXTREME: 'EXTREME',
  },
  PlanStatus: {
    PROPOSED: 'PROPOSED',
    APPROVED: 'APPROVED',
    IN_PROGRESS: 'IN_PROGRESS',
  },
  ComplianceStatus: {
    COMPLIANT: 'COMPLIANT',
    PARTIALLY: 'PARTIALLY',
    NON_COMPLIANT: 'NON_COMPLIANT',
    UNDER_REVIEW: 'UNDER_REVIEW',
    NOT_APPLICABLE: 'NOT_APPLICABLE',
  },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    strategicPlan: { findMany: vi.fn() },
    risk: { findMany: vi.fn() },
    auditFinding: { count: vi.fn() },
    shariaCompliance: { findMany: vi.fn() },
  },
}));

describe('GRCAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should aggregate GRC metrics correctly', async () => {
    (prisma.strategicPlan.findMany as any).mockResolvedValue([{ progress: 50 }, { progress: 100 }]);
    (prisma.risk.findMany as any).mockResolvedValue([
      { riskLevel: 'HIGH' },
      { riskLevel: 'EXTREME' },
      { riskLevel: 'LOW' },
    ]);
    // NOTE: auditFinding.count is called twice in Promise.all (in order):
    //   1st call → total findings count (no follow-up filter)
    //   2nd call → resolved findings count (with verified follow-up filter)
    // If the Promise.all order changes in grc-analytics.service.ts, update these mocks.
    (prisma.auditFinding.count as any)
      .mockResolvedValueOnce(10) // 1st call: total findings
      .mockResolvedValueOnce(4); // 2nd call: findings with verified follow-ups
    (prisma.shariaCompliance.findMany as any).mockResolvedValue([
      { score: 90, status: 'COMPLIANT', category: 'MUAMALAH' },
      { score: 70, status: 'PARTIALLY', category: 'IBADAH' },
    ]);

    const stats = await getGRCStats();

    expect(stats.plans.activeCount).toBe(2);
    expect(stats.plans.averageProgress).toBe(75);
    expect(stats.risks.total).toBe(3);
    expect(stats.risks.criticalCount).toBe(2);
    expect(stats.risks.byLevel).toEqual({ LOW: 1, MEDIUM: 0, HIGH: 1, EXTREME: 1 });
    expect(stats.audits.totalFindings).toBe(10);
    expect(stats.audits.resolvedCount).toBe(4);
    expect(stats.audits.unresolvedCount).toBe(6);
    expect(stats.audits.resolutionRate).toBe(40);
    expect(stats.sharia.complianceRate).toBe(80);
    expect(stats.sharia.statusDistribution.COMPLIANT).toBe(1);
    expect(stats.sharia.statusDistribution.PARTIALLY).toBe(1);

    // Verify byCategory breakdown
    expect(stats.sharia.summary.byCategory.MUAMALAH).toEqual({ total: 1, averageScore: 90 });
    expect(stats.sharia.summary.byCategory.IBADAH).toEqual({ total: 1, averageScore: 70 });
    expect(stats.sharia.summary.byCategory.TARBIYAH).toEqual({ total: 0, averageScore: 0 });
  });

  it('should handle null sharia scores without deflating compliance rate', async () => {
    (prisma.strategicPlan.findMany as any).mockResolvedValue([]);
    (prisma.risk.findMany as any).mockResolvedValue([]);
    (prisma.auditFinding.count as any).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    (prisma.shariaCompliance.findMany as any).mockResolvedValue([
      { score: 90, status: 'COMPLIANT', category: 'MUAMALAH' },
      { score: null, status: 'UNDER_REVIEW', category: 'MUAMALAH' },
      { score: null, status: 'NOT_APPLICABLE', category: 'GOVERNANCE' },
    ]);

    const stats = await getGRCStats();

    // Only the scored record (90) should count; null scores should be excluded
    expect(stats.sharia.complianceRate).toBe(90);
    expect(stats.sharia.statusDistribution.COMPLIANT).toBe(1);
    expect(stats.sharia.statusDistribution.UNDER_REVIEW).toBe(1);
    expect(stats.sharia.statusDistribution.NOT_APPLICABLE).toBe(1);

    // byCategory should also exclude null scores from averages
    expect(stats.sharia.summary.byCategory.MUAMALAH).toEqual({ total: 2, averageScore: 90 });
    expect(stats.sharia.summary.byCategory.GOVERNANCE).toEqual({ total: 1, averageScore: 0 });
  });

  it('should return 100% resolution rate when there are zero findings', async () => {
    (prisma.strategicPlan.findMany as any).mockResolvedValue([]);
    (prisma.risk.findMany as any).mockResolvedValue([]);
    (prisma.auditFinding.count as any).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    (prisma.shariaCompliance.findMany as any).mockResolvedValue([]);

    const stats = await getGRCStats();

    expect(stats.audits.totalFindings).toBe(0);
    expect(stats.audits.resolutionRate).toBe(100);
    expect(stats.audits.unresolvedCount).toBe(0);
    expect(stats.audits.resolvedCount).toBe(0);
  });
});
