import { prisma } from '@/lib/prisma';
import { Prisma, PlanStatus, PlanReviewStage, PlanReviewAction } from '@prisma/client';
import { Errors } from '@/middleware/error';

type TransactionClient = Prisma.TransactionClient;

export class PerencanaanService {
  // ==================== STRATEGIC PLANS ====================

  async createPlan(data: {
    title: string;
    description?: string;
    type: 'RPJP' | 'RENSTRA' | 'RKA';
    startDate: string;
    endDate: string;
    budget?: number;
    /// Null for yayasan-level documents (RPJP, Renstra, RKA Yayasan). Only a
    /// unit's own RKA carries a unit.
    unitId?: string | null;
    createdById: string;
    parentId?: string;
  }) {
    // RPJP and RENSTRA are yayasan-level umbrella documents: the foundation
    // keeps exactly one live copy of each (a single combined plan), and only
    // its downstream RKA may be split per unit. Refuse a second active one so
    // the cascade always has a single root. Superseded plans (COMPLETED /
    // CANCELLED) don't count, so a new cycle can still replace an old one.
    if (data.type === 'RPJP' || data.type === 'RENSTRA') {
      const existing = await prisma.strategicPlan.findFirst({
        where: {
          type: data.type,
          // Superseded plans don't block a new cycle.
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        select: { id: true },
      });
      if (existing) {
        throw Errors.badRequest(
          `Hanya boleh ada satu ${data.type} aktif untuk yayasan (gabungan).`
        );
      }
    }

    // The consolidated RKA Yayasan is the document the pengurus actually
    // approves, so there is exactly one per year. Unit RKAs are unconstrained
    // — every unit files its own slice of that same year.
    if (data.type === 'RKA' && !data.unitId) {
      const year = new Date(data.startDate).getUTCFullYear();
      const clash = await prisma.strategicPlan.findFirst({
        where: {
          type: 'RKA',
          unitId: null,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          startDate: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        },
        select: { id: true },
      });
      if (clash) {
        throw Errors.badRequest(
          `Sudah ada RKA Yayasan aktif untuk tahun ${year}.`
        );
      }
    }

    if (data.parentId) {
      const parent = await prisma.strategicPlan.findUnique({ where: { id: data.parentId } });
      if (!parent) throw Errors.notFound('Parent plan');

      // Cascading hierarchy, mirroring the national planning chain
      // (RPJPD → RPJMD → RKPD → Renja/RKA-OPD): the annual level has TWO
      // tiers, a consolidated foundation document and the unit slices that
      // hang off it. A plan may only hang off the tier directly above it.
      //
      //   RPJP  (20 th, yayasan)
      //     └── RENSTRA  (5 th, yayasan)
      //           └── RKA Yayasan  (1 th, konsolidasi — unitId null)
      //                 └── RKA Unit  (1 th, per sekolah — unitId set)
      if (data.type === 'RKA') {
        if (data.unitId) {
          if (parent.type !== 'RKA' || parent.unitId !== null) {
            throw Errors.badRequest(
              'RKA unit harus menginduk pada RKA Yayasan (konsolidasi), bukan pada Renstra maupun RKA unit lain.'
            );
          }
        } else if (parent.type !== 'RENSTRA') {
          throw Errors.badRequest('RKA Yayasan harus menginduk pada Renstra.');
        }
      }
      if (data.type === 'RENSTRA' && parent.type !== 'RPJP') {
        throw Errors.badRequest('RENSTRA must refer to an RPJP parent plan');
      }
    } else if (data.type !== 'RPJP') {
      // RPJP adalah akar kaskade — satu-satunya tipe yang sah tanpa induk.
      // Segala yang lain harus menggantung pada tingkat di atasnya, atau
      // dokumen terlepas dari kaskade wajib (Renstra menginduk RPJP; RKA
      // Yayasan menginduk Renstra; RKA unit menginduk RKA Yayasan).
      if (data.type === 'RENSTRA') {
        throw Errors.badRequest('RENSTRA harus menyebut RPJP induknya.');
      }
      throw Errors.badRequest(
        data.unitId
          ? 'RKA unit harus menyebut RKA Yayasan induknya.'
          : 'RKA Yayasan harus menyebut Renstra induknya.'
      );
    }

    return prisma.strategicPlan.create({
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        budget: data.budget ? (data.budget as any) : undefined,
        unit: data.unitId ? { connect: { id: data.unitId } } : undefined,
        createdBy: { connect: { id: data.createdById } },
        parent: data.parentId ? { connect: { id: data.parentId } } : undefined,
      },
      include: {
        unit: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        parent: { select: { id: true, title: true, type: true } },
        objectives: true,
      },
    });
  }

