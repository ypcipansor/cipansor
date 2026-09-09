import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../../config';
import { prisma } from '../../lib/prisma';
import { Prisma, AdmissionStatus, Gender } from '@prisma/client';
import type { CreatePublicRegistrantDocumentRequest } from '@cipansor/shared';
import * as financeService from '../finance/finance.service';
import {
  CreateAdmissionPeriodInput,
  UpdateAdmissionPeriodInput,
  CreateRegistrantInput,
  UpdateRegistrantInput,
  UpdateRegistrantScoreInput,
  UpdateRegistrantStatusInput,
  RecordRegistrationFeeInput,
  CreateRegistrantDocumentInput,
} from './admissions.schema';
import { Errors } from '../../middleware/error';

type AuthUser = { id: string; role: string; roleCode?: string; unitId?: string | null };

function isSuperAdmin(actor: AuthUser): boolean {
  return actor.roleCode === 'SUPER_ADMIN' || actor.role === 'SUPER_ADMIN';
}

/**
 * Server-side unit scoping for any by-id registrant operation.
 * SUPER_ADMIN is exempt; every other actor must belong to the registrant's
 * admission period unit, otherwise the request is refused with 403.
 */
export async function assertRegistrantUnitAccess(id: string, actor: AuthUser): Promise<void> {
  if (isSuperAdmin(actor)) return;
  const actorUnitId = actor.unitId;
  if (!actorUnitId) {
    throw Errors.forbidden('Access to this unit is not allowed');
  }
  const registrant = await prisma.registrant.findUnique({
    where: { id },
    select: { admissionPeriod: { select: { unitId: true } } },
  });
  if (!registrant) {
    throw Errors.notFound('Registrant');
  }
  if (registrant.admissionPeriod?.unitId !== actorUnitId) {
    throw Errors.forbidden('Access to this unit is not allowed');
  }
}

/**
 * Server-side unit scoping for by-id document operations, resolved through the
 * owning registrant's admission period unit.
 */
async function assertDocumentUnitAccess(id: string, actor: AuthUser): Promise<void> {
  if (isSuperAdmin(actor)) return;
  const actorUnitId = actor.unitId;
  if (!actorUnitId) {
    throw Errors.forbidden('Access to this unit is not allowed');
  }
  const document = await prisma.registrantDocument.findUnique({
    where: { id },
    select: { registrant: { select: { admissionPeriod: { select: { unitId: true } } } } },
  });
  if (!document) {
    throw Errors.notFound('Document');
  }
  if (document.registrant?.admissionPeriod?.unitId !== actorUnitId) {
    throw Errors.forbidden('Access to this unit is not allowed');
  }
}

// `CreateRegistrantInput` already defines `source` and `campaignId` as
// optional (see `createRegistrantSchema` in ./schema.ts), so there's no need
// for a separate "extended" interface here.
type CreateRegistrantExtendedInput = CreateRegistrantInput;

// =====================================
// ADMISSION PERIOD SERVICE
// =====================================

export async function getAdmissionPeriods(params: {
  page: number;
  limit: number;
  unitId?: string;
  academicYearId?: string;
  isActive?: boolean;
}) {
  const { page, limit, unitId, academicYearId, isActive } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.AdmissionPeriodWhereInput = {};

  if (unitId) where.unitId = unitId;
  if (academicYearId) where.academicYearId = academicYearId;
  if (isActive !== undefined) where.isActive = isActive;

  const [data, total] = await Promise.all([
    prisma.admissionPeriod.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startDate: 'desc' },
      include: {
        unit: { select: { id: true, name: true, type: true } },
        academicYear: { select: { id: true, name: true } },
        _count: { select: { registrants: true } },
      },
    }),
    prisma.admissionPeriod.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getAdmissionPeriodById(id: string) {
  return prisma.admissionPeriod.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, name: true, type: true } },
      academicYear: { select: { id: true, name: true } },
      _count: { select: { registrants: true } },
    },
  });
}

/**
 * Public PPDB tracking lookup. Requires BOTH the registration number and the
 * registrant's birth date (matched on the calendar day) so the record cannot
 * be enumerated from a registration number alone. Returns null when either
 * factor does not match.
 */
