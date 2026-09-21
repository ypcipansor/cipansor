import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { claimBlobForRecord, releaseBlobClaim } from '@/utils/blob-claim';
import { UnitType, Prisma } from '@prisma/client';
import { isFoundationScopedRole } from '@/utils/resolve-unit-id';
import type { ListUnitsQuery, CreateUnitInput, UpdateUnitInput } from './unit.schema';

export class UnitService {
  /**
   * Get all units with pagination
   */
  async findAll(
    query: ListUnitsQuery,
    currentUser: { role: string; roleCode?: string | null; unitId: string | null }
  ) {
    const { page, limit, search, type } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UnitWhereInput = {
      deletedAt: null,
    };

    // Unit-scoped roles see only their own unit. Foundation-scoped roles (the
    // yayasan board, plus SUPER_ADMIN) see all of them — this used to test
    // `role !== SUPER_ADMIN`, and because deriveLegacyRole() maps YAYASAN_* to
    // the legacy 'UNIT_ADMIN' string, the board fell into the unit branch with
    // a null unitId and got `where.id = 'none'`: an empty list on every
    // foundation-level screen.
    if (!isFoundationScopedRole(currentUser.roleCode)) {
      where.id = currentUser.unitId || 'none';
    }

    if (type) {
      where.type = type as UnitType;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [units, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              users: { where: { deletedAt: null } },
              students: { where: { deletedAt: null } },
              classes: { where: { deletedAt: null } },
            },
          },
        },
      }),
      prisma.unit.count({ where }),
    ]);

    return {
      units,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get unit by ID
   */
  async findById(id: string) {
    const unit = await prisma.unit.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            users: true,
            students: true,
            classes: true,
          },
        },
        classes: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            academicYear: {
              select: { id: true, name: true, isActive: true },
            },
          },
        },
      },
    });

    if (!unit) {
      throw Errors.notFound('Unit');
    }

    return unit;
  }

  /**
   * Create new unit
   */
  async create(input: CreateUnitInput, actorId?: string) {
    // Claim the unit logo before the row references it, so a concurrent discard
    // of a just-uploaded file cannot delete it between its reference probe and
    // this insert (BUG 4 / flag 9).
    const holderId = actorId ?? 'unit';
    if (input.logoUrl) {
      const claimed = await claimBlobForRecord(input.logoUrl, holderId);
      if (!claimed) {
        throw Errors.conflict('Logo unit sedang diproses pihak lain; unggah ulang berkas');
      }
    }
    try {
      const unit = await prisma.unit.create({
        data: {
          name: input.name,
          type: input.type as UnitType,
          address: input.address,
          phone: input.phone,
          email: input.email,
          logoUrl: input.logoUrl,
        },
      });

      return unit;
    } finally {
      if (input.logoUrl) {
        await releaseBlobClaim(input.logoUrl, holderId).catch(() => undefined);
      }
    }
  }

  /**
   * Update unit
   */
  async update(id: string, input: UpdateUnitInput, actorId?: string) {
    const unit = await prisma.unit.findFirst({
      where: { id, deletedAt: null },
    });

    if (!unit) {
      throw Errors.notFound('Unit');
    }

    const holderId = actorId ?? 'unit';
    if (input.logoUrl) {
      const claimed = await claimBlobForRecord(input.logoUrl, holderId);
      if (!claimed) {
        throw Errors.conflict('Logo unit sedang diproses pihak lain; unggah ulang berkas');
      }
    }
    try {
      const updated = await prisma.unit.update({
        where: { id },
        data: {
          name: input.name,
          type: input.type as UnitType | undefined,
          address: input.address,
          phone: input.phone,
          email: input.email,
          logoUrl: input.logoUrl,
        },
      });

      return updated;
    } finally {
      if (input.logoUrl) {
        await releaseBlobClaim(input.logoUrl, holderId).catch(() => undefined);
      }
    }
  }

  /**
   * Delete unit (soft delete)
   */
  async delete(id: string) {
    const unit = await prisma.unit.findFirst({
      where: { id, deletedAt: null },
    });

    if (!unit) {
      throw Errors.notFound('Unit');
    }

    // Check if unit has active users or students
    const counts = await prisma.unit.findFirst({
      where: { id },
      include: {
        _count: {
          select: {
            users: { where: { deletedAt: null } },
            students: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (counts?._count.users || counts?._count.students) {
      throw Errors.conflict('Cannot delete unit with active users or students');
    }

    await prisma.unit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Unit deleted successfully' };
  }
}

export const unitService = new UnitService();
