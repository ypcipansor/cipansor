import { randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { Prisma, AdmissionStatus, Gender, UnitType } from '@prisma/client';
import { STUDENT_ROLE_CODES, resolveLegacyRoleToRoleCode } from '../auth/auth.service';
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
import { seesAllUnits } from '../../utils/resolve-unit-id';
import { assertAdmissionFeeSettled } from '../../utils/admission-fee-gate';
import { lockRegistrantForEnrollment } from '../../utils/enrollment-lock';

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

  const periodSuffix = admissionPeriodId.replace(/-/g, '').slice(0, 4).toUpperCase();

  return `REG-${year}-${periodSuffix}-${String(count + 1).padStart(5, '0')}`;
}

export async function getRegistrants(params: {
  page: number;
  limit: number;
  admissionPeriodId?: string;
  status?: AdmissionStatus;
  gender?: 'MALE' | 'FEMALE';
  search?: string;
}) {
  const { page, limit, admissionPeriodId, status, gender, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.RegistrantWhereInput = {};

  if (admissionPeriodId) where.admissionPeriodId = admissionPeriodId;
  if (status) where.status = status;
  if (gender) where.gender = gender as Gender;

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

export async function getRegistrantById(id: string) {
  return prisma.registrant.findUnique({
    where: { id },
    include: {
      admissionPeriod: {
        select: {
          id: true,
          name: true,
          registrationFee: true,
          unit: { select: { id: true, name: true, type: true } },
          academicYear: { select: { id: true, name: true } },
        },
      },
      documents: { orderBy: { createdAt: 'desc' } },
      student: { select: { id: true, nisn: true, nik: true, userId: true } },
    },
  });
}

export async function createRegistrant(data: CreateRegistrantExtendedInput) {
  const MAX_ATTEMPTS = 5;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await createRegistrantOnce(data);
    } catch (err) {
      lastError = err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray((err.meta as { target?: string[] } | undefined)?.target) &&
        (err.meta as { target: string[] }).target.includes('registrationNo')
      ) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Placeholder names the admission form defaults to when a parent field is left
// blank. They must never win over a name the applicant actually filled in.
const PARENT_NAME_PLACEHOLDERS = new Set(['Wali', 'Ibu', '']);

function isRealParentName(name?: string): name is string {
  return Boolean(name && !PARENT_NAME_PLACEHOLDERS.has(name.trim()));
}

async function createRegistrantOnce(data: CreateRegistrantExtendedInput) {
  return prisma.$transaction(async (tx) => {
    const registrationNo = await generateRegistrationNo(data.admissionPeriodId, tx);

    // Prioritize the name that was actually filled in over a defaulted
    // placeholder ("Wali" / "Ibu"), so a mother-only registration doesn't store
    // a placeholder as the consolidated parent name.
    const parentName = isRealParentName(data.fatherName)
      ? data.fatherName!.trim()
      : isRealParentName(data.motherName)
        ? data.motherName!.trim()
        : data.fatherName || data.motherName || '';
    const parentPhone = data.fatherPhone || data.motherPhone || '';
    const parentEmail = data.fatherEmail && data.fatherEmail !== '' ? data.fatherEmail : undefined;
    const parentOccupation = data.fatherOccupation || data.motherOccupation;

    const registrant = await tx.registrant.create({
      data: {
        admissionPeriodId: data.admissionPeriodId,
        registrationNo,
        fullName: data.fullName,
        name: data.fullName,
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
        nisn: data.nisn || data.internalNisn,
        nik: data.nik || data.nationalId || data.internalNik,
        fatherNik: data.fatherNik,
        fatherOccupation: data.fatherOccupation,
        fatherIncomeRange: data.fatherIncomeRange,
        motherNik: data.motherNik,
        motherOccupation: data.motherOccupation,
        motherIncomeRange: data.motherIncomeRange,
        guardianName: data.guardianName,
        guardianNik: data.guardianNik,
        guardianOccupation: data.guardianOccupation,
        guardianPhone: data.guardianPhone,
        isInternalAlumni: data.isInternalAlumni ?? false,
        previousStudentId: data.previousStudentId,
        internalNisn: data.internalNisn,
        internalNik: data.internalNik,
        notes: data.notes,
        source: data.source,
        campaignId: data.campaignId,
      },
    });

    const period = await tx.admissionPeriod.findUnique({
      where: { id: data.admissionPeriodId },
    });

    if (period && Number(period.registrationFee) > 0) {
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

export async function updateRegistrant(id: string, data: UpdateRegistrantInput) {
  const { fatherName, fatherPhone, motherName, motherPhone, fullName, email, ...rest } = data;

  const parentName =
    fatherName !== undefined || motherName !== undefined ? fatherName || motherName : undefined;
  const parentPhone =
    fatherPhone !== undefined || motherPhone !== undefined ? fatherPhone || motherPhone : undefined;

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

export async function updateRegistrantScore(id: string, data: UpdateRegistrantScoreInput) {
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

export async function recordRegistrationFee(
  id: string,
  data: RecordRegistrationFeeInput,
  verifiedById: string
) {
  const registrant = await prisma.registrant.findUnique({
    where: { id },
    include: { admissionPeriod: { select: { registrationFee: true } } },
  });

  if (!registrant) throw Errors.notFound('Registrant');

  return prisma.registrant.update({
    where: { id },
    data: {
      registrationFeePaidAt: data.paidAt ?? new Date(),
      registrationFeeAmount:
        data.amount != null ? data.amount : (registrant.admissionPeriod?.registrationFee ?? null),
      registrationFeeVerifiedById: verifiedById,
      registrationFeeNote: data.note,
    },
  });
}

export async function updateRegistrantStatus(id: string, data: UpdateRegistrantStatusInput) {
  if (data.status === AdmissionStatus.ENROLLED) {
    throw new Error('Cannot set status to ENROLLED directly; use the enrollment endpoint instead');
  }

  return prisma.$transaction(async (tx) => {
    const previous = await tx.registrant.findUnique({
      where: { id },
      select: { status: true, waveId: true },
    });

    if (!previous) {
      throw new Error('Registrant not found');
    }

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
 * Enroll an accepted registrant as a full student (SPMB admissions path).
 *
 * This is the LIGHTER of the two enrollment paths — the other is
 * `StudentOnboardingOrchestrator.processEnrollment`. The divergences below are
 * known and locked by contract tests (`enrollRegistrant` vs `processEnrollment`
 * in the admissions service tests):
 *
 * - **Wallet / medical record / parent account** (present in `processEnrollment`
 *   only): `enrollRegistrant` deliberately does NOT create these. The wallet is
 *   auto-created lazily by `getOrCreateWallet` on first use; medical records are
 *   entry-based and read-only here; and parent linking on this path is expected
 *   to be handled through the PPSB/parent portal, not at enrollment.
 * - **REG_FEE invoice** (present in `enrollRegistrant` only, when the fee is
 *   unsettled): the admissions path is where SPMB daftar-ulang fees are minted.
 *   `processEnrollment` never bills REG_FEE — it only enforces the settlement
 *   gate. After issue #2 a settled fee is never re-invoiced on either path.
 * - **Event bus** (present in `processEnrollment` only): the orchestrator emits
 *   `student:created` / password-reset notifications; the legacy admissions
 *   path leaves account-creation notifications to downstream flows.
 *
 * Shared core contract (both paths): registrant must be ACCEPTED + fee settled,
 * the caller must be scoped to (or see) the admission period's unit, a single
 * User+Student (+student RoleAssignment) is produced, the registrant flips to
 * ENROLLED with `studentId` set, and the wave accepted-count is decremented.
 *
 * Concurrency: the registrant row is locked with `SELECT ... FOR UPDATE` before
 * the ACCEPTED check so two concurrent enrollments cannot both promote the same
 * registrant into separate orphaned User/Student pairs (issue #1).
 */
export async function enrollRegistrant(
  registrantId: string,
  studentData: {
    nisn?: string;
    nik?: string;
    classId?: string;
    roomId?: string;
  },
  currentUser?: {
    roleCode?: string | null;
    role?: string | null;
    unitId?: string | null;
  }
) {
  const randomPassword = randomBytes(24).toString('base64url');
  const prehashedPassword = await bcrypt.hash(randomPassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    const registrant = await tx.registrant.findUnique({
      where: { id: registrantId },
      include: { admissionPeriod: { include: { unit: true } } },
    });

    if (!registrant) throw new Error('Registrant not found');

    // CONCURRENCY (issue #1): the unique index on registrants.student_id was
    // dropped to allow cross-unit re-enrollment, so the DB can no longer stop
    // two concurrent enrollment requests from promoting the SAME registrant.
    // Acquire a pessimistic row lock and re-check the status AFTER the lock is
    // held: the second waiter observes the committed `ENROLLED` status and
    // aborts instead of creating a duplicate orphaned User/Student pair.
    const lockedStatus = await lockRegistrantForEnrollment(tx, registrantId);
    if (lockedStatus !== AdmissionStatus.ACCEPTED) {
      throw new Error('Registrant must be accepted before enrollment');
    }

    // Payment gate (mirrors processEnrollment in the onboarding orchestrator):
    // being accepted is an academic decision, not proof the registrant settled
    // daftar ulang. A registrant with an outstanding registration fee must not
    // be turned into an active student here.
    const feePeriod = registrant.admissionPeriod;
    assertAdmissionFeeSettled({
      registrationFee: feePeriod?.registrationFee ?? null,
      registrationFeePaidAt: registrant.registrationFeePaidAt,
    });

    // SECURITY: the caller must be allowed to operate on the unit the admission
    // period belongs to. A user pinned to one unit may only enroll registrants
    // into that unit (they could otherwise drop a student into any unit, or pull
    // an alumnus across units by forging previousStudentId / internalNisn /
    // internalNik). Foundation/cross-unit roles (seesAllUnits) may enroll across
    // units.
    if (currentUser && !seesAllUnits(currentUser) && currentUser.unitId !== feePeriod?.unitId) {
      throw Errors.forbidden('You can only enroll students into your own unit');
    }

    let existingStudent = null;

    // MODEL (see findInternalAlumniByIdentifier and root AGENTS.md golden rule
    // #4/5): `student.unitId` is the CURRENT ACTIVE unit, so a student
    // progressing across units legitimately migrates it. For a target-unit
    // caller to re-enrol an alumnus still recorded in the source unit the
    // lookup must NOT be scoped to the caller's unit — that scope made the
    // normal progression (SD IT -> SMP IT) silently fail. Take-over of an ACTIVE
    // student in another unit is prevented by the `status = 'alumni'` filter
    // below plus the caller-scope check above; this path only ever runs through
    // an authenticated admissions endpoint.
    if (registrant.isInternalAlumni) {
      if (registrant.previousStudentId) {
        existingStudent = await tx.student.findFirst({
          where: {
            id: registrant.previousStudentId,
            status: 'alumni',
            deletedAt: null,
          },
          include: { user: true },
        });
      }
      if (!existingStudent && (registrant.internalNisn || registrant.internalNik)) {
        const conditions: Prisma.StudentWhereInput[] = [];
        if (registrant.internalNisn) conditions.push({ nisn: registrant.internalNisn });
        if (registrant.internalNik) conditions.push({ nik: registrant.internalNik });

        existingStudent = await tx.student.findFirst({
          where: {
            deletedAt: null,
            status: 'alumni',
            OR: conditions,
          },
          include: { user: true },
        });
      }

      // An internal-alumni registrant whose referenced record cannot be found
      // must NOT fall through to the generic email/re-create path — that would
      // silently reuse or create a different student, hijacking the identified
      // alumnus under a new account. Fail loudly, like the onboarding
      // orchestrator does (issue #8).
      if (!existingStudent) {
        throw Errors.badRequest(
          'Referenced internal alumnus record not found or student is not in alumni status'
        );
      }
    }

    let user;
    let student;

    if (existingStudent) {
      user = await tx.user.update({
        where: { id: existingStudent.userId },
        data: {
          unitId: registrant.admissionPeriod.unitId,
        },
      });

      student = await tx.student.update({
        where: { id: existingStudent.id },
        data: {
          unitId: registrant.admissionPeriod.unitId,
          status: 'active',
          nisn:
            studentData.nisn || registrant.nisn || registrant.internalNisn || existingStudent.nisn,
          nik: studentData.nik || registrant.nik || registrant.internalNik || existingStudent.nik,
          graduateYear: null,
        },
      });

      await tx.classEnrollment.updateMany({
        where: { studentId: student.id, status: 'active' },
        data: { status: 'completed' },
      });

      const targetRoleCode = resolveLegacyRoleToRoleCode(
        'STUDENT',
        registrant.admissionPeriod.unit.type
      );
      if (targetRoleCode) {
        const studentRole = await tx.role.findFirst({ where: { code: targetRoleCode } });
        if (studentRole) {
          // Deactivate every STUDENT assignment in OTHER units — not just the
          // target unit's role. When a student progresses across unit types
          // (e.g. SD IT -> SMP IT) the old unit's student role has a different
          // roleId, so filtering only on studentRole.id would leave the old
          // unit's student access live. Gather all student role ids and revoke
          // them all; unrelated guru/staf/orang-tua roles stay untouched.
          const studentRoles = await tx.role.findMany({
            where: { code: { in: STUDENT_ROLE_CODES } },
            select: { id: true },
          });
          const studentRoleIds = studentRoles.map((r) => r.id);
          if (studentRoleIds.length > 0) {
            await tx.userRoleAssignment.updateMany({
              where: {
                userId: user.id,
                roleId: { in: studentRoleIds },
                isActive: true,
                unitId: { not: registrant.admissionPeriod.unitId },
              },
              data: { isPrimary: false, isActive: false },
            });
          }
          // Upsert on the (userId, roleId, unitId) unique key so re-enrolling into
          // the same unit reactivates the existing assignment instead of P2002.
          await tx.userRoleAssignment.upsert({
            where: {
              userId_roleId_unitId: {
                userId: user.id,
                roleId: studentRole.id,
                unitId: registrant.admissionPeriod.unitId,
              },
            },
            create: {
              userId: user.id,
              roleId: studentRole.id,
              unitId: registrant.admissionPeriod.unitId,
              isPrimary: true,
              isActive: true,
            },
            update: {
              isPrimary: true,
              isActive: true,
            },
          });
        }
      }
    } else {
      const existingUser = registrant.email
        ? await tx.user.findUnique({
            where: { email: registrant.email },
          })
        : null;

      // ISSUE #5 (email reuse must not take over another account's student):
      // matching by email alone is not proof the registrant owns that record.
      // Reusing an existing user is only safe when that user's linked student
      // is an ALUMNUS (a legitimate re-enrolment of the email owner) — never an
      // ACTIVE student in another unit. A parent/staff account that merely holds
      // the same email, or a user owning an active student, must NOT have that
      // record commandeered/moved; the registrant falls back to a brand-new
      // student with a unique address (mirrors the onboarding orchestrator).
      const existingStudentForUser = existingUser
        ? await tx.student.findUnique({
            where: { userId: existingUser.id },
          })
        : null;
      const canReactivate = !!existingUser && existingStudentForUser?.status === 'alumni';

      if (existingUser && canReactivate) {
        // Legitimate re-enrolment: the registrant's email owns an ALUMNUS
        // student. Reactivate that record under the same user.
        user = existingUser;
        student = await tx.student.update({
          where: { id: existingStudentForUser!.id },
          data: {
            unitId: registrant.admissionPeriod.unitId,
            status: 'active',
            nisn:
              studentData.nisn ||
              registrant.nisn ||
              registrant.internalNisn ||
              existingStudentForUser!.nisn,
            nik:
              studentData.nik ||
              registrant.nik ||
              registrant.internalNik ||
              existingStudentForUser!.nik,
            graduateYear: null,
          },
        });

        await tx.classEnrollment.updateMany({
          where: { studentId: student.id, status: 'active' },
          data: { status: 'completed' },
        });

        const targetRoleCode = resolveLegacyRoleToRoleCode(
          'STUDENT',
          registrant.admissionPeriod.unit.type
        );
        if (targetRoleCode) {
          const studentRole = await tx.role.findFirst({ where: { code: targetRoleCode } });
          if (studentRole) {
            // Revoke the student's other-unit STUDENT roles (a progressed student's
            // old unit has a different roleId) but leave unrelated guru/staf/parent
            // roles untouched.
            const studentRoles = await tx.role.findMany({
              where: { code: { in: STUDENT_ROLE_CODES } },
              select: { id: true },
            });
            const studentRoleIds = studentRoles.map((r) => r.id);
            if (studentRoleIds.length > 0) {
              await tx.userRoleAssignment.updateMany({
                where: {
                  userId: user.id,
                  roleId: { in: studentRoleIds },
                  isActive: true,
                  unitId: { not: registrant.admissionPeriod.unitId },
                },
                data: { isPrimary: false, isActive: false },
              });
            }
            // Upsert on the (userId, roleId, unitId) unique key so re-enrolling into
            // the same unit reactivates the existing assignment instead of P2002.
            await tx.userRoleAssignment.upsert({
              where: {
                userId_roleId_unitId: {
                  userId: user.id,
                  roleId: studentRole.id,
                  unitId: registrant.admissionPeriod.unitId,
                },
              },
              create: {
                userId: user.id,
                roleId: studentRole.id,
                unitId: registrant.admissionPeriod.unitId,
                isPrimary: true,
                isActive: true,
              },
              update: {
                isPrimary: true,
                isActive: true,
              },
            });
          }
        }
      } else {
        // Fresh student for this registrant. If the registrant's email is
        // already claimed by another account (parent/staff/active student),
        // reuse would hijack it or violate User.email uniqueness (P2002) — fall
        // back to a unique student address, exactly like the onboarding
        // orchestrator does.
        let userEmail =
          registrant.email ||
          `${studentData.nisn || randomBytes(8).toString('hex')}@student.cipansor.or.id`;
        if (registrant.email) {
          const emailOwner = await tx.user.findUnique({ where: { email: registrant.email } });
          if (emailOwner) {
            userEmail = `${studentData.nisn || randomUUID()}@student.cipansor.or.id`;
          }
        }

        user = await tx.user.create({
          data: {
            name: registrant.fullName,
            email: userEmail,
            passwordHash: prehashedPassword,
            unitId: registrant.admissionPeriod.unitId,
            isActive: true,
          },
        });

        student = await tx.student.create({
          data: {
            userId: user.id,
            unitId: registrant.admissionPeriod.unitId,
            nisn: studentData.nisn || registrant.nisn || registrant.internalNisn,
            nik: studentData.nik || registrant.nik || registrant.internalNik,
            gender: registrant.gender,
            birthPlace: registrant.birthPlace,
            birthDate: registrant.birthDate,
            address: registrant.address,
            parentName: registrant.parentName,
            parentPhone: registrant.parentPhone,
            parentEmail: registrant.parentEmail,
            status: 'active',
            entryYear: new Date().getFullYear(),
          },
        });

        const targetRoleCode = resolveLegacyRoleToRoleCode(
          'STUDENT',
          registrant.admissionPeriod.unit.type
        );
        if (targetRoleCode) {
          const studentRole = await tx.role.findFirst({ where: { code: targetRoleCode } });
          if (studentRole) {
            await tx.userRoleAssignment.create({
              data: {
                userId: user.id,
                roleId: studentRole.id,
                unitId: registrant.admissionPeriod.unitId,
                isPrimary: true,
                isActive: true,
              },
            });
          }
        }
      }
    }

    // Lifelong-identifier rule: an active student must carry a permanent NISN or
    // NIK. TK_QURAN is the documented exception — young children may not yet have
    // a NISN assigned and the school does not always collect their NIK at
    // enrollment. Non-TK units that reach this point with neither identifier
    // would silently create a student with no way to be identified long-term.
    if (
      !student.nisn &&
      !student.nik &&
      registrant.admissionPeriod.unit.type !== UnitType.TK_QURAN
    ) {
      throw Errors.badRequest('NISN atau NIK wajib diisi untuk menerima siswa');
    }

    if (studentData.classId) {
      await tx.classEnrollment.create({
        data: {
          studentId: student.id,
          classId: studentData.classId,
          status: 'active',
        },
      });
    }

    if (studentData.roomId) {
      await tx.roomAssignment.create({
        data: {
          studentId: student.id,
          roomId: studentData.roomId,
          isActive: true,
          assignedAt: new Date(),
        },
      });
    }

    await tx.registrant.update({
      where: { id: registrantId },
      data: {
        status: AdmissionStatus.ENROLLED,
        enrolledAt: new Date(),
        studentId: student.id,
      },
    });

    if (registrant.waveId) {
      await tx.admissionWave.updateMany({
        where: { id: registrant.waveId, acceptedCount: { gt: 0 } },
        data: { acceptedCount: { decrement: 1 } },
      });
    }

    const period = registrant.admissionPeriod;
    // ISSUE #2 (paid fee must not be re-billed): `assertAdmissionFeeSettled`
    // above guarantees that by this point either the fee is 0/nil (nothing is
    // owed) or `registrationFeePaidAt` is set (daftar ulang already settled).
    // Creating a fresh REG_FEE invoice when the fee is already settled would
    // bill the family a NEW outstanding debt for the same daftar ulang. Only
    // mint an invoice when there is still an unsettled amount — and because the
    // gate forbids enrolling with an outstanding fee, this branch is effectively
    // reachable only for fee > 0 that is settled, which we skip.
    const feeSettled = registrant.registrationFeePaidAt != null;
    if (period && Number(period.registrationFee) > 0 && !feeSettled) {
      const paymentType = await tx.paymentType.findFirst({
        where: { unitId: period.unitId, code: 'REG_FEE' },
      });
      if (paymentType) {
        await financeService.createInvoice(
          {
            studentId: student.id,
            paymentTypeId: paymentType.id,
            amount: Number(period.registrationFee),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            notes: `Biaya Pendaftaran ${registrant.fullName}`,
          } as any,
          tx as Prisma.TransactionClient
        );
      }
    }

    return { user, student };
  });

  return result;
}

export async function deleteRegistrant(id: string) {
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

export async function getRegistrantDocuments(registrantId: string) {
  return prisma.registrantDocument.findMany({
    where: { registrantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createRegistrantDocument(data: CreateRegistrantDocumentInput) {
  return prisma.registrantDocument.create({ data: data as any });
}

export async function verifyDocument(id: string, isVerified: boolean, notes?: string) {
  return prisma.registrantDocument.update({
    where: { id },
    data: {
      isVerified,
      verifiedAt: isVerified ? new Date() : null,
      notes,
    },
  });
}

export async function deleteRegistrantDocument(id: string) {
  return prisma.registrantDocument.delete({ where: { id } });
}

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
