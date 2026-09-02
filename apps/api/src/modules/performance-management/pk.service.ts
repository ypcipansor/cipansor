import { prisma } from '@/lib/prisma';
import { PlanStatus, CascadingCategory, PerformanceAgreement } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { seesAllUnits } from '@/utils/resolve-unit-id';

/**
 * Perjanjian Kinerja (PK) — performance agreements with cascading
 * indicators (Master Plan / Renstra → supervisor PK → subordinate PK).
 *
 * Workflow: DRAFT → PROPOSED (owner, weights must total 100)
 *           PROPOSED → APPROVED (supervisor/admin)
 *           PROPOSED → DRAFT with revision notes (supervisor/admin reject)
 */
export class PerformanceAgreementService {
  /** Throws unless the caller owns the PK, supervises it, or is an admin. */
  assertAccess(
    pk: Pick<PerformanceAgreement, 'userId' | 'supervisorId'>,
    callerId: string,
    isAdmin: boolean,
    opts: { ownerOnly?: boolean; supervisorOnly?: boolean } = {}
  ) {
    if (isAdmin) return;
    if (opts.supervisorOnly) {
      if (pk.supervisorId !== callerId) {
        throw Errors.forbidden('Only the assigned supervisor may perform this action');
      }
      return;
    }
    if (opts.ownerOnly) {
      if (pk.userId !== callerId) {
        throw Errors.forbidden('Only the PK owner may perform this action');
      }
      return;
    }
    if (pk.userId !== callerId && pk.supervisorId !== callerId) {
      throw Errors.forbidden();
    }
  }

  async createPK(data: {
    userId: string;
    supervisorId?: string;
    supervisorPkId?: string;
    strategicPlanId?: string;
    periodStart: string;
    periodEnd: string;
    notes?: string;
  }) {
    let supervisorPkId = data.supervisorPkId;

    // Cascading rule: a PK that names a supervisor links to that
    // supervisor's APPROVED PK covering the same period.
    if (data.supervisorId) {
      const supervisorPk = await prisma.performanceAgreement.findFirst({
        where: {
          userId: data.supervisorId,
          status: PlanStatus.APPROVED,
          periodStart: { lte: new Date(data.periodStart) },
          periodEnd: { gte: new Date(data.periodEnd) },
        },
      });

      if (!supervisorPk) {
        throw Errors.badRequest(
          'Supervisor must have an approved PK covering the same period before subordinate PKs can be created'
        );
      }
      supervisorPkId = supervisorPk.id;
    }

    return prisma.performanceAgreement.create({
      data: {
        user: { connect: { id: data.userId } },
        supervisor: data.supervisorId ? { connect: { id: data.supervisorId } } : undefined,
        supervisorPk: supervisorPkId ? { connect: { id: supervisorPkId } } : undefined,
        strategicPlan: data.strategicPlanId
          ? { connect: { id: data.strategicPlanId } }
          : undefined,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        notes: data.notes,
      },
      include: {
        user: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
        strategicPlan: { select: { id: true, title: true } },
      },
    });
  }

