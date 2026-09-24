import { prisma } from '@/lib/prisma';
import {
  Risk,
  RiskMitigation,
  RiskLikelihood,
  RiskImpact,
  RiskLevel,
  Prisma,
} from '@prisma/client';
import { Errors } from '@/middleware/error';

type TransactionClient = Prisma.TransactionClient;

export class RiskService {
  async createRisk(data: Prisma.RiskCreateInput): Promise<Risk> {
    const riskScore = this.calculateRiskScore(data.likelihood, data.impact);
    const riskLevel = this.determineRiskLevel(riskScore);

    const risk = await prisma.risk.create({
      data: {
        ...data,
        riskScore,
        riskLevel,
      },
    });

    // Auto-link to strategic plan if objective is provided
    // This is handled by Prisma via data.strategicPlan connection if provided in the DTO

    // If EXTREME risk, fan out audit-team notifications and create automated findings.
    // Fire-and-forget so the request response isn't blocked by N notification inserts;
    // failures are already swallowed inside `handleExtremeRisk`.
    if (riskLevel === 'EXTREME') {
      void this.handleExtremeRisk(risk);
    }

    return risk;
  }

  private async handleExtremeRisk(risk: Risk) {
    try {
      // Find audit team members to notify and assign
      const auditAdmins = await prisma.user.findMany({
        where: {
          isActive: true,
          userRoles: {
            some: {
              role: {
                code: { in: ['YAYASAN_PENGAWAS', 'SUPER_ADMIN'] },
              },
            },
          },
        },
        select: { id: true },
      });

      // 1. Create an automated Internal Audit record for this extreme risk
      // Picking the first available auditor as the lead for the draft
      const leadAuditorId = auditAdmins[0]?.id;

      if (leadAuditorId) {
        const audit = await prisma.internalAudit.create({
          data: {
            unitId: risk.unitId,
            title: `Audit Respon Risiko Ekstrim: ${risk.code}`,
            description: `Audit otomatis yang dipicu oleh deteksi risiko level EKSTRIM. Risiko: ${risk.description}`,
            auditType: 'RISK_BASED',
            status: 'PLANNED',
            plannedDate: new Date(),
            leadAuditorId: leadAuditorId,
            riskId: risk.id,
          },
        });

        // 2. Create an automated Finding under this audit
        await prisma.auditFinding.create({
          data: {
            auditId: audit.id,
            findingNumber: `AUTO-${risk.code}-${Date.now().toString().slice(-4)}`,
            title: `Temuan Otomatis: Level Risiko Mencapai Batas Ekstrim`,
            description: `Sistem secara otomatis mencatat temuan ini karena risiko ${risk.code} telah mencapai level EKSTRIM (Skor: ${risk.riskScore}). Diperlukan peninjauan mendalam terhadap efektivitas kontrol dan rencana mitigasi yang ada.`,
            severity: 'CRITICAL',
            category: 'RISK_MANAGEMENT',
            riskId: risk.id,
          },
        });
      }

      // 3. Create notifications for the internal audit team
      const results = await Promise.allSettled(
        auditAdmins.map((admin) =>
          prisma.notification.create({
            data: {
              userId: admin.id,
              type: 'ALERT',
              title: 'Risiko Ekstrim Terdeteksi',
              message: `Risiko ${risk.code} mencapai level EKSTRIM. Audit otomatis telah dibuat.`,
              link: `/risk-management/${risk.id}`,
              status: 'UNREAD',
            },
          })
        )
      );

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        console.error(
          `[Risk] ${failures.length}/${results.length} EXTREME-risk audit notifications failed for risk ${risk.code}`,
          failures.map((f) => (f as PromiseRejectedResult).reason)
        );
      }
    } catch (err) {
      console.error('[Risk] Failed to handle extreme risk escalation:', err);
    }
  }

  async getRisks(
    unitId: string,
    query: { category?: any; riskLevel?: any; strategicPlanId?: string }
  ): Promise<Risk[]> {
    const where: Prisma.RiskWhereInput = {
      unitId,
    };

    if (query.category) where.category = query.category;
    if (query.riskLevel) where.riskLevel = query.riskLevel;
    if (query.strategicPlanId) where.strategicPlanId = query.strategicPlanId;

    return prisma.risk.findMany({
      where,
      include: {
        mitigations: true,
        createdBy: {
          select: { id: true, name: true },
        },
        strategicPlan: {
          select: { id: true, title: true },
        },
        auditFindings: {
          select: { id: true, severity: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRiskById(id: string): Promise<Risk | null> {
    return prisma.risk.findUnique({
      where: { id },
      include: {
        mitigations: {
          include: {
            pic: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        createdBy: {
          select: { id: true, name: true },
        },
        strategicPlan: {
          select: { id: true, title: true },
        },
        auditFindings: {
          select: { id: true, findingNumber: true, title: true, severity: true, auditId: true },
        },
      },
    });
  }

  async updateRisk(
    id: string,
    data: Prisma.RiskUpdateInput,
    externalTx?: TransactionClient
  ): Promise<Risk> {
    const perform = async (tx: TransactionClient) => {
      // Read current risk inside the transaction to prevent stale-read race
      // conditions when concurrent updates change likelihood/impact between
      // the read and the write.
      const current = await tx.risk.findUnique({ where: { id } });
      if (!current) throw Errors.notFound('Risk');

      // Use current values if not provided in update
      const likelihood = (data.likelihood as RiskLikelihood) || current.likelihood;
      const impact = (data.impact as RiskImpact) || current.impact;

      const riskScore = this.calculateRiskScore(likelihood, impact);
      const riskLevel = this.determineRiskLevel(riskScore);

      const updatedRisk = await tx.risk.update({
        where: { id },
        data: {
          ...data,
          riskScore,
          riskLevel,
        },
      });

      // If risk escalated to EXTREME from a lower level, trigger the audit response
      if (updatedRisk.riskLevel === 'EXTREME' && current.riskLevel !== 'EXTREME') {
        // We use setImmediate/void to keep it out of the critical path of the update transaction
        // but still trigger the automation.
        void this.handleExtremeRisk(updatedRisk);
      }

      // Recalculate residual risk when inherent likelihood/impact changes
      await this.recalculateResidualRisk(id, tx);

      // Re-fetch to include the freshly-calculated residual risk fields
      const freshRisk = await tx.risk.findUniqueOrThrow({
        where: { id },
        include: {
          mitigations: true,
          createdBy: {
            select: { id: true, name: true },
          },
          strategicPlan: {
            select: { id: true, title: true },
          },
        },
      });
      return freshRisk;
    };

    // If an external transaction client is provided, run within it;
    // otherwise create our own transaction.
    if (externalTx) {
      return perform(externalTx);
    }
    return prisma.$transaction(async (tx) => perform(tx));
  }

  async deleteRisk(id: string): Promise<Risk> {
    return prisma.risk.delete({ where: { id } });
  }

  async createMitigation(data: Prisma.RiskMitigationCreateInput): Promise<RiskMitigation> {
    return prisma.$transaction(async (tx) => {
      const mitigation = await tx.riskMitigation.create({
        data,
      });

      // After creating mitigation, recalculate residual risk
      await this.recalculateResidualRisk(mitigation.riskId, tx);

      return mitigation;
    });
  }

  async getMitigationById(id: string): Promise<(RiskMitigation & { risk: Risk }) | null> {
    return prisma.riskMitigation.findUnique({
      where: { id },
      include: { risk: true },
    });
  }

  async updateMitigation(
    id: string,
    data: Prisma.RiskMitigationUpdateInput
  ): Promise<RiskMitigation> {
    return prisma.$transaction(async (tx) => {
      const mitigation = await tx.riskMitigation.update({
        where: { id },
        data,
      });

      // After updating mitigation, recalculate residual risk
      await this.recalculateResidualRisk(mitigation.riskId, tx);

      return mitigation;
    });
  }

  async deleteMitigation(id: string): Promise<RiskMitigation> {
    return prisma.$transaction(async (tx) => {
      const mitigation = await tx.riskMitigation.delete({ where: { id } });

      // After deleting mitigation, recalculate residual risk
      await this.recalculateResidualRisk(mitigation.riskId, tx);

      return mitigation;
    });
  }

  // Helpers
  private async recalculateResidualRisk(
    riskId: string,
    tx: TransactionClient | typeof prisma = prisma
  ): Promise<void> {
    const risk = await tx.risk.findUnique({
      where: { id: riskId },
      include: { mitigations: true },
    });

    if (!risk) return;

    // If no mitigations exist, clear residual fields (null = no assessment performed)
    if (risk.mitigations.length === 0) {
      await tx.risk.update({
        where: { id: riskId },
        data: {
          residualLikelihood: null,
          residualImpact: null,
          residualScore: null,
          residualLevel: null,
        },
      });
      return;
    }

    // Logic: Mitigation progress reduces likelihood and impact
    // Avg progress of all mitigations
    const avgProgress =
      risk.mitigations.reduce((sum, m) => sum + (m.progress || 0), 0) / risk.mitigations.length;

    // Reduction factor: 0% progress = 1.0, 100% progress = 0.4 (capped reduction)
    const factor = 1 - (avgProgress / 100) * 0.6;

    const lVal = this.getEnumWeight(risk.likelihood);
    const iVal = this.getEnumWeight(risk.impact);

    const residualLVal = Math.max(1, Math.round(lVal * factor));
    const residualIVal = Math.max(1, Math.round(iVal * factor));

    const residualLikelihood = this.getWeightToLikelihood(residualLVal);
    const residualImpact = this.getWeightToImpact(residualIVal);
    const residualScore = residualLVal * residualIVal;
    const residualLevel = this.determineRiskLevel(residualScore);

    await tx.risk.update({
      where: { id: riskId },
      data: {
        residualLikelihood,
        residualImpact,
        residualScore,
        residualLevel,
      },
    });
  }

  // Shared enum-to-numeric mapping used by both calculateRiskScore and
  // recalculateResidualRisk. Likelihood and Impact enums are combined in a
  // single map because their string values don't overlap.
  private getEnumWeight(val: string): number {
    const map: Record<string, number> = {
      RARE: 1,
      INSIGNIFICANT: 1,
      UNLIKELY: 2,
      MINOR: 2,
      POSSIBLE: 3,
      MODERATE: 3,
      LIKELY: 4,
      MAJOR: 4,
      ALMOST_CERTAIN: 5,
      CATASTROPHIC: 5,
    };
    return map[val] || 1;
  }

  private getWeightToLikelihood(w: number): RiskLikelihood {
    const map: Record<number, RiskLikelihood> = {
      1: 'RARE',
      2: 'UNLIKELY',
      3: 'POSSIBLE',
      4: 'LIKELY',
      5: 'ALMOST_CERTAIN',
    };
    return map[w] || 'RARE';
  }

  private getWeightToImpact(w: number): RiskImpact {
    const map: Record<number, RiskImpact> = {
      1: 'INSIGNIFICANT',
      2: 'MINOR',
      3: 'MODERATE',
      4: 'MAJOR',
      5: 'CATASTROPHIC',
    };
    return map[w] || 'INSIGNIFICANT';
  }

  private calculateRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    // Delegates to getEnumWeight which holds the single source of truth for
    // enum-to-numeric mappings. String casting prevents Vitest mocking issues
    // with Prisma Enums while maintaining strong typings for method parameters.
    const l = this.getEnumWeight(likelihood as string);
    const i = this.getEnumWeight(impact as string);

    return l * i;
  }

  private determineRiskLevel(score: number): RiskLevel {
    // Using string casting to 'RiskLevel' to satisfy Prisma types in production
    // without triggering enum initialization crashes in vitest mocks.
    if (score >= 20) return 'EXTREME' as RiskLevel; // 20, 25
    if (score >= 10) return 'HIGH' as RiskLevel; // 10, 12, 15, 16
    if (score >= 5) return 'MEDIUM' as RiskLevel; // 5, 6, 8, 9
    return 'LOW' as RiskLevel; // 1, 2, 3, 4
  }
}

export const riskService = new RiskService();
