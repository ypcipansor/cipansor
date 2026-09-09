import { prisma } from '@/lib/prisma';
import { Prisma, WaveStatus } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { CreateWaveInput, UpdateWaveInput } from './ppdb-wave.schema';

type AuthUser = { id: string; role: string; roleCode?: string; unitId?: string | null };

function isSuperAdmin(actor: AuthUser): boolean {
  return actor.roleCode === 'SUPER_ADMIN' || actor.role === 'SUPER_ADMIN';
}

/**
 * Resolve a wave's admission-period unitId, or `null` when the wave (or its
 * period) does not exist.
 */
async function waveUnitId(waveId: string): Promise<string | null | undefined> {
  const wave = await prisma.admissionWave.findUnique({
    where: { id: waveId },
    select: { period: { select: { unitId: true } } },
  });
  return wave?.period?.unitId ?? null;
}

/**
 * Refuse a non-SUPER_ADMIN actor that does not belong to the wave's unit.
 * A null `unitId` on the actor is always rejected (no silent bypass of unit
 * scoping). Used by every by-id wave operation.
 */
async function assertWaveUnitAccess(waveId: string, actor?: AuthUser): Promise<void> {
  if (!actor || isSuperAdmin(actor)) return;
  if (!actor.unitId) {
    throw Errors.forbidden('Access to this unit is not allowed');
  }
  const unitId = await waveUnitId(waveId);
  if (unitId !== actor.unitId) {
    throw Errors.forbidden('Access to this unit is not allowed');
  }
}

/**
 * Scope a wave-list filter to the actor's unit. SUPER_ADMIN is exempt.
 */
function scopeWavesByUnit(where: Prisma.AdmissionWaveWhereInput, actor?: AuthUser) {
  if (actor && !isSuperAdmin(actor)) {
    if (!actor.unitId) {
      throw Errors.forbidden('Access to this unit is not allowed');
    }
    where = { ...where, period: { unitId: actor.unitId } };
  }
  return where;
}