export async function getRegistrantTrackingInfo(registrationNo: string, birthDate: Date) {
  const startOfDay = new Date(birthDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(birthDate);
  endOfDay.setHours(23, 59, 59, 999);

  return prisma.registrant.findFirst({
    where: {
      registrationNo,
      birthDate: { gte: startOfDay, lte: endOfDay },
    },
    select: {
      id: true,
      registrationNo: true,
      fullName: true,
      status: true,
      testScore: true,
      interviewScore: true,
      tahfidzScore: true,
      acceptedAt: true,
      enrolledAt: true,
      createdAt: true,
      admissionPeriod: {
        select: { name: true, unit: { select: { name: true } } },
      },
      documents: {
        select: { id: true, name: true, isVerified: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

export async function createAdmissionPeriod(data: CreateAdmissionPeriodInput) {
  return prisma.admissionPeriod.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      ...data,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      registrationFee: new Prisma.Decimal(data.registrationFee),
    } as any,
  });
}

export async function updateAdmissionPeriod(id: string, data: UpdateAdmissionPeriodInput) {
  return prisma.admissionPeriod.update({
    where: { id },
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      registrationFee:
        data.registrationFee !== undefined ? new Prisma.Decimal(data.registrationFee) : undefined,
    },
  });
}

export async function deleteAdmissionPeriod(id: string) {
  // Check if period has registrants
  const period = await prisma.admissionPeriod.findUnique({
    where: { id },
    include: { _count: { select: { registrants: true } } },
  });

  if (period?._count.registrants && period._count.registrants > 0) {
    throw new Error('Cannot delete admission period with registrants');
  }

  return prisma.admissionPeriod.delete({ where: { id } });
}

export async function getAdmissionPeriodStats(id: string) {
  const period = await prisma.admissionPeriod.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
    },
  });

  if (!period) return null;

  const statusCounts = await prisma.registrant.groupBy({
    by: ['status'],
    where: { admissionPeriodId: id },
    _count: { status: true },
  });

  const genderCounts = await prisma.registrant.groupBy({
    by: ['gender'],
    where: { admissionPeriodId: id },
    _count: { gender: true },
  });

  const totalRegistrants = await prisma.registrant.count({
    where: { admissionPeriodId: id },
  });

  return {
    period,
    totalRegistrants,
    quota: period.quota,
    remaining: Math.max(0, period.quota - totalRegistrants),
    byStatus: statusCounts.reduce(
      (acc, item) => ({ ...acc, [item.status]: item._count.status }),
      {} as Record<string, number>
    ),
    byGender: genderCounts.reduce(
      (acc, item) => ({ ...acc, [item.gender]: item._count.gender }),
      {} as Record<string, number>
    ),
  };
}

// =====================================
// REGISTRANT SERVICE
// =====================================

