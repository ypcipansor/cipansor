import { prisma } from '@/lib/prisma';
import { LetterFlowAction, Prisma } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { perencanaanService } from '../perencanaan/perencanaan.service';
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
    if (rest.dueDate) updateData.dueDate = new Date(rest.dueDate);

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

    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
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

    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        // Filter on the invoice's own unit of record. `student.unitId` is the
        // pupil's *current* unit, so a transfer moved old arrears between
        // units' books; legacy rows with no unit fall back to the student's.
        ...(unitId
          ? { OR: [{ unitId }, { unitId: null, student: { unitId } }] }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            // `Student` has no `name` column — the person's name lives on the
            // linked `User`. The old select asked for `student.name`, which is
            // not a field, so the whole endpoint threw at query-build time.
            nis: true,
            unitId: true,
            user: { select: { name: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        unit: { select: { id: true, name: true } },
        paymentType: { select: { id: true, name: true, code: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    let totalUnpaidAmount = 0;
    let overdueInvoicesCount = 0;

    const unitMap: Record<
      string,
      { unitId: string; unitName: string; totalUnpaid: number; count: number; overdueCount: number }
    > = {};
    const studentMap: Record<
      string,
      {
        studentId: string;
        studentName: string;
        nis: string;
        unitName: string;
        totalUnpaid: number;
        invoiceCount: number;
      }
    > = {};

    for (const inv of unpaidInvoices) {
      const remaining = Number(inv.amount) - Number(inv.paidAmount);
      if (remaining <= 0) continue;

      totalUnpaidAmount += remaining;
      const isOverdue = inv.status === 'OVERDUE' || (inv.dueDate && inv.dueDate < now);
      if (isOverdue) overdueInvoicesCount++;

      // The invoice's own unit when we have one; only rows predating the
      // column fall back to the student's current unit.
      const uId = inv.unitId || inv.student.unitId || 'PUSAT';
      const uName = inv.unit?.name || inv.student.unit?.name || 'Yayasan Pusat';

      if (!unitMap[uId]) {
        unitMap[uId] = { unitId: uId, unitName: uName, totalUnpaid: 0, count: 0, overdueCount: 0 };
      }
      unitMap[uId].totalUnpaid += remaining;
      unitMap[uId].count += 1;
      if (isOverdue) unitMap[uId].overdueCount += 1;

      const sId = inv.studentId;
      if (!studentMap[sId]) {
        studentMap[sId] = {
          studentId: sId,
          studentName: inv.student.user?.name ?? '-',
          nis: inv.student.nis || '-',
          unitName: uName,
          totalUnpaid: 0,
          invoiceCount: 0,
        };
      }
      studentMap[sId].totalUnpaid += remaining;
      studentMap[sId].invoiceCount += 1;
    }

    const topArrearsStudents = Object.values(studentMap)
      .sort((a, b) => b.totalUnpaid - a.totalUnpaid)
      .slice(0, 15);

    return {
      summary: {
        totalUnpaidAmount,
        totalUnpaidInvoicesCount: unpaidInvoices.length,
        overdueInvoicesCount,
      },
      unitBreakdown: Object.values(unitMap),
      topArrearsStudents,
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

  async submitPeriodicReportToEOffice(
    data: {
      title: string;
      period: string;
      executiveSummary: string;
      findingsSummary?: string;
      recommendations?: string;
    },
    userId: string,
    _actor: { roleCode?: string | null; unitId?: string | null }
  ) {
    // Find a recipient user with an *effective* Pembina role or Super Admin.
    // "Effective" is the point: a Pembina whose assignment is inactive or
    // expired is a former officer, and a LIMITED report should not be drafted
    // for someone who no longer holds the office.
    const pembinaUser = await prisma.user.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { role: 'SUPER_ADMIN' },
          {
            userRoles: {
              some: {
                isActive: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                role: { code: 'YAYASAN_PEMBINA' },
              },
            },
          },
        ],
      },
      select: { id: true, unitId: true },
    });

    const unitId = await this.resolveFoundationUnitId();

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
     * Created as a DRAFT in the normal E-Office workflow, not as a `SENT`
     * letter.
     *
     * The old code wrote `status: 'SENT'` straight into the row. That skipped
     * every part of the lifecycle the rest of E-Office depends on: no
     * `LetterFlowEvent` history, no reviewer rung, no `sentAt`, no dispatch —
     * so the Pembina received a letter the system already believed had left
     * the building, with no record of who sent it or how. A draft is the
     * honest starting state: the Pembina verifies and signs it, and each step
     * is recorded where E-Office expects to find it.
     *
     * Deliberately NOT via `CorrespondenceService.createLetter`: that admits
     * only correspondence roles and executive foundations, and rejects the
     * oversight-only YAYASAN_PENGAWAS by design (it does not run
     * correspondence). This is the Pengawas's own output, filed on the
     * foundation unit for the Pembina, so it is written here with the flow
     * event that makes it legible in the E-Office history.
     */
    const letter = await prisma.$transaction(async (tx) => {
      const created = await tx.letter.create({
        data: {
          unitId,
          direction: 'OUTGOING',
          type: 'SURAT_DINAS',
          subject: `[Laporan Pengawasan] ${data.title} (${data.period})`,
          content: letterContent,
          date: new Date(),
          status: 'DRAFT',
          urgency: 'NORMAL',
          nature: 'LIMITED',
          authoringTrack: 'GENERATED',
          createdById: userId,
          classificationId: defaultClassification?.id,
          recipients: pembinaUser
            ? {
                create: [
                  {
                    userId: pembinaUser.id,
                    unitId,
                    isCC: false,
                  },
                ],
              }
            : undefined,
        },
        include: {
          createdBy: { select: { id: true, name: true, role: true } },
          recipients: { select: { id: true, userId: true } },
        },
      });

      // The letter's history begins where the letter does. Without this row the
      // draft exists but nothing in E-Office can say when or by whom.
      await tx.letterFlowEvent.create({
        data: {
          letterId: created.id,
          actorId: userId,
          action: LetterFlowAction.CREATED,
          toStatus: 'DRAFT',
          note: `Laporan Pengawasan Periodik: ${data.title} (${data.period})`,
        },
      });

      return created;
    });

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
