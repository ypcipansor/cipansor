import { prisma } from '../../lib/prisma';
import { RiskLevel, PlanStatus, ComplianceStatus } from '@prisma/client';
import { SHARIA_CATEGORIES } from '@cipansor/shared';
import { pengawasanService } from '../pengawasan/pengawasan.service';

export interface GRCStats {
  plans: {
    activeCount: number;
    averageProgress: number;
  };
  risks: {
    total: number;
    byLevel: Record<RiskLevel, number>;
    criticalCount: number;
  };
  audits: {
    totalFindings: number;
    unresolvedCount: number;
    resolvedCount: number;
    resolutionRate: number;
  };
  sharia: {
    complianceRate: number;
    statusDistribution: Record<ComplianceStatus, number>;
    summary: {
      byCategory: Record<string, { total: number; averageScore: number }>;
    };
  };
  orgHealthScore: number;
  auditSuggestions?: {
    riskId: string;
    riskCode: string;
    riskLevel: string;
    suggestedTitle: string;
    suggestedDescription: string;
    strategicPlanId?: string | null;
    strategicPlanTitle?: string;
    priority: string;
  }[];
}

export async function getGRCStats(unitId?: string): Promise<GRCStats> {
  const whereClause = unitId ? { unitId } : {};

  const [plans, risks, findings, resolvedFindings, compliances, auditSuggestions] =
    await Promise.all([
      // 1. Strategic Plans
      prisma.strategicPlan.findMany({
        where: {
          ...whereClause,
          status: { in: [PlanStatus.PROPOSED, PlanStatus.APPROVED, PlanStatus.IN_PROGRESS] as any },
        },
        select: { progress: true },
      }),

      // 2. Risks
      prisma.risk.findMany({
        where: {
          ...whereClause,
          status: 'OPEN',
        },
        select: { riskLevel: true },
      }),

      // 3. Audit Findings & Resolved Findings
      prisma.auditFinding.count({
        where: {
          ...(unitId ? { audit: { unitId } } : {}),
        } as any,
      }),
      prisma.auditFinding.count({
        where: {
          ...(unitId ? { audit: { unitId } } : {}),
          followUps: { some: { status: 'VERIFIED' } },
        } as any,
      }),

      // 4. Sharia Compliance
      prisma.shariaCompliance.findMany({
        where: whereClause,
        select: { score: true, status: true, category: true },
      }),

      // 5. Audit Suggestions
      pengawasanService.suggestAuditSchedules(unitId).catch((err) => {
        console.error(
          '[GRC] suggestAuditSchedules failed, returning empty suggestions:',
          err?.message || err
        );
        return [];
      }),
    ]);

  // Plans Processing
  const activePlansCount = plans.length;
  const avgProgress =
    activePlansCount > 0
      ? plans.reduce((sum, p) => sum + (p.progress || 0), 0) / activePlansCount
      : 0;

  // Risks Processing
  const riskDistribution: Record<RiskLevel, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    EXTREME: 0,
  } as any;
  risks.forEach((r) => {
    if (riskDistribution[r.riskLevel as RiskLevel] !== undefined) {
      riskDistribution[r.riskLevel as RiskLevel]++;
    }
  });
  const criticalRisks = (riskDistribution.HIGH || 0) + (riskDistribution.EXTREME || 0);

  // Sharia Processing
  const shariaStatusDist: Record<ComplianceStatus, number> = {
    COMPLIANT: 0,
    PARTIALLY: 0,
    NON_COMPLIANT: 0,
    UNDER_REVIEW: 0,
    NOT_APPLICABLE: 0,
  } as any;
  let totalScore = 0;
  let scoredCount = 0;
  compliances.forEach((c) => {
    if (shariaStatusDist[c.status as ComplianceStatus] !== undefined) {
      shariaStatusDist[c.status as ComplianceStatus]++;
    }
    if (c.score != null) {
      totalScore += c.score;
      scoredCount++;
    }
  });
  const avgShariaScore = scoredCount > 0 ? totalScore / scoredCount : 0;

  const byCategory: Record<string, { total: number; averageScore: number }> = {};
  for (const cat of SHARIA_CATEGORIES) {
    const items = compliances.filter((c) => c.category === cat);
    const scoredItems = items.filter((i) => i.score != null);
    byCategory[cat] = {
      total: items.length,
      averageScore:
        scoredItems.length > 0
          ? Math.round(
              (scoredItems.reduce((s, i) => s + (i.score || 0), 0) / scoredItems.length) * 100
            ) / 100
          : 0,
    };
  }

  // Calculate Organizational Health Score
  // Weighted: 40% Compliance Rate, 30% Risk Level (Inverse), 30% Audit Resolution Rate
  const riskWeightedScore = Math.max(
    0,
    100 -
      ((riskDistribution.EXTREME || 0) * 25 +
        (riskDistribution.HIGH || 0) * 15 +
        (riskDistribution.MEDIUM || 0) * 5)
  );

  const resolutionRate = findings > 0 ? (resolvedFindings / findings) * 100 : 100;
  const orgHealthScore = Math.round(
    avgShariaScore * 0.4 + riskWeightedScore * 0.3 + resolutionRate * 0.3
  );

  return {
    plans: {
      activeCount: activePlansCount,
      averageProgress: Math.round(avgProgress * 100) / 100,
    },
    risks: {
      total: risks.length,
      byLevel: riskDistribution,
      criticalCount: criticalRisks,
    },
    audits: {
      totalFindings: findings,
      resolvedCount: Math.min(resolvedFindings, findings),
      unresolvedCount: Math.max(0, findings - resolvedFindings),
      resolutionRate:
        findings > 0 ? Math.min(100, Math.round((resolvedFindings / findings) * 10000) / 100) : 100,
    },
    sharia: {
      complianceRate: Math.round(avgShariaScore * 100) / 100,
      statusDistribution: shariaStatusDist,
      summary: {
        byCategory,
      },
    },
    orgHealthScore,
    auditSuggestions,
  };
}