  async getPlans(
    unitId: string | null,
    query: {
      type?: string;
      status?: string;
      collaboratorId?: string;
      /**
       * Foundation-scoped caller (yayasan board / super admin). They oversee
       * every unit, so their list is not narrowed to a single unit.
       */
      seesAllUnits?: boolean;
    }
  ) {
    const where: Prisma.StrategicPlanWhereInput = {};

    if (!query.seesAllUnits) {
      // A unit user sees three things: their own unit's plans, the
      // foundation-wide plans (unitId null — the yayasan's RPJP, Renstra and
      // consolidated RKA that govern every unit), and any plan they
      // collaborate on. Without the `unitId: null` branch the governing
      // documents were invisible to everyone, because by design they are filed
      // against no unit (see the schema note on StrategicPlan.unitId).
      const or: Prisma.StrategicPlanWhereInput[] = [{ unitId: null }];
      if (unitId) or.push({ unitId });
      // The collaborator branch is only added when a caller id is present —
      // `some: { userId: undefined }` would match ANY plan with collaborators.
      if (query.collaboratorId) {
        or.push({ collaborators: { some: { userId: query.collaboratorId } } });
      }
      where.OR = or;
    }
    // seesAllUnits: no unit filter at all — every unit's plan plus the
    // foundation-wide ones, subject only to the type/status filters below.

    if (query.type) where.type = query.type as any;
    if (query.status) where.status = query.status as any;

    return prisma.strategicPlan.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        parent: { select: { id: true, title: true, type: true } },
        collaborators: { include: { user: { select: { id: true, name: true } } } },
        reviewEvents: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, name: true } } },
        },
        objectives: {
          include: {
            indicators: true,
            activities: { select: { id: true, status: true } },
          },
          orderBy: { order: 'asc' },
        },
        risks: { select: { id: true, riskLevel: true, status: true } },
        internalAudits: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPlanById(id: string) {
    const plan = await prisma.strategicPlan.findUnique({
      where: { id },
      include: {
        unit: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        parent: { select: { id: true, title: true, type: true } },
        collaborators: { include: { user: { select: { id: true, name: true } } } },
        reviewEvents: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, name: true } } },
        },
        objectives: {
          include: {
            indicators: {
              include: { targets: { orderBy: { order: 'asc' } } },
              orderBy: { createdAt: 'asc' },
            },
            activities: {
              include: {
                pic: { select: { id: true, name: true } },
                budgetRel: {
                  include: {
                    account: { select: { id: true, code: true, name: true, normalBalance: true } },
                  },
                },
                // Program IKP / Kegiatan IKK, each with their staged targets.
                indicators: {
                  include: { targets: { orderBy: { order: 'asc' } } },
                  orderBy: { createdAt: 'asc' },
                },
                budgetItems: { orderBy: { order: 'asc' } },
                // A Renstra Program's Kegiatan (its own IKK + per-year targets).
                children: {
                  include: {
                    pic: { select: { id: true, name: true } },
                    indicators: {
                      include: { targets: { orderBy: { order: 'asc' } } },
                      orderBy: { createdAt: 'asc' },
                    },
                    budgetItems: { orderBy: { order: 'asc' } },
                  },
                  orderBy: { createdAt: 'asc' },
                },
              },
              // Only top-level activities here; Kegiatan nested under a Program
              // arrive via `children` above, not duplicated at this level.
              where: { parentId: null },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { order: 'asc' },
        },
        fundingSources: { orderBy: { order: 'asc' } },
        risks: true,
        internalAudits: true,
      },
    });

    if (!plan) return null;

    // Financial realization: gracefully degrade on error so the plan detail
    // is still returned even when journal aggregation fails.
    //
    // KNOWN LIMITATIONS:
    // 1. Journal entries are aggregated at the account level, not activity level.
    //    If an account (e.g., '5-1-01 General Office Expenses') has journal entries
    //    from business processes unrelated to this plan, those amounts will be included
    //    in the realization figure. This is an architectural limitation — there is no
    //    direct FK between JournalEntry and PlanActivity in the current schema.
    // 2. The date range filter uses the plan's startDate/endDate, not the Budget
    //    model's academicYearId. For multi-year RENSTRA plans, realization will span
    //    multiple academic years, while the linked Budget may only cover one year.
    //    Short-lived plans (an annual RKA) are typically aligned with a single
    //    academic year so this mismatch is less impactful for them.
    try {
      // 1. Collect all unique accountIds and their normalBalance across every activity
      const accountMap = new Map<string, { normalBalance: string }>();
      for (const obj of plan.objectives) {
        for (const act of obj.activities) {
          if (act.budgetRel && !accountMap.has(act.budgetRel.accountId)) {
            accountMap.set(act.budgetRel.accountId, {
              normalBalance: act.budgetRel.account.normalBalance,
            });
          }
        }
      }

      // 2. Aggregate journal entries once per unique accountId
      //    Extend endDate to end-of-day (23:59:59.999) so that journal entries
      //    recorded on the last day of the plan period are included. Without this,
      //    if endDate is stored as midnight UTC (e.g., 2024-12-31T00:00:00Z),
      //    any entry after midnight on that day would be excluded by the `lte` filter.
      const endOfDay = new Date(plan.endDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const accountRealizationMap = new Map<string, number>();
      await Promise.all(
        Array.from(accountMap.entries()).map(async ([accountId, meta]) => {
          const journalAggregates = await prisma.journalEntry.aggregate({
            where: {
              accountId,
              // See note in scheduler.service.ts: null unit means foundation-wide,
              // so the filter is omitted rather than matched against NULL.
              unitId: plan.unitId ?? undefined,
              date: {
                gte: plan.startDate,
                lte: endOfDay,
              },
            },
            _sum: {
              debit: true,
              credit: true,
            },
          });

          let realization: number;
          if (meta.normalBalance === 'DEBIT') {
            realization =
              (journalAggregates._sum.debit?.toNumber() || 0) -
              (journalAggregates._sum.credit?.toNumber() || 0);
          } else {
            realization =
              (journalAggregates._sum.credit?.toNumber() || 0) -
              (journalAggregates._sum.debit?.toNumber() || 0);
          }
          accountRealizationMap.set(accountId, Math.max(0, realization));
        })
      );

      // 3. For each account, compute the total budget across all activities sharing it
      //    so we can distribute realization proportionally.
      const accountTotalBudget = new Map<string, number>();
      for (const obj of plan.objectives) {
        for (const act of obj.activities) {
          if (act.budgetRel) {
            const accId = act.budgetRel.accountId;
            const actBudget = act.budget?.toNumber() || 0;
            accountTotalBudget.set(accId, (accountTotalBudget.get(accId) || 0) + actBudget);
          }
        }
      }

      // 4. Calculate realization for each activity and objective
      const objectivesWithRealization = plan.objectives.map((obj) => {
        const activitiesWithRealization = obj.activities.map((act) => {
          let realization = 0;
          if (act.budgetRel) {
            const accId = act.budgetRel.accountId;
            const accountTotal = accountRealizationMap.get(accId) || 0;
            const totalBudgetForAccount = accountTotalBudget.get(accId) || 0;
            const actBudget = act.budget?.toNumber() || 0;

            // Distribute the account's realization proportionally by budget share
            if (totalBudgetForAccount > 0 && actBudget > 0) {
              realization = accountTotal * (actBudget / totalBudgetForAccount);
            } else if (totalBudgetForAccount === 0) {
              // All activities have zero budget — split evenly as fallback
              const actCount = [...plan.objectives]
                .flatMap((o) => o.activities)
                .filter((a) => a.budgetRel?.accountId === accId).length;
              realization = actCount > 0 ? accountTotal / actCount : 0;
            }
          }
          return { ...act, realization: Math.max(0, realization) };
        });

        // Only include activities with a budgetRel link in the total budget
        // so that untracked activities don't dilute the financial progress.
        const totalBudget = activitiesWithRealization.reduce(
          (sum, act) => sum + (act.budgetRel ? (act.budget?.toNumber() || 0) : 0),
          0
        );
        const totalRealization = activitiesWithRealization.reduce(
          (sum, act) => sum + act.realization,
          0
        );

        return {
          ...obj,
          activities: activitiesWithRealization,
          totalBudget,
          totalRealization,
          financialProgress: totalBudget > 0 ? Math.min((totalRealization / totalBudget) * 100, 100) : 0,
        };
      });

      const totalPlanBudget = objectivesWithRealization.reduce((sum, obj) => sum + obj.totalBudget, 0);
      const totalPlanRealization = objectivesWithRealization.reduce(
        (sum, obj) => sum + obj.totalRealization,
        0
      );

      return {
        ...plan,
        objectives: objectivesWithRealization,
        totalBudget: totalPlanBudget,
        totalRealization: totalPlanRealization,
        financialProgress: totalPlanBudget > 0 ? Math.min((totalPlanRealization / totalPlanBudget) * 100, 100) : 0,
      };
    } catch (err: any) {
      console.error('[Perencanaan] Journal aggregation failed, returning plan without financial data:', err?.message || err);
      // Return the plan with zero realization so the page still renders
      const fallbackObjectives = plan.objectives.map((obj) => ({
        ...obj,
        activities: obj.activities.map((act) => ({ ...act, realization: 0 })),
        totalBudget: obj.activities.reduce((sum, act) => sum + (act.budgetRel ? (act.budget?.toNumber() || 0) : 0), 0),
        totalRealization: 0,
        financialProgress: 0,
      }));
      return {
        ...plan,
        objectives: fallbackObjectives,
        totalBudget: fallbackObjectives.reduce((sum, obj) => sum + obj.totalBudget, 0),
        totalRealization: 0,
        financialProgress: 0,
      };
    }
  }

  /**
   * Lightweight lookup for authorization checks — no journal aggregation.
   */
  /**
   * Monthly realization trend for a plan: journal movements on the plan's
   * budget accounts, bucketed per month over the plan period (same
   * account-level attribution caveats as getPlanById).
   */
  async getPlanRealizationTrend(id: string) {
    const plan = await prisma.strategicPlan.findUnique({
      where: { id },
      include: {
        objectives: {
          include: {
            activities: {
              include: {
                budgetRel: { include: { account: { select: { normalBalance: true } } } },
              },
            },
          },
        },
      },
    });
    if (!plan) return null;

    const accountBalance = new Map<string, string>();
    for (const objective of plan.objectives) {
      for (const activity of objective.activities) {
        if (activity.budgetRel) {
          accountBalance.set(
            activity.budgetRel.accountId,
            activity.budgetRel.account.normalBalance
          );
        }
      }
    }
    if (accountBalance.size === 0) return { planId: id, trend: [] };

    const endOfDay = new Date(plan.endDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const entries = await prisma.journalEntry.findMany({
      where: {
        accountId: { in: [...accountBalance.keys()] },
        unitId: plan.unitId ?? undefined,
        date: { gte: plan.startDate, lte: endOfDay },
      },
      select: { accountId: true, date: true, debit: true, credit: true },
      take: 10000,
    });

    const buckets = new Map<string, number>();
    for (const entry of entries) {
      const key = `${entry.date.getFullYear()}-${String(entry.date.getMonth() + 1).padStart(2, '0')}`;
      const isDebitNormal = accountBalance.get(entry.accountId) === 'DEBIT';
      const movement = isDebitNormal
        ? Number(entry.debit) - Number(entry.credit)
        : Number(entry.credit) - Number(entry.debit);
      buckets.set(key, (buckets.get(key) ?? 0) + movement);
    }

    const trend = [...buckets.entries()]
      .map(([month, realization]) => ({ month, realization: Math.max(0, realization) }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return { planId: id, trend };
  }

  /**
   * Plan write-auth payload ({ id, unitId, status, isCollaborator }). When a
   * userId is supplied, isCollaborator tells whether that user was explicitly
   * added as a collaborator on the plan (PlanCollaborator), letting the
   * controller's write gate grant DRAFT/IN_PROGRESS edits to the right people.
   */
  planAuthSelect(userId?: string) {
    return {
      id: true,
      unitId: true,
      status: true,
      type: true,
      reviewStage: true,
      ...(userId
        ? { collaborators: { where: { userId }, select: { userId: true } } }
        : {}),
    };
  }

  planAuthFromRow(
    row: {
      id: string;
      unitId: string | null;
      status: string;
      type?: string;
      reviewStage?: string | null;
      collaborators?: { userId: string }[];
    } | null
  ) {
    return row
      ? {
          id: row.id,
          unitId: row.unitId,
          status: row.status,
          type: row.type,
          reviewStage: row.reviewStage ?? null,
          isCollaborator: (row.collaborators ?? []).length > 0,
        }
      : null;
  }

  async getPlanForAuth(id: string, userId?: string) {
    const row = await prisma.strategicPlan.findUnique({
      where: { id },
      select: this.planAuthSelect(userId),
    });
    return this.planAuthFromRow(row);
  }

  /**
   * Resolve an objective to its parent plan's write-auth payload
   * ({ id, unitId, status, isCollaborator }). Used by the controller to gate
   * subrecord mutations against the same write-access + DRAFT rules as the
   * plan itself.
   */
  async getObjectivePlanForAuth(
    objectiveId: string,
    userId?: string
  ): Promise<{ id: string; unitId: string | null; status: string; isCollaborator: boolean } | null> {
    const objective = await prisma.planObjective.findUnique({
      where: { id: objectiveId },
      select: { plan: { select: this.planAuthSelect(userId) } },
    });
    return this.planAuthFromRow(objective?.plan ?? null);
  }

  /**
   * Resolve an indicator to its parent plan's write-auth payload. An
   * indicator hangs off EITHER an objective (IUP/IKU) or an activity
   * (IKP/IKK) — trace whichever branch is set.
   */
  async getIndicatorPlanForAuth(
    indicatorId: string,
    userId?: string
  ): Promise<{ id: string; unitId: string | null; status: string; isCollaborator: boolean } | null> {
    const indicator = await prisma.planIndicator.findUnique({
      where: { id: indicatorId },
      select: { objectiveId: true, activityId: true },
    });
    if (!indicator) return null;
    if (indicator.objectiveId)
      return this.getObjectivePlanForAuth(indicator.objectiveId, userId);
    if (indicator.activityId) return this.getActivityPlanForAuth(indicator.activityId, userId);
    return null;
  }

  /**
   * Resolve an activity to its parent plan's write-auth payload. Walk the
   * parent chain (Kegiatan → Program) until an objective is found, then
   * resolve that objective's plan.
   */
  async getActivityPlanForAuth(
    activityId: string,
    userId?: string
  ): Promise<{ id: string; unitId: string | null; status: string; isCollaborator: boolean } | null> {
    const activity = await prisma.planActivity.findUnique({
      where: { id: activityId },
      select: { objectiveId: true, parentId: true },
    });
    if (!activity) return null;
    if (activity.objectiveId) return this.getObjectivePlanForAuth(activity.objectiveId, userId);
    if (activity.parentId) return this.getActivityPlanForAuth(activity.parentId, userId);
    return null;
  }

  async updatePlan(id: string, data: Prisma.StrategicPlanUpdateInput) {
    return prisma.strategicPlan.update({
      where: { id },
      data,
      include: {
        unit: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        objectives: true,
      },
    });
  }

  async approvePlan(id: string, approvedById: string) {
    return prisma.strategicPlan.update({
      where: { id },
      data: {
        // String casting allows the update without triggering Vitest Prisma Enum mock issues
        status: 'APPROVED' as PlanStatus,
        approvedBy: { connect: { id: approvedById } },
        approvedAt: new Date(),
      },
    });
  }

  /**
   * One step of the yayasan-document ratification flow, atomically.
   *
   * The stage moves only while it is still one this step expects (a
   * compare-and-set on `reviewStage`), and the trail entry is written in the
   * same transaction — so two people pressing a button at once cannot both
   * succeed, and no stage change ever exists without its record.
   */
  async advanceReview(params: {
    planId: string;
    from: Array<PlanReviewStage | null>;
    to: PlanReviewStage;
    status: PlanStatus;
    approve?: boolean;
    event: {
      action: PlanReviewAction;
      actorId: string;
      actorRoleCode: string;
      notes?: string | null;
      revised?: boolean | null;
    };
  }) {
    const stages = params.from.filter((s): s is PlanReviewStage => s !== null);
    const stageWhere = params.from.includes(null)
      ? { OR: [{ reviewStage: null }, { reviewStage: { in: stages } }] }
      : { reviewStage: { in: stages } };

    return prisma.$transaction(async (tx) => {
      const { count } = await tx.strategicPlan.updateMany({
        where: { id: params.planId, ...stageWhere },
        data: {
          reviewStage: params.to,
          status: params.status,
          ...(params.approve
            ? { approvedById: params.event.actorId, approvedAt: new Date() }
            : {}),
        },
      });
      if (count !== 1) {
        throw Errors.badRequest(
          'Tahap pengesahan dokumen ini sudah berubah. Muat ulang halaman untuk melihat tahap terbarunya.'
        );
      }
      await tx.planReviewEvent.create({
        data: {
          planId: params.planId,
          action: params.event.action,
          actorId: params.event.actorId,
          actorRoleCode: params.event.actorRoleCode,
          notes: params.event.notes ?? null,
          revised: params.event.revised ?? null,
        },
      });
      return tx.strategicPlan.findUnique({
        where: { id: params.planId },
        select: { id: true, status: true, reviewStage: true, approvedAt: true },
      });
    });
  }

  async deletePlan(id: string) {
    return prisma.strategicPlan.delete({ where: { id } });
  }

  // ==================== COLLABORATION ====================

  async addCollaborator(planId: string, userId: string, callerId: string, isPrivileged: boolean) {
    const plan = await prisma.strategicPlan.findUnique({ where: { id: planId } });
    if (!plan) throw Errors.notFound('Plan');
    if (!isPrivileged && plan.createdById !== callerId) {
      throw Errors.forbidden('Only the plan creator or an admin may manage collaborators');
    }
    if (plan.status !== PlanStatus.DRAFT) {
      throw Errors.badRequest('Can only add collaborators to DRAFT plans');
    }

    return prisma.planCollaborator.create({
      data: { planId, userId },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async removeCollaborator(
    planId: string,
    userId: string,
    callerId: string,
    isPrivileged: boolean
  ) {
    const plan = await prisma.strategicPlan.findUnique({ where: { id: planId } });
    if (!plan) throw Errors.notFound('Plan');
    if (!isPrivileged && plan.createdById !== callerId) {
      throw Errors.forbidden('Only the plan creator or an admin may manage collaborators');
    }

    return prisma.planCollaborator.delete({
      where: { planId_userId: { planId, userId } },
    });
  }

  // ==================== OBJECTIVES ====================

  async createObjective(data: {
    planId: string;
    title: string;
    description?: string;
    perspective?: 'FINANCIAL' | 'CUSTOMER' | 'PROCESS' | 'LEARNING';
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    weight?: number;
    order?: number;
  }) {
    const objective = await prisma.planObjective.create({
      data: {
        plan: { connect: { id: data.planId } },
        title: data.title,
        description: data.description,
        perspective: data.perspective,
        priority: data.priority,
        weight: data.weight,
        order: data.order,
      },
      include: { indicators: true, activities: true },
    });

    // Recalculate plan progress
    await this.recalculatePlanProgress(data.planId);
    return objective;
  }

  async updateObjective(id: string, data: Prisma.PlanObjectiveUpdateInput) {
    const objective = await prisma.planObjective.update({
      where: { id },
      data,
      include: { plan: { select: { id: true } } },
    });

    await this.recalculatePlanProgress(objective.plan.id);
    return objective;
  }

  async deleteObjective(id: string) {
    const objective = await prisma.planObjective.findUnique({
      where: { id },
      select: { planId: true },
    });
    const result = await prisma.planObjective.delete({ where: { id } });
    if (objective) await this.recalculatePlanProgress(objective.planId);
    return result;
  }

  // ==================== INDICATORS ====================

  async createIndicator(data: {
    objectiveId: string;
    name: string;
    unit: string;
    baseline?: number;
    targetValue: number;
  }) {
    const indicator = await prisma.planIndicator.create({
      data: {
        objective: { connect: { id: data.objectiveId } },
        name: data.name,
        unit: data.unit,
        baseline: data.baseline,
        targetValue: data.targetValue,
      },
    });

    await this.recalculateObjectiveProgress(data.objectiveId);
    return indicator;
  }

  async updateIndicator(id: string, data: Prisma.PlanIndicatorUpdateInput) {
    const indicator = await prisma.planIndicator.update({
      where: { id },
      data,
      include: { objective: { select: { id: true } } },
    });

    // Only objective-level indicators drive objective progress; an
    // activity-level indicator (IKP/IKK) has no objective to roll up to.
    if (indicator.objective) {
      await this.recalculateObjectiveProgress(indicator.objective.id);
    }
    return indicator;
  }

  async deleteIndicator(id: string) {
    const indicator = await prisma.planIndicator.findUnique({
      where: { id },
      select: { objectiveId: true },
    });
    const result = await prisma.planIndicator.delete({ where: { id } });
    if (indicator?.objectiveId) await this.recalculateObjectiveProgress(indicator.objectiveId);
    return result;
  }

  // ==================== ACTIVITIES ====================

  async createActivity(data: {
    objectiveId: string;
    title: string;
    description?: string;
    picId?: string | null;
    startDate?: string;
    endDate?: string;
    budget?: number;
    budgetId?: string | null;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }) {
    return prisma.planActivity.create({
      data: {
        objective: { connect: { id: data.objectiveId } },
        title: data.title,
        description: data.description,
        pic: data.picId ? { connect: { id: data.picId } } : undefined,
        budgetRel: data.budgetId ? { connect: { id: data.budgetId } } : undefined,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        budget: data.budget ? (data.budget as any) : undefined,
        priority: data.priority,
      },
      include: {
        pic: { select: { id: true, name: true } },
        budgetRel: {
          include: {
            account: { select: { code: true, name: true } },
          },
        },
      },
    });
  }

  async updateActivity(id: string, data: any) {
    const { picId, budgetId, ...rest } = data;
    const updateData: any = { ...rest };

    if (picId) updateData.pic = { connect: { id: picId } };
    else if (picId === null) updateData.pic = { disconnect: true };

    if (budgetId) updateData.budgetRel = { connect: { id: budgetId } };
    else if (budgetId === null) updateData.budgetRel = { disconnect: true };

    if (rest.startDate) updateData.startDate = new Date(rest.startDate);
    if (rest.endDate) updateData.endDate = new Date(rest.endDate);
    if (rest.budget !== undefined) updateData.budget = (rest.budget as any);

    return prisma.planActivity.update({
      where: { id },
      data: updateData,
      include: {
        pic: { select: { id: true, name: true } },
        budgetRel: {
          include: {
            account: { select: { code: true, name: true } },
          },
        },
      },
    });
  }

  async deleteActivity(id: string) {
    return prisma.planActivity.delete({ where: { id } });
  }

  // ==================== HELPERS ====================

  /**
   * Recalculate an objective's progress from its indicators.
   * Logic: (currentValue / targetValue) * 100
   */
  async recalculateObjectiveProgress(
    objectiveId: string,
    tx: TransactionClient | typeof prisma = prisma
  ) {
    const objective = await tx.planObjective.findUnique({
      where: { id: objectiveId },
      include: { indicators: true },
    });

    if (!objective) return;

    if (objective.indicators.length === 0) {
      await tx.planObjective.update({
        where: { id: objectiveId },
        data: { progress: 0 },
      });
      await this.recalculatePlanProgress(objective.planId, tx);
      return;
    }

    const totalProgress = objective.indicators.reduce((sum, ind) => {
      const target = ind.targetValue;
      const current = ind.currentValue || 0;
      // When target is 0, the goal is "reduce to zero". If current is also 0
      // (or less), the goal is fully met → 100%. Otherwise 0%.
      if (target === 0 || target === null) {
        return sum + (current <= 0 ? 100 : 0);
      }
      const progress = (current / target) * 100;
      return sum + Math.min(100, progress); // Cap indicator progress at 100%
    }, 0);

    const averageProgress = totalProgress / objective.indicators.length;

    await tx.planObjective.update({
      where: { id: objectiveId },
      data: { progress: Math.round(averageProgress * 100) / 100 },
    });

    // Also recalculate parent plan
    await this.recalculatePlanProgress(objective.planId, tx);
  }

  /**
   * Recalculate a plan's weighted progress from its objectives.
   * Accepts an optional transaction client so it can be called from within
   * other services' transactions (e.g., PengawasanService.createFinding).
   */
  async recalculatePlanProgress(planId: string, tx: TransactionClient | typeof prisma = prisma) {
    const objectives = await tx.planObjective.findMany({
      where: { planId },
      select: { weight: true, progress: true },
    });

    if (objectives.length === 0) return;

    const totalWeight = objectives.reduce((sum, obj) => sum + obj.weight, 0);
    const weightedProgress = objectives.reduce(
      (sum, obj) => sum + (obj.progress * obj.weight) / (totalWeight || 1),
      0
    );

    await tx.strategicPlan.update({
      where: { id: planId },
      data: { progress: Math.round(weightedProgress * 100) / 100 },
    });
  }
}

export const perencanaanService = new PerencanaanService();