  async getSupervisors(caller?: { roleCode?: string | null; role?: string | null; unitId?: string | null }) {
    const now = new Date();
    const canSeeAll = caller ? seesAllUnits(caller) : true;
    const targetUnitId = !canSeeAll ? (caller?.unitId ?? 'none') : undefined;

    return prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: {
          some: {
            isActive: true,
            ...(targetUnitId ? { unitId: targetUnitId } : {}),
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
            role: {
              code: {
                in: [
                  'SUPER_ADMIN',
                  'YAYASAN_PEMBINA',
                  'YAYASAN_KETUA',
                  'YAYASAN_SEKRETARIS',
                  'YAYASAN_BENDAHARA',
                  'YAYASAN_ANGGOTA',
                  'YAYASAN_PENGAWAS',
                  'TKQ_ADMIN',
                  'SDIT_ADMIN',
                  'SMPIT_ADMIN',
                  'SMAQ_ADMIN',
                  'TKQ_GURU',
                  'SDIT_GURU',
                  'SMPIT_GURU',
                  'SMAQ_GURU',
                  'TKQ_KEPALA_SEKOLAH',
                  'SDIT_KEPALA_SEKOLAH',
                  'SMPIT_KEPALA_SEKOLAH',
                  'SMAQ_KEPALA_SEKOLAH',
                  'TKQ_WAKASEK',
                  'SDIT_WAKASEK',
                  'SMPIT_WAKASEK',
                  'SMAQ_WAKASEK',
                  'TKQ_WALI_KELAS',
                  'SDIT_WALI_KELAS',
                  'SMPIT_WALI_KELAS',
                  'SMAQ_WALI_KELAS',
                  'SMPIT_GURU_BK',
                  'SMAQ_GURU_BK',
                  'PESANTREN_PENGASUH',
                  'PESANTREN_DIREKTUR',
                  'USTADZ',
                  'MUSYRIF',
                  'MUSYRIFAH',
                  'MUHAFIDZ',
                  'MUHAFIDZAH',
                  'MURABBI',
                  'WALI_KAMAR',
                  'PT_REKTOR',
                  'PT_WAKIL_REKTOR',
                  'PT_DEKAN',
                  'PT_KAPRODI',
                  'PT_DOSEN',
                  'TKQ_TATA_USAHA',
                  'SDIT_TATA_USAHA',
                  'SMPIT_TATA_USAHA',
                  'SMAQ_TATA_USAHA',
                  'TKQ_BENDAHARA',
                  'SDIT_BENDAHARA',
                  'SMPIT_BENDAHARA',
                  'SMAQ_BENDAHARA',
                  'PESANTREN_TATA_USAHA',
                  'PT_TATA_USAHA',
                  'PT_STAF_AKADEMIK',
                  'BUSINESS_MANAGER',
                ],
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        unit: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getPKs(userId: string, query: { status?: string }) {
    const status =
      query.status && Object.values(PlanStatus).includes(query.status as PlanStatus)
        ? (query.status as PlanStatus)
        : undefined;

    return prisma.performanceAgreement.findMany({
      where: {
        OR: [{ userId }, { supervisorId: userId }],
        status,
      },
      include: {
        user: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
        strategicPlan: { select: { id: true, title: true } },
        indicators: true,
        evaluations: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPKById(id: string) {
    return prisma.performanceAgreement.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
        strategicPlan: { select: { id: true, title: true } },
        indicators: {
          include: {
            refIndicator: { select: { id: true, title: true } },
            refStrategicIndicator: { select: { id: true, name: true } },
          },
        },
        evaluations: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    });
  }

  async deletePK(
    id: string,
    caller:
      | string
      | { id: string; isAdmin?: boolean; roleCode?: string | null; unitId?: string | null },
    isAdminLegacy?: boolean
  ) {
    const callerObj =
      typeof caller === 'string'
        ? { id: caller, isAdmin: !!isAdminLegacy, roleCode: undefined, unitId: null }
        : caller;

    return prisma.$transaction(async (tx) => {
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM "performance_agreements" WHERE id = ${id} FOR UPDATE`;
      }

      const pk = await tx.performanceAgreement.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, unitId: true } },
        },
      });
      if (!pk) throw Errors.notFound('PK');

      if (pk.status === PlanStatus.APPROVED || pk.status === PlanStatus.PROPOSED) {
        throw Errors.conflict('Only DRAFT performance agreements can be deleted');
      }

      const isOwner = pk.userId === callerObj.id;
      const isSuperAdmin = callerObj.roleCode === 'SUPER_ADMIN';
      const isSameUnitAdmin =
        !!callerObj.isAdmin &&
        callerObj.unitId !== null &&
        callerObj.unitId !== undefined &&
        pk.user?.unitId === callerObj.unitId;

      if (!isOwner && !isSuperAdmin && !isSameUnitAdmin) {
        throw Errors.forbidden('You do not have permission to delete this performance agreement');
      }

      return tx.performanceAgreement.delete({ where: { id } });
    });
  }

  async updatePK(
    id: string,
    callerId: string,
    isAdmin: boolean,
    data: { notes?: string; supervisorId?: string; strategicPlanId?: string }
  ) {
    const pk = await prisma.performanceAgreement.findUnique({ where: { id } });
    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, callerId, isAdmin, { ownerOnly: true });
    if (pk.status === PlanStatus.APPROVED) {
      throw Errors.badRequest('An approved PK can no longer be edited');
    }

    return prisma.performanceAgreement.update({
      where: { id },
      data: {
        notes: data.notes,
        supervisorId: data.supervisorId,
        strategicPlanId: data.strategicPlanId,
      },
      include: {
        user: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
      },
    });
  }

  async proposePK(id: string, callerId: string, isAdmin: boolean) {
    const pk = await prisma.performanceAgreement.findUnique({
      where: { id },
      include: { indicators: true },
    });

    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, callerId, isAdmin, { ownerOnly: true });
    if (pk.status !== PlanStatus.DRAFT) {
      throw Errors.badRequest('Only a DRAFT PK can be proposed');
    }
    if (pk.indicators.length === 0) {
      throw Errors.badRequest('PK must have at least one indicator');
    }

    const totalWeight = pk.indicators.reduce((sum, ind) => sum + ind.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw Errors.badRequest('Total weight of indicators must be 100%');
    }

    return prisma.performanceAgreement.update({
      where: { id },
      data: { status: PlanStatus.PROPOSED },
    });
  }

  async approvePK(id: string, callerId: string, isAdmin: boolean) {
    const pk = await prisma.performanceAgreement.findUnique({ where: { id } });
    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, callerId, isAdmin, { supervisorOnly: true });
    if (pk.status !== PlanStatus.PROPOSED) {
      throw Errors.badRequest('Only a PROPOSED PK can be approved');
    }

    return prisma.performanceAgreement.update({
      where: { id },
      data: {
        status: PlanStatus.APPROVED,
        approvedAt: new Date(),
      },
    });
  }

  async rejectPK(id: string, callerId: string, isAdmin: boolean, revisionNotes: string) {
    const pk = await prisma.performanceAgreement.findUnique({ where: { id } });
    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, callerId, isAdmin, { supervisorOnly: true });
    if (pk.status !== PlanStatus.PROPOSED) {
      throw Errors.badRequest('Only a PROPOSED PK can be sent back for revision');
    }

    return prisma.performanceAgreement.update({
      where: { id },
      data: { status: PlanStatus.DRAFT, revisionNotes },
    });
  }

  // ==================== INDICATORS ====================

  private async loadEditablePK(pkId: string, callerId: string, isAdmin: boolean) {
    const pk = await prisma.performanceAgreement.findUnique({ where: { id: pkId } });
    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, callerId, isAdmin);
    if (pk.status === PlanStatus.APPROVED) {
      throw Errors.badRequest('Indicators of an approved PK can no longer be changed');
    }
    return pk;
  }

  async createIndicator(
    callerId: string,
    isAdmin: boolean,
    data: {
      pkId: string;
      title: string;
      target: number;
      unit: string;
      weight: number;
      category: CascadingCategory;
      refIndicatorId?: string;
      refStrategicIndicatorId?: string;
      notes?: string;
    }
  ) {
    await this.loadEditablePK(data.pkId, callerId, isAdmin);

    // Cascading indicators must reference something above them.
    if (
      (data.category === CascadingCategory.DIRECT ||
        data.category === CascadingCategory.INDIRECT) &&
      !data.refIndicatorId &&
      !data.refStrategicIndicatorId
    ) {
      throw Errors.badRequest(
        'Direct/Indirect indicators must reference a superior PK indicator or a strategic plan indicator'
      );
    }

    return prisma.pKIndicator.create({
      data: {
        pkId: data.pkId,
        title: data.title,
        target: data.target,
        unit: data.unit,
        weight: data.weight,
        category: data.category,
        refIndicatorId: data.refIndicatorId,
        refStrategicIndicatorId: data.refStrategicIndicatorId,
        notes: data.notes,
      },
    });
  }

  async updateIndicator(
    id: string,
    callerId: string,
    isAdmin: boolean,
    data: Record<string, unknown>
  ) {
    const indicator = await prisma.pKIndicator.findUnique({ where: { id } });
    if (!indicator) throw Errors.notFound('Indicator');
    await this.loadEditablePK(indicator.pkId, callerId, isAdmin);

    return prisma.pKIndicator.update({ where: { id }, data });
  }

  async deleteIndicator(id: string, callerId: string, isAdmin: boolean) {
    const indicator = await prisma.pKIndicator.findUnique({ where: { id } });
    if (!indicator) throw Errors.notFound('Indicator');
    await this.loadEditablePK(indicator.pkId, callerId, isAdmin);

    return prisma.pKIndicator.delete({ where: { id } });
  }
}

export const pkService = new PerformanceAgreementService();
