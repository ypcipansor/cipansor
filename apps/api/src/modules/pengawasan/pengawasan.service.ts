import { prisma } from '@/lib/prisma';
import { Prisma, RoleCode } from '@prisma/client';
import { Errors } from '@/middleware/error';
import type { DraftPeriodicReportInput } from '@cipansor/shared';
import { perencanaanService } from '../perencanaan/perencanaan.service';
import { CorrespondenceService } from '../correspondence/correspondence.service';
import { riskService } from '../risk/risk.service';

export class PengawasanService {
  // ==================== AUDITS ====================

  async createAudit(data: {
    title: string;
    description?: string;
    auditType: string;
    plannedDate: string;
    scope?: string;
    methodology?: string;
    unitId: string;
    leadAuditorId: string;
    strategicPlanId?: string;
    riskId?: string;
  }) {
    return prisma.internalAudit.create({
      data: {
        title: data.title,
        description: data.description,
        auditType: data.auditType,
        plannedDate: new Date(data.plannedDate),
        scope: data.scope,
        methodology: data.methodology,
        unit: { connect: { id: data.unitId } },
        leadAuditor: { connect: { id: data.leadAuditorId } },
        strategicPlan: data.strategicPlanId ? { connect: { id: data.strategicPlanId } } : undefined,
        risk: data.riskId ? { connect: { id: data.riskId } } : undefined,
      },
      include: {
        unit: { select: { id: true, name: true } },
        leadAuditor: { select: { id: true, name: true } },
        strategicPlan: { select: { id: true, title: true } },
        risk: { select: { id: true, code: true, category: true } },
        findings: true,
      },
    });
  }

