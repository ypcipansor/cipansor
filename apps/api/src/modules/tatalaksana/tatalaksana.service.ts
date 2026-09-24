import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';

export class TataLaksanaService {
  // ── SOP ───────────────────────────────────────────
  async getSOPs(params: { unitId?: string; status?: string; category?: string; search?: string }) {
    const where: Prisma.StandardOperatingProcedureWhereInput = {};
    if (params.unitId) where.unitId = params.unitId;
    if (params.status)
      where.status = params.status as Prisma.StandardOperatingProcedureWhereInput['status'];
    if (params.category) where.category = params.category;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search } },
        { documentNumber: { contains: params.search } },
      ];
    }

    return prisma.standardOperatingProcedure.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        _count: { select: { revisions: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getSOP(id: string) {
    return prisma.standardOperatingProcedure.findUniqueOrThrow({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        revisions: {
          orderBy: { version: 'desc' },
          include: { revisedBy: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async createSOP(data: {
    unitId: string;
    documentNumber: string;
    title: string;
    description?: string;
    category: string;
    content?: string;
    scope?: string;
    responsibility?: string;
    effectiveDate?: Date;
    reviewDate?: Date;
    createdById: string;
  }) {
    return prisma.standardOperatingProcedure.create({ data });
  }

  async updateSOP(
    id: string,
    data: Partial<{
      title: string;
      description: string;
      category: string;
      content: string;
      scope: string;
      responsibility: string;
      effectiveDate: Date;
      reviewDate: Date;
      status: any;
    }>
  ) {
    return prisma.standardOperatingProcedure.update({ where: { id }, data });
  }

  async approveSOP(id: string, approvedById: string) {
    return prisma.standardOperatingProcedure.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById,
        approvedAt: new Date(),
      },
    });
  }

  async activateSOP(id: string) {
    return prisma.standardOperatingProcedure.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async createRevision(data: {
    sopId: string;
    changeNotes: string;
    content?: string;
    revisedById: string;
  }) {
    // Get current SOP to increment version
    const sop = await prisma.standardOperatingProcedure.findUniqueOrThrow({
      where: { id: data.sopId },
    });

    const newVersion = sop.version + 1;

    // Create revision and update SOP version in transaction
    return prisma.$transaction(async (tx) => {
      const revision = await tx.sOPRevision.create({
        data: {
          sopId: data.sopId,
          version: newVersion,
          changeNotes: data.changeNotes,
          content: data.content || sop.content,
          revisedById: data.revisedById,
        },
      });

      await tx.standardOperatingProcedure.update({
        where: { id: data.sopId },
        data: {
          version: newVersion,
          content: data.content || undefined,
          status: 'REVIEW',
        },
      });

      return revision;
    });
  }

  async deleteSOP(id: string) {
    return prisma.standardOperatingProcedure.delete({ where: { id } });
  }

  async getSOPSummary(unitId?: string) {
    const where = unitId ? { unitId } : {};
    const [total, active, draft, deprecated] = await Promise.all([
      prisma.standardOperatingProcedure.count({ where }),
      prisma.standardOperatingProcedure.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.standardOperatingProcedure.count({ where: { ...where, status: 'DRAFT' } }),
      prisma.standardOperatingProcedure.count({ where: { ...where, status: 'DEPRECATED' } }),
    ]);

    // Get counts by category
    const byCategory = await prisma.standardOperatingProcedure.groupBy({
      by: ['category'],
      where,
      _count: true,
    });

    return {
      total,
      active,
      draft,
      deprecated,
      byCategory: byCategory.reduce(
        (acc, item) => {
          acc[item.category] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }
}

export const tataLaksanaService = new TataLaksanaService();
