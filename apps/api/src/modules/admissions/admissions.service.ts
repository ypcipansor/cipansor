import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { Prisma, AdmissionStatus, Gender } from '@prisma/client';
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

async function createRegistrantOnce(data: CreateRegistrantExtendedInput) {
  return prisma.$transaction(async (tx) => {
    const registrationNo = await generateRegistrationNo(data.admissionPeriodId, tx);

    const parentName = data.fatherName || data.motherName;
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

export async function enrollRegistrant(
  registrantId: string,
  studentData: {
    nisn?: string;
    nik?: string;
    classId?: string;
    roomId?: string;
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
    if (registrant.status !== AdmissionStatus.ACCEPTED) {
      throw new Error('Registrant must be accepted before enrollment');
    }

    const existingUser = registrant.email
      ? await tx.user.findUnique({
          where: { email: registrant.email },
          include: { student: true },
        })
      : null;

    let user;
    let student;

    if (existingUser && existingUser.student) {
      user = existingUser;
      student = await tx.student.update({
        where: { id: existingUser.student.id },
        data: {
          unitId: registrant.admissionPeriod.unitId,
          status: 'active',
          nisn: studentData.nisn,
          nik: studentData.nik,
          graduateYear: null,
        },
      });

      await tx.classEnrollment.updateMany({
        where: { studentId: student.id, status: 'active' },
        data: { status: 'completed' },
      });
    } else if (existingUser) {
      user = existingUser;

      student = await tx.student.create({
        data: {
          userId: user.id,
          unitId: registrant.admissionPeriod.unitId,
          nisn: studentData.nisn,
          nik: studentData.nik,
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
    } else {
      user = await tx.user.create({
        data: {
          name: registrant.fullName,
          email: registrant.email || `${studentData.nisn || randomBytes(8).toString('hex')}@student.cipansor.or.id`,
          passwordHash: prehashedPassword,
          role: 'STUDENT',
          unitId: registrant.admissionPeriod.unitId,
          isActive: true,
        },
      });

      student = await tx.student.create({
        data: {
          userId: user.id,
          unitId: registrant.admissionPeriod.unitId,
          nisn: studentData.nisn,
          nik: studentData.nik,
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
    if (period && Number(period.registrationFee) > 0) {
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