async function generateRegistrationNo(
  admissionPeriodId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string> {
  const period = await client.admissionPeriod.findUnique({
    where: { id: admissionPeriodId },
    include: { unit: true, academicYear: true },
  });

  if (!period) throw new Error('Admission period not found');

  const year = period.academicYear.name.split('/')[0];
  const count = await client.registrant.count({
    where: { admissionPeriodId },
  });

  // Include a short period-scoped suffix so two distinct AdmissionPeriods in
  // the same academic year cannot generate the same `registrationNo`. The
  // model's `registrationNo @unique` is GLOBAL (see prisma/schema.prisma:
  // `registrationNo String @unique`), so without this suffix two periods
  // would collide on `REG-{year}-{count+1}` and the retry loop in
  // `createRegistrant` would loop until MAX_ATTEMPTS, surfacing a 500.
  // Use the first 4 hex chars of the period UUID — short enough to keep the
  // human-readable format compact, but unique enough across periods.
  const periodSuffix = admissionPeriodId.replace(/-/g, '').slice(0, 4).toUpperCase();

  return `REG-${year}-${periodSuffix}-${String(count + 1).padStart(5, '0')}`;
}

export async function getRegistrants(
  params: {
    page: number;
    limit: number;
    admissionPeriodId?: string;
    status?: AdmissionStatus;
    gender?: 'MALE' | 'FEMALE';
    search?: string;
  },
  actor?: AuthUser
) {
  const { page, limit, admissionPeriodId, status, gender, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.RegistrantWhereInput = {};

  if (admissionPeriodId) where.admissionPeriodId = admissionPeriodId;
  if (status) where.status = status;
  if (gender) where.gender = gender as Gender;

  // Server-side unit scoping: SUPER_ADMIN sees all; non-SUPER_ADMIN is restricted to their unitId
  if (actor && actor.role !== 'SUPER_ADMIN' && actor.unitId) {
    where.admissionPeriod = { ...(where.admissionPeriod as any), unitId: actor.unitId };
  }

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { registrationNo: { contains: search, mode: 'insensitive' } },
      { parentName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.registrant.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        admissionPeriod: {
          select: { id: true, name: true, unit: { select: { id: true, name: true } } },
        },
        campaign: {
          select: { id: true, name: true, code: true },
        },
        _count: { select: { documents: true } },
      },
    }),
    prisma.registrant.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getRegistrantById(id: string, actor?: AuthUser) {
  const registrant = await prisma.registrant.findUnique({
    where: { id },
    include: {
      admissionPeriod: {
        select: {
          id: true,
          name: true,
          registrationFee: true,
          unitId: true,
          unit: { select: { id: true, name: true, type: true } },
          academicYear: { select: { id: true, name: true } },
        },
      },
      documents: { orderBy: { createdAt: 'desc' } },
      student: { select: { id: true, nis: true, userId: true } },
    },
  });

  if (registrant && actor) {
    if (!isSuperAdmin(actor)) {
      const actorUnitId = actor.unitId;
      if (!actorUnitId || registrant.admissionPeriod?.unitId !== actorUnitId) {
        throw Errors.forbidden('Access to this unit is not allowed');
      }
    }
  }

  return registrant;
}

export async function createPublicRegistrantService(data: CreateRegistrantExtendedInput) {
  const period = await prisma.admissionPeriod.findUnique({
    where: { id: data.admissionPeriodId },
    select: { isActive: true, startDate: true, endDate: true },
  });

  if (!period) {
    throw Errors.notFound('Admission period');
  }

  const now = new Date();
  if (!period.isActive || now < period.startDate || now > period.endDate) {
    throw Errors.badRequest('Admission period is not open for registration');
  }

  const registrant = await createRegistrant(data, false);

  const crypto = await import('crypto');
  const timestampHex = Date.now().toString(16);
  const hmacHex = crypto.createHmac('sha256', config.jwt.secret).update(`${registrant.id}:${timestampHex}`).digest('hex').slice(0, 16);
  const registrationToken = `${timestampHex}.${hmacHex}`;

  return {
    id: registrant.id,
    registrationNo: registrant.registrationNo,
    registrationToken,
    fullName: registrant.fullName,
    status: registrant.status,
    createdAt: registrant.createdAt,
  };
}

export async function createRegistrant(data: CreateRegistrantExtendedInput, isAdmin: boolean = true) {
  // Race-safety: `generateRegistrationNo` derives the next number from
  // `count(*) + 1`. Under PostgreSQL's default READ COMMITTED isolation,
  // two concurrent transactions can read the same count and try to insert
  // the same `registrationNo`, which then fails the unique constraint
  // (`Registrant.registrationNo @unique`) with Prisma error P2002. Retry
  // a small number of times so the second/third concurrent caller gets a
  // valid sequential number instead of a 500.
  const MAX_ATTEMPTS = 5;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await createRegistrantOnce(data, isAdmin);
    } catch (err) {
      lastError = err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray((err.meta as { target?: string[] } | undefined)?.target) &&
        (err.meta as { target: string[] }).target.includes('registrationNo')
      ) {
        // Collision on registrationNo — retry with a fresh count.
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function createRegistrantOnce(data: CreateRegistrantExtendedInput, isAdmin: boolean = true) {
  return prisma.$transaction(async (tx) => {
    const registrationNo = await generateRegistrationNo(data.admissionPeriodId, tx);

    // Map Zod input fields to the actual Prisma Registrant model.
    // The schema accepts richer father/mother/address breakdowns for UX,
    // but the persisted model uses consolidated parent* fields and does
    // not have columns for nickname / nationalId / familyCardNumber /
    // village / district / city / province / postalCode /
    // previousSchoolAddress / graduationYear / fatherEmail /
    // fatherOccupation / motherOccupation. Spreading would cause Prisma
    // to reject unknown args at runtime.
    const parentName = data.fatherName || data.motherName;
    const parentPhone = data.fatherPhone || data.motherPhone || '';
    const parentEmail = data.fatherEmail && data.fatherEmail !== '' ? data.fatherEmail : undefined;
    const parentOccupation = data.fatherOccupation || data.motherOccupation;

    // Check if the admission period defines any waves.
    const totalWaves = tx.admissionWave
      ? await tx.admissionWave.count({ where: { periodId: data.admissionPeriodId } })
      : 0;

    let waveId: string | undefined = undefined;

    if (totalWaves > 0) {
      // Look up all open waves for the period ordered by waveNumber asc
      // to atomically claim a slot in the first wave that has capacity.
      const now = new Date();
      const candidateWaves = tx.admissionWave
        ? await tx.admissionWave.findMany({
            where: {
              periodId: data.admissionPeriodId,
              status: { in: ['OPEN', 'FULL'] },
              startDate: { lte: now },
              endDate: { gte: now },
            },
            orderBy: { waveNumber: 'asc' },
          })
        : [];

      if ((tx as any).$executeRaw) {
        // Acquire row-level locks on candidate waves to prevent concurrent quota race conditions
        await (tx as any).$executeRaw`SELECT id FROM "admission_waves" WHERE "period_id" = ${data.admissionPeriodId} FOR UPDATE`;
      }

      let waveClaimed = false;
      for (const wave of candidateWaves) {
        const freshWave = await tx.admissionWave.findUnique({
          where: { id: wave.id },
          select: { id: true, registeredCount: true, quota: true, status: true },
        });

        if (!freshWave || freshWave.registeredCount >= freshWave.quota) {
          continue;
        }

        const claim = await tx.admissionWave.updateMany({
          where: {
            id: wave.id,
            status: { in: ['OPEN', 'FULL'] },
            registeredCount: { lt: freshWave.quota },
          },
          data: {
            registeredCount: { increment: 1 },
          },
        });

        if (claim.count === 1) {
          const updatedWave = await tx.admissionWave.findUnique({
            where: { id: wave.id },
            select: { id: true, registeredCount: true, quota: true, status: true },
          });

          if (updatedWave && updatedWave.registeredCount >= updatedWave.quota && updatedWave.status !== 'FULL') {
            await tx.admissionWave.update({
              where: { id: wave.id },
              data: { status: 'FULL' },
            });
          }

          waveId = wave.id;
          waveClaimed = true;
          break;
        }
      }

      if (!waveClaimed && !isAdmin) {
        throw Errors.badRequest('Semua gelombang pendaftaran pada periode ini telah penuh atau ditutup');
      }
    }

    const registrant = await tx.registrant.create({
      data: {
        admissionPeriodId: data.admissionPeriodId,
        waveId,
        registrationNo,
        fullName: data.fullName,
        name: data.fullName, // legacy column, kept in sync
        gender: data.gender as Gender,
        birthPlace: data.birthPlace,
        birthDate: new Date(data.birthDate),
        address: data.address,
        phone: data.phone,
        email: data.email && data.email !== '' ? data.email : undefined,
        previousSchool: data.previousSchool,
        quranAbility: data.quranAbility,
        memorizedJuz: data.memorizedJuz,
        parentName,
        parentPhone,
        parentEmail,
        parentOccupation,
        notes: data.notes,
        source: data.source,
        campaignId: data.campaignId,
      },
    });

    // Best Practice: Ensure a REG_FEE payment type exists so that the
    // registration-fee invoice can be created automatically at enrollment
    // time (when a real studentId is available). We deliberately do NOT
    // create the Invoice here: the Invoice schema requires a non-null
    // studentId, and the registrant has not yet been promoted to a Student.
    // Creating an invoice with `studentId: ''` would fail with a Prisma
    // foreign-key error and abort the entire transaction.
    const period = await tx.admissionPeriod.findUnique({
      where: { id: data.admissionPeriodId },
    });

    if (period && Number(period.registrationFee) > 0) {
      // Use an atomic upsert on the `(unitId, code)` composite unique key
      // (see `@@unique([unitId, code])` on the PaymentType model in
      // prisma/schema.prisma). The previous `findFirst` + conditional
      // `create` pattern is NOT atomic under Postgres' default READ
      // COMMITTED isolation: two concurrent first-registrations for the
      // same unit can both observe `existing === null`, both call
      // `create`, and the second one fails with a P2002 unique-constraint
      // violation that aborts the entire createRegistrant transaction
      // (the retry loop in `createRegistrant` only handles `registrationNo`
      // collisions, so this would surface as a 500). `upsert` leans on
      // Postgres' `INSERT ... ON CONFLICT DO UPDATE` semantics and is
      // race-safe. The `update` clause is a no-op so that re-running this
      // path doesn't clobber admin-edited fields (name, amount, etc.).
      await tx.paymentType.upsert({
        where: { unitId_code: { unitId: period.unitId, code: 'REG_FEE' } },
        create: {
          unitId: period.unitId,
          code: 'REG_FEE',
          name: 'Biaya Pendaftaran',
          amount: period.registrationFee,
          isActive: true,
          isRecurring: false,
        },
        update: {},
      });
    }

    return registrant;
  });
}

export async function updateRegistrant(id: string, data: UpdateRegistrantInput, actor?: AuthUser) {
  if (actor) await assertRegistrantUnitAccess(id, actor);
  // Map Zod input fields to the actual Prisma Registrant model.
  // The schema accepts `fatherName` / `fatherPhone` / `motherName` /
  // `motherPhone` for UX parity with create, but the persisted model uses
  // consolidated `parentName` / `parentPhone` columns. Spreading the raw
  // input would cause Prisma to reject unknown args at runtime.
  const { fatherName, fatherPhone, motherName, motherPhone, fullName, email, ...rest } = data;

  const parentName =
    fatherName !== undefined || motherName !== undefined ? fatherName || motherName : undefined;
  const parentPhone =
    fatherPhone !== undefined || motherPhone !== undefined ? fatherPhone || motherPhone : undefined;

  // Normalise empty-string email to `null` to mirror `createRegistrantOnce`,
  // which maps `''` -> `undefined` (persisted as NULL). Without this, a PUT
  // carrying `{ email: "" }` would store `""` in the DB while the same value
  // on create stores NULL — breaking downstream `if (registrant.email)`
  // checks and risking duplicate-empty-string collisions if `email` ever
  // becomes @unique.
  const normalisedEmail = email === undefined ? undefined : email === '' ? null : email;

  return prisma.registrant.update({
    where: { id },
    data: {
      ...rest,
      ...(fullName !== undefined ? { fullName, name: fullName } : {}),
      ...(parentName !== undefined ? { parentName } : {}),
      ...(parentPhone !== undefined ? { parentPhone } : {}),
      ...(normalisedEmail !== undefined ? { email: normalisedEmail } : {}),
    },
  });
}

export async function updateRegistrantScore(id: string, data: UpdateRegistrantScoreInput, actor?: AuthUser) {
  if (actor) await assertRegistrantUnitAccess(id, actor);
  // Only advance status to TEST_COMPLETED when:
  //   1. At least one actual score (test/interview/tahfidz) was provided, AND
  //   2. The registrant is still in a pre-test phase.
  // Recording only notes — or recording a score on someone already
  // ACCEPTED / REJECTED / ENROLLED / CANCELLED — must not change their status.
  //
  // The read+write are wrapped in a single interactive transaction so that a
  // concurrent updateRegistrantStatus() (e.g. moving the registrant to
  // ACCEPTED) cannot slip in between the status read and the update below
  // and get clobbered back to TEST_COMPLETED.
  const hasScore =
    data.testScore !== undefined ||
    data.interviewScore !== undefined ||
    data.tahfidzScore !== undefined;

  const preTestStatuses: AdmissionStatus[] = [
    AdmissionStatus.REGISTERED,
    AdmissionStatus.DOCUMENT_CHECK,
    AdmissionStatus.TEST_SCHEDULED,
  ];

  return prisma.$transaction(async (tx) => {
    const current = await tx.registrant.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!current) throw new Error('Registrant not found');

    const shouldAdvanceStatus = hasScore && preTestStatuses.includes(current.status);

    return tx.registrant.update({
      where: { id },
      data: {
        testScore: data.testScore !== undefined ? new Prisma.Decimal(data.testScore) : undefined,
        interviewScore:
          data.interviewScore !== undefined ? new Prisma.Decimal(data.interviewScore) : undefined,
        tahfidzScore:
          data.tahfidzScore !== undefined ? new Prisma.Decimal(data.tahfidzScore) : undefined,
        notes: data.notes,
        ...(shouldAdvanceStatus ? { status: AdmissionStatus.TEST_COMPLETED } : {}),
      },
    });
  });
}

/**
 * Record daftar ulang payment for a registrant.
 *
 * The counterpart to the enrolment gate. Adding the gate without this would
 * have left an admin told "belum melunasi" with no way to say otherwise — a
 * rule with no door through it, which stops the SPMB flow rather than
 * ordering it.
 */
export async function recordRegistrationFee(
  id: string,
  data: RecordRegistrationFeeInput,
  verifiedById: string,
  actor?: AuthUser
) {
  const registrant = await prisma.registrant.findUnique({
    where: { id },
    include: {
      admissionPeriod: { select: { registrationFee: true, unitId: true } },
      wave: { select: { registrationFee: true } },
    },
  });

  if (!registrant) throw Errors.notFound('Registrant');

  if (actor && !isSuperAdmin(actor)) {
    const actorUnitId = actor.unitId;
    if (!actorUnitId || registrant.admissionPeriod?.unitId !== actorUnitId) {
      throw Errors.forbidden('Access to this unit is not allowed');
    }
  }

  // A wave may override its parent period's registrationFee, so the amount
  // recorded should be what the registrant actually owed. Wave wins when set.
  const effectiveFee =
    registrant.wave?.registrationFee ?? registrant.admissionPeriod?.registrationFee ?? null;

  return prisma.registrant.update({
    where: { id },
    data: {
      registrationFeePaidAt: data.paidAt ?? new Date(),
      // Falls back to what the period/wave charges, so the common "paid in
      // full" case needs no amount and the record still says how much.
      registrationFeeAmount: data.amount != null ? data.amount : effectiveFee,
      registrationFeeVerifiedById: verifiedById,
      registrationFeeNote: data.note,
    },
  });
}

export async function updateRegistrantStatus(id: string, data: UpdateRegistrantStatusInput, actor?: AuthUser) {
  if (actor) await assertRegistrantUnitAccess(id, actor);
  // Guard: ENROLLED is a terminal status that must only be reached through
  // `enrollRegistrant`, which atomically creates the User + Student records,
  // assigns class/room, generates the registration-fee invoice, and adjusts
  // wave counters. Allowing the status endpoint to set ENROLLED directly
  // would leave the registrant marked as enrolled but without any of those
  // side effects — a corrupt half-state that subsequent `enrollRegistrant`
  // calls cannot recover from (they require status === ACCEPTED).
  // The schema accepts `z.nativeEnum(AdmissionStatus)` so this check has to
  // live here at the service layer.
  if (data.status === AdmissionStatus.ENROLLED) {
    throw new Error('Cannot set status to ENROLLED directly; use the enrollment endpoint instead');
  }

  return prisma.$transaction(async (tx) => {
    // Read the previous status BEFORE updating so we can detect actual
    // transitions and avoid double-counting wave acceptance metrics.
    const previous = await tx.registrant.findUnique({
      where: { id },
      select: { status: true, waveId: true },
    });

    if (!previous) {
      throw new Error('Registrant not found');
    }

    // Guard: ENROLLED is a terminal status that was reached through
    // `enrollRegistrant` (which atomically created User + Student records,
    // class/room assignments, and the registration-fee invoice). Allowing
    // a transition AWAY from ENROLLED here (e.g. to REJECTED or CANCELLED)
    // would mark the registrant as un-enrolled while leaving all of those
    // downstream records in place — a corrupt half-state that the system
    // has no automated recovery path for. Un-enrollment must go through a
    // dedicated endpoint that tears down the side effects in the same
    // transaction.
    if (previous.status === AdmissionStatus.ENROLLED) {
      throw new Error(
        'Cannot change status of an enrolled registrant; un-enrollment must be handled through a dedicated endpoint'
      );
    }

    const updateData: Prisma.RegistrantUpdateInput = {
      status: data.status,
      notes: data.notes,
    };

    if (data.status === AdmissionStatus.ACCEPTED) {
      updateData.acceptedAt = new Date();
    }

    const registrant = await tx.registrant.update({
      where: { id },
      data: updateData,
    });

    // Best Practice: Trigger automated notification on status change
    // Search for registrant with parent info for notification
    const regWithParent = await tx.registrant.findUnique({
      where: { id },
      include: {
        admissionPeriod: { select: { name: true } },
      },
    });

    if (regWithParent && regWithParent.parentPhone) {
      // Notification could be sent here via WhatsApp/Push
    }

    // Best Practice: Update wave statistics if wave is linked.
    // Only adjust acceptedCount on real transitions into / out of ACCEPTED
    // so the counter stays consistent across re-accepts and reverts.
    if (registrant.waveId) {
      const wasAccepted = previous.status === AdmissionStatus.ACCEPTED;
      const isAccepted = data.status === AdmissionStatus.ACCEPTED;

      if (!wasAccepted && isAccepted) {
        await tx.admissionWave.update({
          where: { id: registrant.waveId },
          data: { acceptedCount: { increment: 1 } },
        });
      } else if (wasAccepted && !isAccepted) {
        await tx.admissionWave.updateMany({
          where: { id: registrant.waveId, acceptedCount: { gt: 0 } },
          data: { acceptedCount: { decrement: 1 } },
        });
      }
    }

    return registrant;
  });
}

/**
 * Enroll an ACCEPTED registrant as a Student.
 *
 * IMPORTANT — DUAL ENROLLMENT PATHS:
 * There is a second enrollment entry point in
 * `apps/api/src/services/integration/student-onboarding.orchestrator.ts`
 * (`StudentOnboardingOrchestrator.processEnrollment`) used by
 * `POST /api/admissions/waves/onboard-registrant` and the frontend
 * `useOnboardRegistrant` hook. The two paths diverge in scope:
 *
 *   - This function (`enrollRegistrant`):
 *       * Caller-supplied NIS (no auto-generation)
 *       * Creates User + Student
 *       * Generates REG_FEE invoice
 *       * Decrements wave `acceptedCount`
 *       * No parent account, no medical record, no wallet, no events
 *
 *   - `StudentOnboardingOrchestrator.processEnrollment`:
 *       * Auto-generates NIS via Postgres advisory lock
 *       * Creates User + Student
 *       * Creates parent User (PARENT role) + StudentParent link
 *       * Creates initial MedicalRecord
 *       * Creates SantriWallet
 *       * Emits `student:created`, `health:medical-record-created`,
 *         `notification:send`, `email:send_reset_token` on the eventBus
 *       * Does NOT generate REG_FEE invoice
 *       * Does NOT decrement wave `acceptedCount`
 *
 * If you change ANY business rule for enrollment (mandatory wallet,
 * mandatory medical record, mandatory invoice, NIS format, status
 * transitions, wave-counter handling, …), update BOTH paths or document
 * an explicit reason for the divergence here. Failing to do so leaves
 * student records in inconsistent states depending on which API the
 * caller used.
 */
export async function enrollRegistrant(
  registrantId: string,
  studentData: {
    nis?: string;
    nisn?: string;
    classId?: string;
    roomId?: string;
    processedById?: string;
  },
  actor?: AuthUser
) {
  const registrant = await prisma.registrant.findUnique({
    where: { id: registrantId },
    include: { admissionPeriod: true },
  });

  if (!registrant) throw new Error('Registrant not found');

  if (actor && !isSuperAdmin(actor)) {
    const actorUnitId = actor.unitId;
    if (!actorUnitId || registrant.admissionPeriod?.unitId !== actorUnitId) {
      throw Errors.forbidden('Access to this unit is not allowed');
    }
  }

  const { StudentOnboardingOrchestrator } = await import(
    '../../services/integration/student-onboarding.orchestrator'
  );

  const result = await StudentOnboardingOrchestrator.processEnrollment(
    registrantId,
    registrant.admissionPeriod.unitId,
    studentData.processedById || 'system',
    {
      nis: studentData.nis,
      nisn: studentData.nisn,
      classId: studentData.classId,
      assignedClassId: studentData.classId,
      roomId: studentData.roomId,
      academicYearId: registrant.admissionPeriod.academicYearId,
    }
  );

  return result;
}

export async function deleteRegistrant(id: string, actor?: AuthUser) {
  if (actor) await assertRegistrantUnitAccess(id, actor);
  // Wrap the read + decrement + delete in a single transaction so that the
  // wave's `registeredCount` (and `acceptedCount` if the registrant was
  // ACCEPTED) stays in sync with the registrants that actually exist.
  // Without this, deleting a registrant that was assigned to a wave would
  // leave the wave's counters permanently inflated, eventually marking
  // waves as FULL even when slots are free.
  return prisma.$transaction(async (tx) => {
    const registrant = await tx.registrant.findUnique({
      where: { id },
      select: { status: true, waveId: true },
    });

    if (!registrant) {
      throw new Error('Registrant not found');
    }

    if (registrant.status === AdmissionStatus.ENROLLED) {
      throw new Error('Cannot delete enrolled registrant');
    }

    if (registrant.waveId) {
      await tx.admissionWave.updateMany({
        where: { id: registrant.waveId, registeredCount: { gt: 0 } },
        data: { registeredCount: { decrement: 1 } },
      });

      const wave = await tx.admissionWave.findUnique({
        where: { id: registrant.waveId },
        select: { id: true, status: true, registeredCount: true, quota: true, startDate: true, endDate: true },
      });
      const now = new Date();
      if (
        wave &&
        wave.status === 'FULL' &&
        wave.registeredCount < wave.quota &&
        wave.startDate <= now &&
        wave.endDate >= now
      ) {
        await tx.admissionWave.update({
          where: { id: wave.id },
          data: { status: 'OPEN' },
        });
      }

      if (registrant.status === AdmissionStatus.ACCEPTED) {
        await tx.admissionWave.updateMany({
          where: { id: registrant.waveId, acceptedCount: { gt: 0 } },
          data: { acceptedCount: { decrement: 1 } },
        });
      }
    }

    return tx.registrant.delete({ where: { id } });
  });
}

// =====================================
// REGISTRANT DOCUMENT SERVICE
// =====================================

export async function getRegistrantDocuments(registrantId: string, actor?: AuthUser) {
  if (actor) await assertRegistrantUnitAccess(registrantId, actor);
  return prisma.registrantDocument.findMany({
    where: { registrantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createRegistrantDocument(data: CreateRegistrantDocumentInput, actor?: AuthUser) {
  if (actor) await assertRegistrantUnitAccess(data.registrantId, actor);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.registrantDocument.create({ data: data as any });
}

export async function createPublicRegistrantDocumentService(
  data: CreatePublicRegistrantDocumentRequest & { registrantId: string }
) {
  const { registrantId, type, url, base64, fileName, registrationToken, ocrNotes, ocrStatus } = data;

  const registrant = await prisma.registrant.findUnique({
    where: { id: registrantId },
    select: { id: true, registrationNo: true },
  });

  if (!registrant) {
    throw Errors.notFound('Registrant');
  }

  // Token / Proof of Ownership & Expiry Check (max 2 hours valid)
  if (!registrationToken) {
    throw Errors.forbidden('Invalid registration token for document upload');
  }

  const crypto = await import('crypto');
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  let isTokenValid = false;

  if (registrationToken.includes('.')) {
    const [tsHex, hmacHex] = registrationToken.split('.');
    const timestamp = parseInt(tsHex, 16);
    if (!isNaN(timestamp)) {
      const now = Date.now();
      const expectedHmac = crypto.createHmac('sha256', config.jwt.secret).update(`${registrant.id}:${tsHex}`).digest('hex').slice(0, 16);
      if (hmacHex === expectedHmac && now >= timestamp && (now - timestamp) <= TWO_HOURS_MS) {
        isTokenValid = true;
      }
    }
  }

  if (!isTokenValid) {
    throw Errors.forbidden('Invalid registration token for document upload');
  }

  const docUrl = url || base64;
  if (!docUrl || typeof docUrl !== 'string') {
    throw Errors.badRequest('Dokumen url/base64 wajib diisi');
  }

  // Identity documents are stored inline as data-URIs on the RegistrantDocument
  // row. This keeps the public upload flow dependency-free (no object-store
  // roundtrip, token stays single-use) but trades away object-storage
  // advantages: a data-URI has no independent retention/backup lifecycle, is
  // not served over a CDN, and access controls to the row gate the file. If
  // identity documents are later moved to object storage, add an access-audit
  // log and a retention policy — and migrate existing rows then, not now.
  //
  // For remote URLs (https), the SSRF guard below blocks loopback and private
  // hosts. The URL is stored, never fetched in this path; if it is ever
  // fetched, the same check must run at fetch time AND redirect targets must be
  // re-validated (a public URL can redirect to 169.254.169.254 / metadata).
  if (docUrl.startsWith('data:')) {
    if (docUrl.length > 2800000) {
      throw Errors.badRequest('Ukuran berkas melebihi batas maksimum (2MB)');
    }
    const mimeMatch = docUrl.match(/^data:(image\/(jpeg|jpg|png|webp)|application\/pdf);base64,/i);
    if (!mimeMatch) {
      throw Errors.badRequest('Tipe berkas tidak didukung. Hanya gambar (JPEG/PNG/WebP) dan PDF yang diperbolehkan');
    }
  } else {
    try {
      const parsedUrl = new URL(docUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
      const hostname = parsedUrl.hostname.toLowerCase();
      const isLoopback =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('127.');
      const isPrivateIp =
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
        hostname === '169.254.169.254' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal');

      if (isLoopback || isPrivateIp) {
        throw Errors.badRequest('URL dokumen tidak diizinkan (host privat atau internal)');
      }
    } catch (err: any) {
      if (err instanceof Errors.badRequest('').constructor || err?.name === 'ApiError' || err?.code) throw err;
      throw Errors.badRequest('URL dokumen tidak valid (harus diawali http:// atau https://)');
    }
  }

  let schemaType: 'akta' | 'ijazah' | 'kk' | 'foto' | 'rapor' | 'lainnya' = 'lainnya';
  const normalizedType = String(type).toLowerCase();
  if (normalizedType.includes('foto') || normalizedType === 'photo') {
    schemaType = 'foto';
  } else if (normalizedType.includes('kk') || normalizedType === 'family_card') {
    schemaType = 'kk';
  } else if (normalizedType.includes('akta') || normalizedType === 'birth_certificate') {
    schemaType = 'akta';
  } else if (normalizedType.includes('rapor') || normalizedType === 'report_card') {
    schemaType = 'rapor';
  } else if (normalizedType.includes('ijazah') || normalizedType === 'diploma') {
    schemaType = 'ijazah';
  }

  let ocrSummaryNote: string | undefined = undefined;
  if (ocrNotes && ocrNotes.length > 0) {
    ocrSummaryNote = `[Hasil Verifikasi: ${ocrStatus || 'WARNING'}] ${ocrNotes.join(' | ')}`;
  }

  const createRegistrantDocumentSchema = (await import('./admissions.schema')).createRegistrantDocumentSchema;
  const docData = createRegistrantDocumentSchema.parse({
    registrantId,
    name: fileName || `${schemaType}_${Date.now()}`,
    type: schemaType,
    fileUrl: docUrl,
    notes: ocrSummaryNote,
  });

  // Execute count check and document creation within a row-locked transaction to prevent race conditions
  return prisma.$transaction(async (tx) => {
    if ((tx as any).$executeRaw) {
      await (tx as any).$executeRaw`SELECT id FROM "registrants" WHERE id = ${registrantId} FOR UPDATE`;
    }

    const existingDocCount = await tx.registrantDocument.count({
      where: { registrantId },
    });

    if (existingDocCount >= 10) {
      throw Errors.badRequest('Jumlah dokumen pendaftar telah mencapai batas maksimum (10 dokumen)');
    }

    return tx.registrantDocument.create({ data: docData as any });
  });
}

export async function verifyDocument(id: string, isVerified: boolean, notes?: string, actor?: AuthUser) {
  if (actor) await assertDocumentUnitAccess(id, actor);
  return prisma.registrantDocument.update({
    where: { id },
    data: {
      isVerified,
      verifiedAt: isVerified ? new Date() : null,
      notes,
    },
  });
}

export async function deleteRegistrantDocument(id: string, actor?: AuthUser) {
  if (actor) await assertDocumentUnitAccess(id, actor);
  return prisma.registrantDocument.delete({ where: { id } });
}

/**
 * Projection for anonymous callers.
 *
 * Keep this whitelist tight: id, name, startDate, endDate, registrationFee,
 * requirements, unit name and academic year name — never `quota`, registrant
 * counts, internal notes, or any PII. Anything added here is exposed to every
 * anonymous caller of the public SPMB form AND to the public chatbot.
 */
const PUBLIC_PERIOD_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  registrationFee: true,
  requirements: true,
  unit: { select: { id: true, name: true, type: true } },
  academicYear: { select: { id: true, name: true } },
} as const;

export type PublicAdmissionPeriod = Prisma.AdmissionPeriodGetPayload<{
  select: typeof PUBLIC_PERIOD_SELECT;
}>;

/**
 * The admission period the public should be told about.
 *
 * `isActive` is administrative intent, not a schedule, so it cannot decide this
 * on its own. The original query took the flagged period with the latest
 * `startDate`, which picks the wrong record as soon as more than one wave is
 * flagged: with wave 1 open now and wave 2 scheduled after it, the latest start
 * is the wave that has NOT begun — so the site announced "dibuka <future date>"
 * and withheld the form while registration was in fact open, and
 * `createPublicRegistrant` would have accepted a submission anyway.
 *
 * Prefer what is genuinely open, then what opens next, and only then the most
 * recently closed period so the page can say honestly when it ended. These are
 * the three states `getPeriodWindow` renders.
 *
 * Lives in the service rather than the controller because it now has a second
 * caller: the public chatbot reads admission facts live instead of from its
 * static knowledge base (a bot quoting last year's fee is a real harm). Two
 * copies of this three-tier fallback would drift, and the drift reintroduces
 * exactly the bug described above.
 */
export async function getPublicUnitsService() {
  return prisma.unit.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, type: true },
    orderBy: { name: 'asc' },
  });
}

export async function findPublicActivePeriod(
  now: Date = new Date()
): Promise<PublicAdmissionPeriod | null> {
  return (
    (await prisma.admissionPeriod.findFirst({
      where: { isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { endDate: 'asc' },
      select: PUBLIC_PERIOD_SELECT,
    })) ??
    (await prisma.admissionPeriod.findFirst({
      where: { isActive: true, startDate: { gt: now } },
      orderBy: { startDate: 'asc' },
      select: PUBLIC_PERIOD_SELECT,
    })) ??
    (await prisma.admissionPeriod.findFirst({
      where: { isActive: true, endDate: { lt: now } },
      orderBy: { endDate: 'desc' },
      select: PUBLIC_PERIOD_SELECT,
    }))
  );
}