  async getAudits(
    unitId: string | undefined,
    query: { status?: string; auditType?: string; strategicPlanId?: string; riskId?: string }
  ) {
    const where: Prisma.InternalAuditWhereInput = unitId ? { unitId } : {};
    if (query.status) where.status = query.status as any;
    if (query.auditType) where.auditType = query.auditType;
    if (query.strategicPlanId) where.strategicPlanId = query.strategicPlanId;
    if (query.riskId) where.riskId = query.riskId;

    return prisma.internalAudit.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        leadAuditor: { select: { id: true, name: true } },
        strategicPlan: { select: { id: true, title: true } },
        risk: { select: { id: true, code: true, category: true } },
        findings: {
          select: { id: true, severity: true, title: true },
        },
      },
      orderBy: { plannedDate: 'desc' },
    });
  }

  async getAuditById(id: string) {
    return prisma.internalAudit.findUnique({
      where: { id },
      include: {
        unit: { select: { id: true, name: true } },
        leadAuditor: { select: { id: true, name: true } },
        strategicPlan: { select: { id: true, title: true } },
        risk: { select: { id: true, code: true, category: true, riskLevel: true } },
        findings: {
          include: {
            responsible: { select: { id: true, name: true } },
            planObjective: { select: { id: true, title: true } },
            followUps: {
              include: {
                verifiedBy: { select: { id: true, name: true } },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async updateAudit(id: string, data: Prisma.InternalAuditUpdateInput) {
    return prisma.internalAudit.update({
      where: { id },
      data,
      include: {
        unit: { select: { id: true, name: true } },
        leadAuditor: { select: { id: true, name: true } },
      },
    });
  }

  async deleteAudit(id: string) {
    return prisma.internalAudit.delete({ where: { id } });
  }

  // ==================== FINDINGS ====================

  async createFinding(data: {
    auditId: string;
    findingNumber: string;
    title: string;
    description: string;
    severity: 'OBSERVATION' | 'MINOR' | 'MAJOR' | 'CRITICAL';
    category: string;
    evidence?: string;
    rootCause?: string;
    recommendation?: string;
    responsibleId?: string;
    dueDate?: string | null;
    planObjectiveId?: string;
    linkToRiskId?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // Validate the linked risk exists BEFORE creating the finding so we get a
      // friendly 404 instead of a raw Prisma P2025 from the `connect` call.
      // We also read consequence/status here to use in the side-effect below,
      // avoiding a redundant second query.
      let existingRisk: { consequence: string | null; status: string; impact: string } | null =
        null;
      if (data.linkToRiskId) {
        existingRisk = await tx.risk.findUnique({
          where: { id: data.linkToRiskId },
          select: { consequence: true, status: true, impact: true },
        });
        if (!existingRisk) {
          throw Errors.notFound(`Risk with id ${data.linkToRiskId}`);
        }
      }

      const finding = await tx.auditFinding.create({
        data: {
          audit: { connect: { id: data.auditId } },
          findingNumber: data.findingNumber,
          title: data.title,
          description: data.description,
          severity: data.severity,
          category: data.category,
          evidence: data.evidence,
          rootCause: data.rootCause,
          recommendation: data.recommendation,
          responsible: data.responsibleId ? { connect: { id: data.responsibleId } } : undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          planObjective: data.planObjectiveId
            ? { connect: { id: data.planObjectiveId } }
            : undefined,
          risk: data.linkToRiskId ? { connect: { id: data.linkToRiskId } } : undefined,
        },
        include: {
          responsible: { select: { id: true, name: true } },
          planObjective: { select: { id: true, title: true } },
        },
      });

      // If linked to a risk, update risk status and append audit reference to consequence.
      // The linkToRiskId is stored on the finding's riskId FK column so the relationship
      // can be queried directly without fragile text parsing.
      if (data.linkToRiskId && existingRisk) {
        const auditNote = `[Audit Finding ${data.findingNumber}: ${data.title}]`;

        // Guard against duplicate notes if createFinding is called twice with the same data
        const alreadyLinked =
          existingRisk.consequence?.includes(`[Audit Finding ${data.findingNumber}:`) ?? false;

        if (!alreadyLinked) {
          const updatedConsequence = existingRisk.consequence
            ? `${existingRisk.consequence}\n\n${auditNote}`
            : auditNote;

          // Only set to MONITORING if the risk is not already CLOSED
          const newStatus = existingRisk.status === 'CLOSED' ? 'CLOSED' : 'MONITORING';

          // Best Practice: If finding is CRITICAL or MAJOR, escalate risk impact.
          // Delegate to RiskService.updateRisk so riskScore, riskLevel, and
          // residualRisk are all recalculated consistently.
          // Only escalate if the new impact is actually higher than the current one
          // to avoid accidentally downgrading a risk (e.g. CATASTROPHIC → MAJOR).
          const IMPACT_WEIGHTS: Record<string, number> = {
            INSIGNIFICANT: 1,
            MINOR: 2,
            MODERATE: 3,
            MAJOR: 4,
            CATASTROPHIC: 5,
          };

          // Reuse impact from the earlier existingRisk read to avoid an extra query.
          const currentImpactWeight = IMPACT_WEIGHTS[existingRisk.impact] || 0;

          let impactEscalation: { impact: string } | undefined;
          if (data.severity === 'CRITICAL' && currentImpactWeight < 5) {
            impactEscalation = { impact: 'CATASTROPHIC' };
          } else if (data.severity === 'MAJOR' && currentImpactWeight < 4) {
            impactEscalation = { impact: 'MAJOR' };
          }

          if (impactEscalation) {
            // updateRisk recalculates riskScore, riskLevel, and residualRisk.
            // Pass `tx` so the risk update participates in the same transaction.
            await riskService.updateRisk(
              data.linkToRiskId!,
              {
                status: newStatus,
                consequence: updatedConsequence,
                ...impactEscalation,
              } as Prisma.RiskUpdateInput,
              tx
            );
          } else {
            await tx.risk.update({
              where: { id: data.linkToRiskId },
              data: {
                status: newStatus,
                consequence: updatedConsequence,
              },
            });
          }
        }
      }

      // If linked to a strategic objective, update its progress (conservative decrement if critical finding)
      if (data.planObjectiveId && data.severity === 'CRITICAL') {
        const objective = await tx.planObjective.findUnique({
          where: { id: data.planObjectiveId },
          select: { progress: true, planId: true },
        });
        if (objective && objective.progress > 0) {
          await tx.planObjective.update({
            where: { id: data.planObjectiveId },
            data: {
              progress: Math.max(0, objective.progress - 5),
            },
          });

          // Recalculate parent plan's weighted progress to keep it in sync.
          // Uses the canonical PerencanaanService method to avoid formula duplication.
          await perencanaanService.recalculatePlanProgress(objective.planId, tx);
        }
      }

      return finding;
    });
  }

  async updateFinding(id: string, data: any) {
    const { responsibleId, planObjectiveId, ...rest } = data;
    const updateData: any = { ...rest };

    if (responsibleId) updateData.responsible = { connect: { id: responsibleId } };
    else if (responsibleId === null) updateData.responsible = { disconnect: true };

    if (planObjectiveId) updateData.planObjective = { connect: { id: planObjectiveId } };
    else if (planObjectiveId === null) updateData.planObjective = { disconnect: true };

    // Nullable-date contract: `undefined` leaves the value alone, `null`
    // clears it, a string sets it. The old truthy check conflated the first
    // two, so "clear the due date" was a no-op.
    if (rest.dueDate !== undefined) {
      updateData.dueDate = rest.dueDate === null ? null : new Date(rest.dueDate);
    }

    return prisma.auditFinding.update({
      where: { id },
      data: updateData,
      include: {
        responsible: { select: { id: true, name: true } },
        planObjective: { select: { id: true, title: true } },
      },
    });
  }

  async deleteFinding(id: string) {
    return prisma.auditFinding.delete({ where: { id } });
  }

  /**
   * The unit that owns a finding, via its parent audit.
   *
   * Findings and follow-ups carry no unit of their own, so "which unit may
   * write this?" is answered by walking up to the audit. Returning `null` means
   * the finding does not exist; the caller turns that into a 404.
   */
  async getFindingAuditUnitId(id: string): Promise<string | null> {
    const finding = await prisma.auditFinding.findUnique({
      where: { id },
      select: { audit: { select: { unitId: true } } },
    });
    return finding?.audit.unitId ?? null;
  }

  // ==================== FOLLOW-UPS ====================

  async createFollowUp(data: {
    findingId: string;
    action: string;
    dueDate?: string | null;
    evidence?: string;
  }) {
    return prisma.auditFollowUp.create({
      data: {
        finding: { connect: { id: data.findingId } },
        action: data.action,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        evidence: data.evidence,
      },
    });
  }

  async updateFollowUp(id: string, data: any, verifiedById?: string) {
    const updateData: any = { ...data };

    // Same nullable-date contract as findings: `undefined` leaves the value,
    // `null` clears it, a string sets it.
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate === null ? null : new Date(data.dueDate);
    }
    if (data.status === 'VERIFIED' && verifiedById) {
      updateData.verifiedBy = { connect: { id: verifiedById } };
      updateData.verifiedAt = new Date();
    }
    if (data.status === 'RESOLVED') {
      updateData.completedAt = new Date();
    }

    const followUp = await prisma.auditFollowUp.update({
      where: { id },
      data: updateData,
      include: {
        verifiedBy: { select: { id: true, name: true } },
        finding: {
          select: {
            id: true,
            title: true,
            riskId: true,
          },
        },
      },
    });

    // GRC loop: a VERIFIED follow-up on a risk-linked finding means the
    // mitigation is confirmed — prompt the risk admins to reassess the
    // residual rating (we deliberately do NOT auto-mutate risk scores;
    // re-rating is a human assessment).
    if (data.status === 'VERIFIED' && followUp.finding?.riskId) {
      try {
        const risk = await prisma.risk.findUnique({
          where: { id: followUp.finding.riskId },
          select: { id: true, code: true, description: true, unitId: true },
        });
        if (risk) {
          const admins = await prisma.user.findMany({
            where: {
              role: 'UNIT_ADMIN',
              unitId: risk.unitId,
              isActive: true,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (admins.length > 0) {
            await prisma.notification.createMany({
              data: admins.map((admin) => ({
                userId: admin.id,
                type: 'ALERT' as const,
                title: 'Tinjau Ulang Rating Residual Risiko',
                message:
                  'Tindak lanjut temuan "' +
                  followUp.finding!.title +
                  '" telah diverifikasi. Mitigasi risiko ' +
                  risk.code +
                  ' (' +
                  risk.description.slice(0, 60) +
                  ') terkonfirmasi — mohon tinjau ulang rating residual di Risk Register.',
                data: { riskId: risk.id, findingId: followUp.finding!.id },
              })),
            });
          }
        }
      } catch (error) {
        console.error('GRC loop notification failed:', error);
      }
    }

    return followUp;
  }

  async deleteFollowUp(id: string) {
    return prisma.auditFollowUp.delete({ where: { id } });
  }

  /**
   * The unit that owns a follow-up, via finding → audit.
   *
   * Same reasoning as {@link getFindingAuditUnitId}: the unit is not stored on
   * the row, so the association is resolved rather than assumed.
   */
  async getFollowUpAuditUnitId(id: string): Promise<string | null> {
    const followUp = await prisma.auditFollowUp.findUnique({
      where: { id },
      select: { finding: { select: { audit: { select: { unitId: true } } } } },
    });
    return followUp?.finding.audit.unitId ?? null;
  }

  // ==================== SUGGESTION ENGINE ====================

  async suggestAuditSchedules(unitId?: string) {
    // When unitId is omitted, query across all units in a single pair of DB queries
    // instead of fanning out per-unit (which caused up to 40+ queries).
    const unitFilter = unitId ? { unitId } : {};

    // 1. Get high risks from the Risk module
    const highRisks = await prisma.risk.findMany({
      where: {
        ...unitFilter,
        status: 'OPEN',
        riskLevel: { in: ['HIGH', 'EXTREME'] },
      },
      include: {
        strategicPlan: { select: { id: true, title: true } },
      },
    });

    // 1.5. Proactive Oversight: Identify budget utilization over 90%
    const budgets = await prisma.budget.findMany({
      where: {
        ...unitFilter,
        academicYear: { isActive: true },
      },
      include: {
        account: { select: { code: true, name: true } },
        academicYear: { select: { startDate: true, endDate: true } },
      },
    });

    const budgetSuggestions: any[] = [];
    if (budgets.length > 0) {
      // Aggregate actuals for these budgets to check utilization
      const actuals = await prisma.journalEntry.groupBy({
        by: ['accountId', 'unitId'],
        where: {
          accountId: { in: budgets.map((b) => b.accountId) },
          unitId: { in: [...new Set(budgets.map((b) => b.unitId))] },
        },
        _sum: { debit: true, credit: true },
      });

      for (const budget of budgets) {
        const actual = actuals.find(
          (a) => a.accountId === budget.accountId && a.unitId === budget.unitId
        );
        const debit = actual?._sum.debit?.toNumber() || 0;
        const credit = actual?._sum.credit?.toNumber() || 0;

        // Simple utilization check: mostly looking for expense overruns
        // (Debit - Credit) for ASSET/EXPENSE accounts.
        const usage = debit - credit;
        const limit = budget.amount.toNumber();
        const utilization = limit > 0 ? (usage / limit) * 100 : 0;

        if (utilization >= 90) {
          budgetSuggestions.push({
            type: 'BUDGET_OVERRUN',
            unitId: budget.unitId,
            suggestedTitle: `Audit Efisiensi Anggaran: ${budget.account.name}`,
            suggestedDescription: `Penggunaan anggaran untuk akun ${budget.account.code} (${budget.account.name}) telah mencapai ${Math.round(utilization)}%. Diperlukan audit efisiensi untuk mencegah defisit.`,
            priority: utilization >= 100 ? 'URGENT' : 'HIGH',
            metadata: {
              accountId: budget.accountId,
              utilization: Math.round(utilization * 100) / 100,
            },
          });
        }
      }
    }

    if (highRisks.length === 0 && budgetSuggestions.length === 0) return [];

    // 2. Batch-query all non-cancelled audits linked to these risks (avoids N+1)
    const riskIds = highRisks.map((r) => r.id);
    const existingAudits = await prisma.internalAudit.findMany({
      where: {
        ...unitFilter,
        riskId: { in: riskIds },
        status: { not: 'CANCELLED' },
      },
      select: { riskId: true, unitId: true },
    });

    // 3. Build a set of covered (riskId, unitId) pairs so that cross-unit queries
    //    correctly treat each unit independently. A risk in unit A is only "covered"
    //    if unit A itself has a non-cancelled audit for it — an audit in unit B
    //    should not suppress the suggestion for unit A.
    const coveredKeys = new Set(existingAudits.map((a) => `${a.riskId}::${a.unitId}`));

    // 4. Suggest audits for risks that don't have a linked internal audit
    //    in their own unit yet.
    const riskSuggestions = highRisks
      .filter((risk) => !coveredKeys.has(`${risk.id}::${risk.unitId}`))
      .map((risk) => ({
        type: 'RISK_BASED',
        riskId: risk.id,
        riskCode: risk.code,
        riskLevel: risk.riskLevel,
        suggestedTitle: `Audit Kepatuhan & Mitigasi: ${risk.code}`,
        suggestedDescription: `Audit internal khusus untuk memverifikasi efektivitas mitigasi risiko: ${risk.description}`,
        strategicPlanId: risk.strategicPlanId,
        strategicPlanTitle: risk.strategicPlan?.title,
        priority: risk.riskLevel === 'EXTREME' ? 'URGENT' : 'HIGH',
      }));

    return [...riskSuggestions, ...budgetSuggestions].sort((a, b) => {
      const priorityMap: Record<string, number> = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
      return (priorityMap[b.priority] || 0) - (priorityMap[a.priority] || 0);
    });
  }

  // ==================== FINANCIAL ARREARS & OVERSIGHT ====================

  async getFinancialArrears(unitId?: string) {
    const now = new Date();

    // Arrears are aggregated in the database, not by loading every unpaid
    // invoice and its relations into Node. The old form fetched the whole
    // outstanding book — a yayasan-wide unpaid-invoice set is large and grows
    // without bound — joined student, user, unit and payment type for each row,
    // then summed in a loop. Only three things are ever needed: the totals, the
    // per-unit breakdown, and the top 15 debtor rows. Each is a `GROUP BY`, and
    // only the 15 surviving rows get their names resolved.
    //
    // The measure is `amount - paid_amount > 0`: a PENDING invoice that is fully
    // paid, or an overpaid one, has no outstanding balance and must not inflate
    // any figure. That predicate is spelled once in `outstanding` and reused by
    // every query, so the summary, the breakdown and the rows cannot drift.

    const outstanding = Prisma.sql`i.amount - i.paid_amount > 0`;

    const unitCondition = unitId ? Prisma.sql`AND i.unit_id = ${unitId}` : Prisma.empty;

    const [summaryRows, unitRows, studentRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{ total: number | null; unpaidCount: number; overdueCount: number }>
      >(Prisma.sql`
        SELECT
          COALESCE(SUM(i.amount - i.paid_amount), 0) AS total,
          COUNT(*)::int AS "unpaidCount",
          COUNT(*) FILTER (
            WHERE i.status = 'OVERDUE' OR i.due_date < ${now}
          )::int AS "overdueCount"
        FROM invoices i
        WHERE i.status IN ('PENDING', 'PARTIAL', 'OVERDUE')
          AND ${outstanding}
          ${unitCondition}
      `),

      // `i.unit_id` is NOT NULL and backfilled from the issuing payment type, so
      // the LEFT JOIN is defensive: an invoice whose unit was soft-deleted still
      // appears under a 'PUSAT' label rather than vanishing from the breakdown.
      prisma.$queryRaw<
        Array<{
          unitId: string;
          unitName: string;
          totalUnpaid: number;
          count: number;
          overdueCount: number;
        }>
      >(Prisma.sql`
        SELECT
          COALESCE(i.unit_id, 'PUSAT') AS "unitId",
          COALESCE(u.name, 'Yayasan Pusat') AS "unitName",
          COALESCE(SUM(i.amount - i.paid_amount), 0) AS "totalUnpaid",
          COUNT(*)::int AS "count",
          COUNT(*) FILTER (
            WHERE i.status = 'OVERDUE' OR i.due_date < ${now}
          )::int AS "overdueCount"
        FROM invoices i
        LEFT JOIN units u ON u.id = i.unit_id
        WHERE i.status IN ('PENDING', 'PARTIAL', 'OVERDUE')
          AND ${outstanding}
          ${unitCondition}
        GROUP BY COALESCE(i.unit_id, 'PUSAT'), COALESCE(u.name, 'Yayasan Pusat')
        ORDER BY "totalUnpaid" DESC
      `),

      // Top 15 by (student, invoice unit): a pupil can owe more than one unit
      // after a transfer, and each debt stays attributed to the unit that raised
      // it. Only these 15 rows pay for a name/NIS lookup below.
      prisma.$queryRaw<
        Array<{
          studentId: string;
          unitId: string;
          unitName: string;
          totalUnpaid: number;
          invoiceCount: number;
          nis: string | null;
          studentName: string | null;
          currentUnitId: string | null;
          currentUnitName: string | null;
        }>
      >(Prisma.sql`
        SELECT
          i.student_id AS "studentId",
          COALESCE(i.unit_id, 'PUSAT') AS "unitId",
          COALESCE(u.name, 'Yayasan Pusat') AS "unitName",
          SUM(i.amount - i.paid_amount) AS "totalUnpaid",
          COUNT(*)::int AS "invoiceCount",
          s.nis AS "nis",
          su.name AS "studentName",
          s.unit_id AS "currentUnitId",
          cu.name AS "currentUnitName"
        FROM invoices i
        LEFT JOIN units u ON u.id = i.unit_id
        JOIN students s ON s.id = i.student_id
        LEFT JOIN users su ON su.id = s.user_id
        LEFT JOIN units cu ON cu.id = s.unit_id
        WHERE i.status IN ('PENDING', 'PARTIAL', 'OVERDUE')
          AND ${outstanding}
          ${unitCondition}
        GROUP BY i.student_id, COALESCE(i.unit_id, 'PUSAT'), COALESCE(u.name, 'Yayasan Pusat'),
                 s.nis, su.name, s.unit_id, cu.name
        ORDER BY "totalUnpaid" DESC
        LIMIT 15
      `),
    ]);

    const summary = summaryRows[0] ?? { total: 0, unpaidCount: 0, overdueCount: 0 };

    return {
      summary: {
        totalUnpaidAmount: Number(summary.total ?? 0),
        totalUnpaidInvoicesCount: Number(summary.unpaidCount ?? 0),
        overdueInvoicesCount: Number(summary.overdueCount ?? 0),
      },
      unitBreakdown: unitRows.map((row) => ({
        unitId: row.unitId,
        unitName: row.unitName,
        totalUnpaid: Number(row.totalUnpaid),
        count: Number(row.count),
        overdueCount: Number(row.overdueCount),
      })),
      topArrearsStudents: studentRows.map((row) => ({
        studentId: row.studentId,
        studentName: row.studentName ?? '-',
        nis: row.nis || '-',
        unitId: row.unitId,
        unitName: row.unitName,
        currentUnitId: row.currentUnitId ?? null,
        currentUnitName: row.currentUnitName ?? null,
        totalUnpaid: Number(row.totalUnpaid),
        invoiceCount: Number(row.invoiceCount),
      })),
    };
  }
  // ==================== E-OFFICE PERIODIC OVERSIGHT REPORT ====================

  /**
   * The unit a foundation-wide letter is filed under.
   *
   * A periodic oversight report is not a school's correspondence — it is the
   * board auditing the yayasan. The old code called `findFirst()` with no
   * `where`, so the letter landed under whichever unit Postgres returned first
   * (in practice SMP IT). That is not a policy, it is insertion order, and it
   * puts the report in the wrong agenda book.
   *
   * `UnitType.OTHER` is the foundation-level unit type (`student-login-policy`,
   * `dormitories.service`), so a unit of that type is the explicit "pusat"
   * home. `PESANTREN` is the fallback. If neither exists the report cannot be
   * filed honestly, so it is refused rather than attributed to a random school.
   */
  private async resolveFoundationUnitId(): Promise<string> {
    const central = await prisma.unit.findFirst({
      where: { type: 'OTHER', deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (central) return central.id;

    const pesantren = await prisma.unit.findFirst({
      where: { type: 'PESANTREN', deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (pesantren) return pesantren.id;

    throw Errors.badRequest(
      'Belum ada unit tingkat yayasan (unit pusat) untuk menampung Laporan Pengawasan Periodik. ' +
        'Buat unit bertipe OTHER terlebih dahulu melalui menu Unit.'
    );
  }

  /**
   * The last-resort recipient: an active Super Admin.
   *
   * `UserRoleAssignment` is the source of truth for who holds a role (golden
   * rule #3); the legacy `User.role` column is a fallback that is no longer kept
   * in step. A `findFirst({ role: 'SUPER_ADMIN' })` therefore misses the very
   * accounts this branch exists to catch — an active account whose only
   * Super Admin grant is an assignment — and the report fails even though a
   * legitimate recipient is available. Resolve by effective assignment first,
   * exactly as the Pembina query does, and consult the legacy column only as an
   * explicit last resort for an un-migrated account.
   */
  private async findSuperAdminRecipient(): Promise<{ id: string; unitId: string | null } | null> {
    const now = new Date();
    const byAssignment = await prisma.user.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        userRoles: {
          some: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: { code: RoleCode.SUPER_ADMIN, isActive: true },
          },
        },
      },
      select: { id: true, unitId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (byAssignment) return byAssignment;

    // Legacy fallback — ONLY for an account that has no role-assignment row at
    // all.
    //
    // The legacy `User.role` column is not kept in step with assignments, so a
    // bare `role: 'SUPER_ADMIN'` match can select a *former* Super Admin: an
    // account whose Super Admin assignment was revoked while it kept some other
    // active role. `User.role` still says `SUPER_ADMIN` because nothing rewrites
    // the column on revocation, and the report would then be filed — and its
    // recipient grant handed out — to someone who is no longer an administrator.
    // Restricting the fallback to accounts with zero assignments keeps its only
    // legitimate purpose (an un-migrated account) and removes the false match.
    return prisma.user.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        role: 'SUPER_ADMIN',
        userRoles: { none: {} },
      },
      select: { id: true, unitId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async draftPeriodicReportToEOffice(
    data: DraftPeriodicReportInput,
    userId: string,
    _actor: { roleCode?: string | null; unitId?: string | null }
  ) {
    // Resolve the recipient with Pembina first, Super Admin only as fallback.
    //
    // A single `findFirst` over `OR: [SUPER_ADMIN, Pembina-role]` let Postgres
    // decide: whichever row it returned first won, so a foundation with both a
    // Pembina and a Super Admin could have the oversight report addressed to the
    // administrator instead of the officer it is meant for. Query them in
    // priority order instead, each with a deterministic `orderBy`.
    //
    // "Effective" is the point: a Pembina whose assignment is inactive or
    // expired is a former officer, and the report should not be drafted for
    // someone who no longer holds the office. The Super Admin fallback resolves
    // by effective assignment too (see `findSuperAdminRecipient`) — the legacy
    // `User.role` column alone would miss an assignment-only Super Admin.
    const nowForRoles = new Date();
    const pembinaUser =
      (await prisma.user.findFirst({
        where: {
          isActive: true,
          deletedAt: null,
          userRoles: {
            some: {
              isActive: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: nowForRoles } }],
              role: { code: 'YAYASAN_PEMBINA' },
            },
          },
        },
        select: { id: true, unitId: true },
        orderBy: { createdAt: 'asc' },
      })) ?? (await this.findSuperAdminRecipient());

    const unitId = await this.resolveFoundationUnitId();

    // No recipient, no report. The draft's whole purpose is to reach the
    // Pembina for verification and signature; with no effective Pembina and no
    // active Super Admin there is nobody to address it to, and the letter would
    // be filed as an orphan the E-Office flow can never advance. The check runs
    // before the transaction, so nothing is written.
    if (!pembinaUser) {
      throw Errors.badRequest(
        'Laporan Pengawasan Periodik tidak dapat dibuat: belum ada penerima yang sah. ' +
          'Pastikan terdapat akun Pembina Yayasan dengan penugasan aktif (atau Super Admin aktif) ' +
          'sebelum mengirim laporan.'
      );
    }

    const letterContent = `
LAPORAN PENGAWASAN PERIODIK YAYASAN PESANTREN CIPANSOR
Periode: ${data.period}
Judul: ${data.title}

1. RINGKASAN EKSEKUTIF
${data.executiveSummary}

2. RINGKASAN TEMUAN AUDIT & PENGATASAN RISIKO
${data.findingsSummary || 'Semua audit internal dan tindak lanjut temuan terpantau berjalan sesuai ketentuan.'}

3. REKOMENDASI PENGAWAS YAYASAN
${data.recommendations || 'Diharapkan Pengurus Yayasan dan Kepala Unit terus meningkatkan kepatuhan SOP dan efisiensi keuangan.'}
    `.trim();

    const defaultClassification = await prisma.filingClassification.findFirst();

    /**
     * Created as a DRAFT through the sanctioned E-Office primitive, not as a
     * `SENT` letter and not by writing the correspondence tables directly.
     *
     * The old code wrote `status: 'SENT'` straight into the row. That skipped
     * every part of the lifecycle the rest of E-Office depends on: no
     * `LetterFlowEvent` history, no reviewer rung, no `sentAt`, no dispatch —
     * so the Pembina received a letter the system already believed had left
     * the building, with no record of who sent it or how. A draft is the honest
     * starting state: the Pembina verifies and signs it, and each step is
     * recorded where E-Office expects to find it.
     *
     * `createGeneratedDraftLetter` is the one door for a non-correspondence
     * module to file a draft. It lives in `CorrespondenceService` because that
     * is where the letter invariants are — nature/type validity, recipient
     * eligibility, and the `CREATED` flow event in the same transaction.
     * Writing `Letter`/`LetterFlowEvent` from here would put a second, drifting
     * copy of those rules in the oversight module, which is exactly the
     * duplication this boundary is meant to prevent. Widen the allowlist of
     * `createLetter` instead and the oversight roles gain the whole
     * correspondence-creation surface; this primitive grants only the draft.
     */
    const letter = await CorrespondenceService.createGeneratedDraftLetter(
      {
        unitId,
        subject: `[Laporan Pengawasan] ${data.title} (${data.period})`,
        content: letterContent,
        recipientUserIds: [pembinaUser.id],
        nature: 'LIMITED',
        classificationId: defaultClassification?.id ?? null,
        note: `Laporan Pengawasan Periodik: ${data.title} (${data.period})`,
        // The draft exists to reach the Pembina; a Super Admin is the only
        // acceptable substitute. Re-asserted under the recipient lock inside the
        // primitive, so a revocation that commits between the recipient query
        // above and the letter insert cannot file it to a former officer.
        requiredRecipientRoleCodes: ['YAYASAN_PEMBINA', 'SUPER_ADMIN'],
      },
      userId
    );

    return {
      letterId: letter.id,
      letterNumber: letter.letterNumber,
      title: letter.subject,
      status: letter.status,
      contentPreview: letterContent,
    };
  }
}

export const pengawasanService = new PengawasanService();