// ===== Risk matrix (5x5 heatmap data) =====

const LIKELIHOOD_ORDER = ['RARE', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN'] as const;
const IMPACT_ORDER = ['INSIGNIFICANT', 'MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC'] as const;

/**
 * Inherent vs residual 5x5 risk matrices (counts per likelihood x impact
 * cell) for the GRC dashboard heatmap.
 */
export async function getRiskMatrix(unitId?: string) {
  const where = unitId ? { unitId } : {};

  const [inherent, residual] = await Promise.all([
    prisma.risk.groupBy({
      by: ['likelihood', 'impact'],
      where,
      _count: true,
    }),
    prisma.risk.groupBy({
      by: ['residualLikelihood', 'residualImpact'],
      where: { ...where, residualLikelihood: { not: null }, residualImpact: { not: null } },
      _count: true,
    }),
  ]);

  const emptyMatrix = () => LIKELIHOOD_ORDER.map(() => IMPACT_ORDER.map(() => 0));

  const inherentMatrix = emptyMatrix();
  for (const row of inherent) {
    const li = LIKELIHOOD_ORDER.indexOf(row.likelihood as (typeof LIKELIHOOD_ORDER)[number]);
    const im = IMPACT_ORDER.indexOf(row.impact as (typeof IMPACT_ORDER)[number]);
    if (li >= 0 && im >= 0) inherentMatrix[li][im] = Number(row._count);
  }

  const residualMatrix = emptyMatrix();
  for (const row of residual) {
    const li = LIKELIHOOD_ORDER.indexOf(
      row.residualLikelihood as (typeof LIKELIHOOD_ORDER)[number]
    );
    const im = IMPACT_ORDER.indexOf(row.residualImpact as (typeof IMPACT_ORDER)[number]);
    if (li >= 0 && im >= 0) residualMatrix[li][im] = Number(row._count);
  }

  return {
    likelihoodLabels: [...LIKELIHOOD_ORDER],
    impactLabels: [...IMPACT_ORDER],
    inherent: inherentMatrix,
    residual: residualMatrix,
  };
}