export const waveService = {
  /**
   * Get all waves with pagination
   */
  async findAll(
    params: { page: number; limit: number; periodId?: string; status?: string },
    actor?: AuthUser
  ) {
    const { page, limit, periodId, status } = params;
    const skip = (page - 1) * limit;

    let where: Prisma.AdmissionWaveWhereInput = {
      ...(periodId && { periodId }),
      ...(status && { status: status as WaveStatus }),
    };
    // A non-SUPER_ADMIN may only list waves for their own unit.
    where = scopeWavesByUnit(where, actor);

    const [data, total] = await Promise.all([
      prisma.admissionWave.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ waveNumber: 'asc' }],
        include: {
          period: {
            select: {
              id: true,
              name: true,
              academicYear: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.admissionWave.count({ where }),
    ]);

    const wavesWithStats = data.map((wave) => ({
      ...wave,
      remainingQuota: wave.quota - wave.registeredCount,
      isFull: wave.registeredCount >= wave.quota,
    }));

    return {
      data: wavesWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get active waves for period (for public registration)
   */
  async findActiveForPeriod(periodId: string) {
    const now = new Date();

    const waves = await prisma.admissionWave.findMany({
      where: {
        periodId,
        status: 'OPEN',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { waveNumber: 'asc' },
    });

    return waves.map((wave) => ({
      id: wave.id,
      name: wave.name,
      waveNumber: wave.waveNumber,
      startDate: wave.startDate,
      endDate: wave.endDate,
      quota: wave.quota,
      registeredCount: wave.registeredCount,
      acceptedCount: wave.acceptedCount,
      remainingQuota: wave.quota - wave.registeredCount,
      isFull: wave.registeredCount >= wave.quota,
      registrationFee: wave.registrationFee,
      notes: wave.notes,
    }));
  },

  /**
   * Get wave by ID
   */
  async findById(id: string, actor?: AuthUser) {
    await assertWaveUnitAccess(id, actor);
    const wave = await prisma.admissionWave.findUnique({
      where: { id },
      include: {
        period: {
          include: {
            academicYear: true,
            unit: { select: { id: true, name: true } },
          },
        },
        registrants: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!wave) return null;

    return {
      ...wave,
      remainingQuota: wave.quota - wave.registeredCount,
      isFull: wave.registeredCount >= wave.quota,
    };
  },

  /**
   * Create wave
   */
  async create(input: CreateWaveInput, actor?: AuthUser) {
    // A non-SUPER_ADMIN may only create a wave for a period in their own unit.
    const periodUnit = await prisma.admissionPeriod.findUnique({
      where: { id: input.periodId },
      select: { unitId: true },
    });
    if (!periodUnit) {
      throw Errors.notFound('Admission period');
    }
    if (actor && !isSuperAdmin(actor)) {
      if (!actor.unitId) {
        throw Errors.forbidden('Access to this unit is not allowed');
      }
      if (periodUnit.unitId !== actor.unitId) {
        throw Errors.forbidden('Access to this unit is not allowed');
      }
    }

    // Check for duplicate wave number in same period
    const existing = await prisma.admissionWave.findFirst({
      where: {
        periodId: input.periodId,
        waveNumber: input.waveNumber,
      },
    });

    if (existing) {
      throw new Error(`Wave number ${input.waveNumber} already exists for this period`);
    }

    return prisma.admissionWave.create({
      data: {
        periodId: input.periodId,
        waveNumber: input.waveNumber,
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        quota: input.quota,
        registrationFee: input.registrationFee,
        status: input.status ?? 'UPCOMING',
        notes: input.notes,
      },
      include: {
        period: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Update wave
   */
  async update(id: string, input: UpdateWaveInput, actor?: AuthUser) {
    await assertWaveUnitAccess(id, actor);
    const data: any = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.waveNumber !== undefined) data.waveNumber = input.waveNumber;
    if (input.quota !== undefined) data.quota = input.quota;
    if (input.registrationFee !== undefined) data.registrationFee = input.registrationFee;
    if (input.status !== undefined) {
      data.status = input.status;
      // An operator explicitly setting the status is a *manual* decision, so the
      // wave is no longer "full purely by capacity". This is what stops a
      // hand-closed FULL wave (or an operator reopening one) from being silently
      // reopened later by `deleteRegistrant` when a registrant is removed.
      data.fullByCapacity = false;
    }
    if (input.notes !== undefined) data.notes = input.notes;
    // Use `!== undefined` for consistency with the other fields above. An
    // empty string would produce an Invalid Date, but Zod's `z.string()` does
    // not emit empty strings by default for these fields, and this guard
    // mirrors the "only touch explicitly provided fields" contract of a PATCH.
    if (input.startDate !== undefined) data.startDate = new Date(input.startDate);
    if (input.endDate !== undefined) data.endDate = new Date(input.endDate);

    // Cross-check date ordering against the persisted record. The schema-level
    // `.refine` in `updateWaveSchema` only runs when BOTH dates are provided
    // in the same request, so a caller can otherwise send only `endDate` (or
    // only `startDate`) that violates the existing record's invariant. Reject
    // the update here before Prisma persists `endDate <= startDate`.
    if (data.startDate !== undefined || data.endDate !== undefined) {
      const existing = await prisma.admissionWave.findUnique({
        where: { id },
        select: { startDate: true, endDate: true },
      });
      if (!existing) {
        throw new Error('Wave not found');
      }
      const effectiveStart = data.startDate ?? existing.startDate;
      const effectiveEnd = data.endDate ?? existing.endDate;
      if (effectiveEnd <= effectiveStart) {
        throw new Error('endDate must be after startDate');
      }
    }

    return prisma.admissionWave.update({
      where: { id },
      data,
      include: {
        period: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Delete wave
   */
  async delete(id: string, actor?: AuthUser) {
    await assertWaveUnitAccess(id, actor);
    // Check if wave has registrants
    const wave = await prisma.admissionWave.findUnique({
      where: { id },
    });

    if (wave && wave.registeredCount > 0) {
      throw new Error(
        `Cannot delete wave with ${wave.registeredCount} registrants. Remove registrants first.`
      );
    }

    return prisma.admissionWave.delete({
      where: { id },
    });
  },

  /**
   * Get wave statistics
   */
  async getStats(periodId: string, actor?: AuthUser) {
    // A non-SUPER_ADMIN may only read stats for a period in their own unit.
    const periodUnit = await prisma.admissionPeriod.findUnique({
      where: { id: periodId },
      select: { unitId: true },
    });
    if (periodUnit && actor && !isSuperAdmin(actor)) {
      if (!actor.unitId) {
        throw Errors.forbidden('Access to this unit is not allowed');
      }
      if (periodUnit.unitId !== actor.unitId) {
        throw Errors.forbidden('Access to this unit is not allowed');
      }
    }

    const waves = await prisma.admissionWave.findMany({
      where: { periodId },
      orderBy: { waveNumber: 'asc' },
    });

    const waveStats = waves.map((wave) => ({
      id: wave.id,
      name: wave.name,
      waveNumber: wave.waveNumber,
      quota: wave.quota,
      registeredCount: wave.registeredCount,
      acceptedCount: wave.acceptedCount,
      remainingQuota: wave.quota - wave.registeredCount,
      isFull: wave.registeredCount >= wave.quota,
      fillRate: Math.round((wave.registeredCount / wave.quota) * 100),
      acceptanceRate:
        wave.registeredCount > 0
          ? Math.round((wave.acceptedCount / wave.registeredCount) * 100)
          : 0,
      status: wave.status,
      startDate: wave.startDate,
      endDate: wave.endDate,
    }));

    const totalRegistrants = waveStats.reduce((sum, w) => sum + w.registeredCount, 0);
    const totalAccepted = waveStats.reduce((sum, w) => sum + w.acceptedCount, 0);
    const totalQuota = waveStats.reduce((sum, w) => sum + w.quota, 0);

    return {
      periodId,
      waveCount: waves.length,
      totalRegistrants,
      totalAccepted,
      totalQuota,
      overallFillRate: totalQuota > 0 ? Math.round((totalRegistrants / totalQuota) * 100) : 0,
      overallAcceptanceRate:
        totalRegistrants > 0 ? Math.round((totalAccepted / totalRegistrants) * 100) : 0,
      waves: waveStats,
    };
  },

  /**
   * Assign registrant to wave and increment count
   */
  async assignRegistrant(registrantId: string, waveId: string, actor?: AuthUser) {
    // Atomically increment registeredCount only if quota is not yet reached.
    // This prevents race conditions where concurrent requests could both pass
    // a non-atomic quota check and exceed the wave's quota.
    return prisma.$transaction(async (tx) => {
      const wave = await tx.admissionWave.findUnique({
        where: { id: waveId },
        select: {
          id: true,
          quota: true,
          periodId: true,
          period: { select: { unitId: true } },
        },
      });

      if (!wave) {
        throw Errors.notFound('Wave');
      }

      // A non-SUPER_ADMIN may only assign registrants to a wave in their own
      // unit, and only when the registrant belongs to the same admission
      // period as the target wave. This prevents cross-unit and cross-period
      // assignments that would silently move a registrant into another unit's
      // quota.
      if (actor && !isSuperAdmin(actor)) {
        if (!actor.unitId) {
          throw Errors.forbidden('Access to this unit is not allowed');
        }
        if (wave.period?.unitId !== actor.unitId) {
          throw Errors.forbidden('Access to this unit is not allowed');
        }
      }

      // Look up the registrant's current wave (if any) so we can decrement
      // the old wave's registeredCount when reassigning. Without this,
      // the old wave's count stays inflated forever.
      const existing = await tx.registrant.findUnique({
        where: { id: registrantId },
        select: { waveId: true, admissionPeriodId: true },
      });

      if (!existing) {
        throw Errors.notFound('Registrant');
      }

      // The registrant and the target wave must be in the same admission
      // period. Assigning across periods invites quota/status drift.
      if (existing.admissionPeriodId !== wave.periodId) {
        throw Errors.badRequest('Registrant dan gelombang harus berada pada periode yang sama');
      }

      // No-op if already assigned to the target wave.
      if (existing.waveId === waveId) {
        return tx.registrant.findUnique({
          where: { id: registrantId },
          include: {
            wave: { select: { id: true, name: true, waveNumber: true } },
          },
        });
      }

      // Atomic conditional update: only increments if registeredCount < quota.
      // updateMany returns count=0 if no rows matched, signaling the wave was full.
      const incrementResult = await tx.admissionWave.updateMany({
        where: {
          id: waveId,
          registeredCount: { lt: wave.quota },
        },
        data: { registeredCount: { increment: 1 } },
      });

      if (incrementResult.count === 0) {
        throw new Error('Wave quota is full');
      }

      // Decrement the previous wave's count (clamped at 0 to avoid negatives
      // in case of prior data drift).
      if (existing.waveId) {
        await tx.admissionWave.updateMany({
          where: { id: existing.waveId, registeredCount: { gt: 0 } },
          data: { registeredCount: { decrement: 1 } },
        });
      }

      const updatedRegistrant = await tx.registrant.update({
        where: { id: registrantId },
        data: { waveId },
        include: {
          wave: { select: { id: true, name: true, waveNumber: true } },
        },
      });

      return updatedRegistrant;
    });
  },

  /**
   * Get registrants by wave
   */
  async getRegistrantsByWave(
    waveId: string,
    params: {
      page: number;
      limit: number;
      status?: string;
    },
    actor?: AuthUser
  ) {
    await assertWaveUnitAccess(waveId, actor);
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.RegistrantWhereInput = {
      waveId,
      ...(status && {
        status: status as Prisma.RegistrantWhereInput["status"],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.registrant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admissionPeriod: { select: { id: true, name: true } },
        },
      }),
      prisma.registrant.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Update wave status automatically based on dates and quota
   */
  async updateWaveStatuses() {
    const now = new Date();

    // Mark waves as OPEN if start date has passed and they're UPCOMING
    await prisma.admissionWave.updateMany({
      where: {
        status: 'UPCOMING',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      data: { status: 'OPEN' },
    });

    // Mark waves as CLOSED if end date has passed. We must include both OPEN
    // and UPCOMING waves here: if `updateWaveStatuses` was never run while a
    // wave's period was active (e.g. the cron job was down, or the wave's
    // entire start..end window elapsed between two cron runs), an UPCOMING
    // wave would otherwise be permanently stranded — Step 1 above requires
    // `endDate >= now` to transition UPCOMING -> OPEN, so once `endDate < now`
    // the wave can never leave UPCOMING without this fallback.
    await prisma.admissionWave.updateMany({
      where: {
        status: { in: ['OPEN', 'UPCOMING'] },
        endDate: { lt: now },
      },
      data: { status: 'CLOSED' },
    });

    // Mark waves as FULL if quota is reached
    const fullWaves = await prisma.admissionWave.findMany({
      where: {
        status: 'OPEN',
      },
    });

    for (const wave of fullWaves) {
      if (wave.registeredCount >= wave.quota) {
        await prisma.admissionWave.update({
          where: { id: wave.id },
          // Capacity-driven full: mark it so deleteRegistrant may reopen it when
          // a slot frees up (operator-closed FULL waves stay closed).
          data: { status: 'FULL', fullByCapacity: true },
        });
      }
    }
  },
};

export default waveService;
