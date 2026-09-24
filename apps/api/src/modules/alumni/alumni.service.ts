import { prisma } from '@/lib/prisma';
import {
  CreateAlumniInput,
  UpdateAlumniInput,
  AlumniQueryInput,
  ConvertFromStudentInput,
  CreateCareerInput,
  UpdateCareerInput,
  CreateEducationInput,
  UpdateEducationInput,
  CreateDonationInput,
  UpdateDonationInput,
  DonationQueryInput,
  CreateEventInput,
  UpdateEventInput,
  EventQueryInput,
  RegisterEventInput,
  UpdateAttendeeStatusInput,
} from './alumni.schema';
import { Prisma } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { CLASS_ENROLLMENT_STATUS, STUDENT_STATUS } from '@cipansor/shared';
import { closeUnitEnrollments } from '@/utils/student-unit-history';
import { claimBlobForRecord, releaseBlobClaimById } from '@/utils/blob-claim';
import {
  AlumniActor,
  alumniUnitScope,
  assertAlumniRecordInScope,
  assertAlumniTargetUnitInScope,
} from './alumni-access';

/** Unit alumni yang akan disentuh — 404 bila tidak ada atau di luar lingkup. */
async function alumniInScope(alumniId: string, actor: AlumniActor) {
  const alumni = await prisma.alumni.findFirst({
    where: { id: alumniId, deletedAt: null },
    select: { id: true, unitId: true },
  });
  if (!alumni) throw Errors.notFound('Alumni');
  assertAlumniRecordInScope(actor, alumni.unitId, 'Alumni');
  return alumni;
}

// ==================== ALUMNI ====================

export async function getAlumni(query: AlumniQueryInput) {
  const { page, limit, search, unitId, graduationYear, status } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.AlumniWhereInput = {
    deletedAt: null,
    ...(unitId && { unitId }),
    ...(graduationYear && { graduationYear }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { registrationNo: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.alumni.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true, type: true } },
        student: { select: { id: true, nis: true } },
        _count: { select: { careers: true, educations: true, donations: true } },
      },
      orderBy: { graduationYear: 'desc' },
      skip,
      take: limit,
    }),
    prisma.alumni.count({ where }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get analytics correlating alumni outcome (career/education) with school performance (tahfidz/academic).
 * Best Practice: Feedback loop for curriculum improvement.
 */
export async function getAlumniOutcomeAnalytics(unitId?: string) {
  const alumni = await prisma.alumni.findMany({
    where: {
      deletedAt: null,
      ...(unitId && { unitId }),
    },
    include: {
      student: {
        include: {
          grades: { select: { percentage: true } },
          tahfidzRecords: { select: { juz: true } },
        },
      },
      careers: true,
      educations: true,
    },
  });

  return alumni.map((alm) => {
    const avgGrade = alm.student?.grades.length
      ? alm.student.grades.reduce((sum, g) => sum + Number(g.percentage), 0) /
        alm.student.grades.length
      : null;

    const maxJuz = alm.student?.tahfidzRecords.length
      ? Math.max(...alm.student.tahfidzRecords.map((r) => r.juz))
      : alm.tahfidzLevel
        ? parseInt(alm.tahfidzLevel, 10) || 0
        : 0;

    const hasHigherEd = alm.educations.some(
      (e) => e.degree.includes('S1') || e.degree.includes('Bachelor') || e.degree.includes('S2')
    );

    const hasCareer = alm.careers.length > 0;

    return {
      id: alm.id,
      name: alm.name,
      avgGrade,
      maxJuz,
      outcomeScore: (hasHigherEd ? 50 : 0) + (hasCareer ? 50 : 0),
      graduationYear: alm.graduationYear,
    };
  });
}

export async function getTracerStudyStats(unitId?: string) {
  const where: Prisma.AlumniWhereInput = {
    deletedAt: null,
    ...(unitId && { unitId }),
  };

  const [
    totalAlumni,
    countWorking,
    countStudying,
    countBoth,
    topUniversities,
    topMajors,
    topIndustries,
  ] = await Promise.all([
    prisma.alumni.count({ where }),
    prisma.alumni.count({
      where: {
        ...where,
        careers: { some: { isCurrent: true } },
      },
    }),
    prisma.alumni.count({
      where: {
        ...where,
        educations: { some: { isCompleted: false } },
      },
    }),
    prisma.alumni.count({
      where: {
        ...where,
        careers: { some: { isCurrent: true } },
        educations: { some: { isCompleted: false } },
      },
    }),
    prisma.alumniEducation.groupBy({
      by: ['institution'],
      where: { alumni: where },
      _count: { institution: true },
      orderBy: { _count: { institution: 'desc' } },
      take: 5,
    }),
    prisma.alumniEducation.groupBy({
      by: ['field'],
      where: { alumni: where },
      _count: { field: true },
      orderBy: { _count: { field: 'desc' } },
      take: 5,
    }),
    prisma.alumniCareer.groupBy({
      by: ['industry'],
      where: { alumni: where, industry: { not: null } },
      _count: { industry: true },
      orderBy: { _count: { industry: 'desc' } },
      take: 5,
    }),
  ]);

  const workingOnly = countWorking - countBoth;
  const studyingOnly = countStudying - countBoth;
  const other = totalAlumni - (workingOnly + studyingOnly + countBoth);

  return {
    totalAlumni,
    statusDistribution: {
      working: workingOnly,
      studying: studyingOnly,
      workingAndStudying: countBoth,
      other,
    },
    topUniversities: topUniversities.map((u) => ({
      name: u.institution,
      count: u._count.institution,
    })),
    topMajors: topMajors.map((m) => ({
      name: m.field,
      count: m._count.field,
    })),
    topIndustries: topIndustries
      .filter((i) => i.industry !== null)
      .map((i) => ({
        name: i.industry as string,
        count: i._count.industry,
      })),
  };
}

export async function getAlumniById(id: string) {
  return prisma.alumni.findFirst({
    where: { id, deletedAt: null },
    include: {
      unit: { select: { id: true, name: true, type: true } },
      student: { select: { id: true, nis: true, nisn: true } },
      careers: { orderBy: { startDate: 'desc' } },
      educations: { orderBy: { startYear: 'desc' } },
      donations: { orderBy: { donatedAt: 'desc' }, take: 10 },
      eventAttendances: {
        include: { event: { select: { id: true, name: true, eventDate: true } } },
        orderBy: { registeredAt: 'desc' },
        take: 10,
      },
    },
  });
}

export async function createAlumni(data: CreateAlumniInput, actor: AlumniActor) {
  assertAlumniTargetUnitInScope(actor, data.unitId);

  // Generate registration number
  const year = data.graduationYear;
  const count = await prisma.alumni.count({
    where: { graduationYear: year },
  });
  const registrationNo = `ALM-${year}-${String(count + 1).padStart(4, '0')}`;

  // A photo uploaded for this record is a blob reference; claim it before the
  // row points at it so a discard cannot delete it mid-commit (BUG 4 / flag 9).
  const photoUrl = typeof data.photo === 'string' ? data.photo : undefined;
  return prisma.$transaction(async (tx) => {
    let claim = null;
    if (photoUrl) {
      claim = await claimBlobForRecord(photoUrl, actor.id ?? 'alumni', tx);
      if (!claim) {
        throw Errors.conflict('Foto alumni sedang diproses pihak lain; unggah ulang berkas');
      }
    }

    const alumni = await tx.alumni.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        ...data,
        registrationNo,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        graduationDate: data.graduationDate ? new Date(data.graduationDate) : undefined,
      } as any,
      include: {
        unit: { select: { id: true, name: true, type: true } },
      },
    });

    if (claim) await releaseBlobClaimById(claim, tx);
    return alumni;
  });
}

export async function updateAlumni(id: string, data: UpdateAlumniInput, actor: AlumniActor) {
  await alumniInScope(id, actor);
  if (data.unitId) assertAlumniTargetUnitInScope(actor, data.unitId);

  // A replaced photo is a NEW blob reference: claim it before the update commits
  // (flag 9). The previous URL is unreferenced once this commits, so a discard
  // of it can then proceed — the commit removes the reference, not an early
  // delete.
  const photoUrl = typeof data.photo === 'string' ? data.photo : undefined;
  return prisma.$transaction(async (tx) => {
    let claim = null;
    if (photoUrl) {
      claim = await claimBlobForRecord(photoUrl, actor.id ?? 'alumni', tx);
      if (!claim) {
        throw Errors.conflict('Foto alumni sedang diproses pihak lain; unggah ulang berkas');
      }
    }

    const alumni = await tx.alumni.update({
      where: { id },
      data: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        graduationDate: data.graduationDate ? new Date(data.graduationDate) : undefined,
      },
      include: {
        unit: { select: { id: true, name: true, type: true } },
      },
    });

    if (claim) await releaseBlobClaimById(claim, tx);
    return alumni;
  });
}

export async function deleteAlumni(id: string, actor: AlumniActor) {
  await alumniInScope(id, actor);

  return prisma.alumni.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function convertFromStudent(
  studentId: string,
  data: ConvertFromStudentInput,
  actor: AlumniActor
) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    include: {
      user: true,
      unit: { select: { name: true } },
      enrollments: {
        where: { status: CLASS_ENROLLMENT_STATUS.ACTIVE },
        include: { class: { select: { name: true, unitId: true } } },
        orderBy: { enrolledAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!student) {
    throw Errors.notFound('Student');
  }
  // Meluluskan santri mengubah statusnya; hanya pengelola unit santri itu.
  assertAlumniRecordInScope(actor, student.unitId, 'Student');

  // Yang diluluskan adalah santri AKTIF dari unitnya sekarang. Alumni SD IT yang
  // belum diterima di unit berikutnya tidak bisa "lulus" lagi.
  if (student.status !== STUDENT_STATUS.ACTIVE) {
    throw Errors.conflict('Hanya santri aktif yang bisa diluluskan.');
  }

  const graduationDate = data.graduationDate ? new Date(data.graduationDate) : new Date();
  // Tahun lulus = tahun tanggal lulusnya. Dulu `students.graduate_year` dipakai
  // lebih dulu, sehingga santri yang pernah lulus dari unit sebelumnya tercatat
  // lulus lagi pada tahun LAMA.
  const year = graduationDate.getFullYear();

  const sudah = await prisma.alumni.findFirst({
    where: { studentId: student.id, unitId: student.unitId, graduationYear: year },
    select: { id: true },
  });
  if (sudah) {
    throw Errors.conflict(
      `Santri ini sudah tercatat lulus dari ${student.unit.name} pada ${year}.`
    );
  }

  // Generate registration number
  const count = await prisma.alumni.count({
    where: { graduationYear: year },
  });
  const registrationNo = `ALM-${year}-${String(count + 1).padStart(4, '0')}`;

  return prisma.$transaction(async (tx) => {
    const alumni = await tx.alumni.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        studentId: student.id,
        unitId: student.unitId,
        registrationNo,
        name: student.user.name,
        gender: student.gender,
        birthPlace: student.birthPlace,
        birthDate: student.birthDate,
        graduationYear: year,
        graduationDate,
        lastClass: data.lastClass ?? student.enrollments[0]?.class.name,
        tahfidzLevel: data.tahfidzLevel,
        email: student.user.email,
        phone: student.parentPhone,
        address: student.address,
        notes: data.notes,
      } as any,
      include: {
        unit: { select: { id: true, name: true, type: true } },
        student: { select: { id: true, nis: true } },
      },
    });

    await tx.student.update({
      where: { id: studentId },
      data: {
        status: STUDENT_STATUS.ALUMNI,
        graduateYear: year,
      },
    });

    // Rombel unit ini selesai, dan keanggotaan unitnya ditutup LULUS pada
    // tanggal lulus — tanpa ini santri tetap terhitung di unit asal pada setiap
    // tanggal sesudahnya, termasuk setelah diterima di unit berikutnya.
    await tx.classEnrollment.updateMany({
      where: {
        studentId: student.id,
        status: CLASS_ENROLLMENT_STATUS.ACTIVE,
        class: { unitId: student.unitId },
      },
      data: { status: CLASS_ENROLLMENT_STATUS.COMPLETED },
    });
    await closeUnitEnrollments(tx, {
      studentId: student.id,
      unitId: student.unitId,
      exitDate: graduationDate,
      exitReason: 'LULUS',
    });

    return alumni;
  });
}

// ==================== CAREER ====================

export async function getCareersByAlumni(alumniId: string) {
  return prisma.alumniCareer.findMany({
    where: { alumniId },
    orderBy: { startDate: 'desc' },
  });
}

export async function createCareer(alumniId: string, data: CreateCareerInput, actor: AlumniActor) {
  await alumniInScope(alumniId, actor);

  // If this is current job, unset other current jobs
  if (data.isCurrent) {
    await prisma.alumniCareer.updateMany({
      where: { alumniId, isCurrent: true },
      data: { isCurrent: false },
    });
  }

  return prisma.alumniCareer.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      alumniId,
      ...data,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    } as any,
  });
}

export async function updateCareer(id: string, data: UpdateCareerInput, actor: AlumniActor) {
  const career = await prisma.alumniCareer.findUnique({ where: { id } });
  if (!career) throw Errors.notFound('Career');
  await alumniInScope(career.alumniId, actor);

  // If setting as current, unset others
  if (data.isCurrent) {
    await prisma.alumniCareer.updateMany({
      where: { alumniId: career.alumniId, isCurrent: true, id: { not: id } },
      data: { isCurrent: false },
    });
  }

  return prisma.alumniCareer.update({
    where: { id },
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    },
  });
}

export async function deleteCareer(id: string, actor: AlumniActor) {
  const career = await prisma.alumniCareer.findUnique({
    where: { id },
    select: { alumniId: true },
  });
  if (!career) throw Errors.notFound('Career');
  await alumniInScope(career.alumniId, actor);

  return prisma.alumniCareer.delete({ where: { id } });
}

// ==================== EDUCATION ====================

async function educationInScope(id: string, actor: AlumniActor) {
  const education = await prisma.alumniEducation.findUnique({
    where: { id },
    select: { alumniId: true },
  });
  if (!education) throw Errors.notFound('Education');
  await alumniInScope(education.alumniId, actor);
}

export async function getEducationsByAlumni(alumniId: string) {
  return prisma.alumniEducation.findMany({
    where: { alumniId },
    orderBy: { startYear: 'desc' },
  });
}

/**
 * Si-Taka: cross-alumni university placement listing + aggregates. All
 * numbers derive from real AlumniEducation rows — no synthetic fallbacks.
 */
export async function getPlacements(unitId?: string) {
  const educations = await prisma.alumniEducation.findMany({
    where: unitId ? { alumni: { unitId } } : {},
    include: {
      alumni: { select: { id: true, name: true, graduationYear: true } },
    },
    orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }],
    take: 500,
  });

  const byPath: Record<string, number> = {};
  const byInstitution: Record<string, number> = {};
  let internationalCount = 0;
  let scholarshipCount = 0;

  for (const edu of educations) {
    const path = edu.admissionPath || 'Lainnya';
    byPath[path] = (byPath[path] || 0) + 1;
    byInstitution[edu.institution] = (byInstitution[edu.institution] || 0) + 1;
    if (edu.isInternational) internationalCount++;
    if (edu.scholarshipName) scholarshipCount++;
  }

  return {
    placements: educations,
    stats: {
      total: educations.length,
      internationalCount,
      scholarshipCount,
      byPath: Object.entries(byPath)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count),
      topInstitutions: Object.entries(byInstitution)
        .map(([institution, count]) => ({ institution, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    },
  };
}

export async function createEducation(
  alumniId: string,
  data: CreateEducationInput,
  actor: AlumniActor
) {
  await alumniInScope(alumniId, actor);

  return prisma.alumniEducation.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      alumniId,
      ...data,
    } as any,
  });
}

export async function updateEducation(id: string, data: UpdateEducationInput, actor: AlumniActor) {
  await educationInScope(id, actor);

  return prisma.alumniEducation.update({
    where: { id },
    data,
  });
}

export async function deleteEducation(id: string, actor: AlumniActor) {
  await educationInScope(id, actor);

  return prisma.alumniEducation.delete({ where: { id } });
}

// ==================== DONATIONS ====================

export async function getDonations(query: DonationQueryInput, actor: AlumniActor) {
  const { page, limit, alumniId, unitId, type, startDate, endDate } = query;
  const skip = (page - 1) * limit;
  const scope = alumniUnitScope(actor);

  const where: Prisma.AlumniDonationWhereInput = {
    // Pengelola satu unit: donasi UNTUK unitnya atau DARI alumninya.
    ...(scope !== null && { OR: [{ unitId: scope }, { alumni: { unitId: scope } }] }),
    ...(alumniId && { alumniId }),
    ...(unitId && { unitId }),
    ...(type && { type }),
    ...(startDate &&
      endDate && {
        donatedAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
  };

  const [data, total, stats] = await Promise.all([
    prisma.alumniDonation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { donatedAt: 'desc' },
      include: {
        alumni: { select: { id: true, name: true, registrationNo: true } },
        unit: { select: { id: true, name: true } },
      },
    }),
    prisma.alumniDonation.count({ where }),
    prisma.alumniDonation.aggregate({
      where: { ...where, type: 'MONETARY' },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  // Apply anonymity - isAnonymous is on donation, not alumni
  const processedData = data.map((d) => ({
    ...d,
    alumni: d.isAnonymous ? { id: d.alumni.id, name: 'Anonim', registrationNo: null } : d.alumni,
  }));

  return {
    data: processedData,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    stats: {
      totalMonetary: stats._sum.amount || 0,
      totalDonations: stats._count,
    },
  };
}

export async function createDonation(
  alumniId: string,
  data: CreateDonationInput,
  actor: AlumniActor
) {
  await alumniInScope(alumniId, actor);
  if (data.unitId) assertAlumniTargetUnitInScope(actor, data.unitId);

  // Generate receipt number
  const year = new Date().getFullYear();
  const count = await prisma.alumniDonation.count({
    where: { donatedAt: { gte: new Date(`${year}-01-01`) } },
  });
  const receiptNo = data.receiptNo || `DON-${year}-${String(count + 1).padStart(5, '0')}`;

  return prisma.alumniDonation.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      alumniId,
      ...data,
      receiptNo,
      donatedAt: new Date(data.donatedAt),
      amount: data.amount ? new Prisma.Decimal(data.amount) : undefined,
    } as any,
    include: {
      alumni: { select: { id: true, name: true, registrationNo: true } },
      unit: { select: { id: true, name: true } },
    },
  });
}

async function donationInScope(id: string, actor: AlumniActor) {
  const donation = await prisma.alumniDonation.findUnique({
    where: { id },
    select: { alumniId: true },
  });
  if (!donation) throw Errors.notFound('Donation');
  await alumniInScope(donation.alumniId, actor);
}

export async function updateDonation(id: string, data: UpdateDonationInput, actor: AlumniActor) {
  await donationInScope(id, actor);
  if (data.unitId) assertAlumniTargetUnitInScope(actor, data.unitId);

  return prisma.alumniDonation.update({
    where: { id },
    data: {
      ...data,
      donatedAt: data.donatedAt ? new Date(data.donatedAt) : undefined,
      amount: data.amount ? new Prisma.Decimal(data.amount) : undefined,
    },
    include: {
      alumni: { select: { id: true, name: true, registrationNo: true } },
      unit: { select: { id: true, name: true } },
    },
  });
}

export async function deleteDonation(id: string, actor: AlumniActor) {
  await donationInScope(id, actor);

  return prisma.alumniDonation.delete({ where: { id } });
}

// ==================== EVENTS ====================

export async function getEvents(query: EventQueryInput) {
  const { page, limit, unitId, type, status, startDate, endDate } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.AlumniEventWhereInput = {
    deletedAt: null,
    ...(unitId && { unitId }),
    ...(type && { type }),
    ...(status && { status }),
    ...(startDate &&
      endDate && {
        eventDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
  };

  const [data, total] = await Promise.all([
    prisma.alumniEvent.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        _count: { select: { attendees: true } },
      },
      orderBy: { eventDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.alumniEvent.count({ where }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getEventById(id: string) {
  return prisma.alumniEvent.findFirst({
    where: { id, deletedAt: null },
    include: {
      unit: { select: { id: true, name: true } },
      attendees: {
        include: {
          alumni: { select: { id: true, name: true, registrationNo: true, graduationYear: true } },
        },
        orderBy: { registeredAt: 'desc' },
      },
    },
  });
}

async function eventInScope(id: string, actor: AlumniActor) {
  const event = await prisma.alumniEvent.findFirst({
    where: { id, deletedAt: null },
    select: { unitId: true },
  });
  if (!event) throw Errors.notFound('Event');
  // Acara tanpa unit milik yayasan: hanya yang melihat semua unit.
  assertAlumniRecordInScope(actor, event.unitId, 'Event');
}

export async function createEvent(data: CreateEventInput, actor: AlumniActor) {
  // Pengelola satu unit yang tidak menyebut unit membuat acara unitnya sendiri.
  const scope = alumniUnitScope(actor);
  const unitId = data.unitId ?? (scope !== null && scope !== 'none' ? scope : undefined);
  if (scope !== null) assertAlumniTargetUnitInScope(actor, unitId);

  return prisma.alumniEvent.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      ...data,
      unitId,
      eventDate: new Date(data.eventDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      fee: data.fee ? new Prisma.Decimal(data.fee) : undefined,
    } as any,
    include: {
      unit: { select: { id: true, name: true } },
    },
  });
}

export async function updateEvent(id: string, data: UpdateEventInput, actor: AlumniActor) {
  await eventInScope(id, actor);
  if (data.unitId) assertAlumniTargetUnitInScope(actor, data.unitId);

  return prisma.alumniEvent.update({
    where: { id },
    data: {
      ...data,
      eventDate: data.eventDate ? new Date(data.eventDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      fee: data.fee ? new Prisma.Decimal(data.fee) : undefined,
    },
    include: {
      unit: { select: { id: true, name: true } },
    },
  });
}

export async function deleteEvent(id: string, actor: AlumniActor) {
  await eventInScope(id, actor);

  return prisma.alumniEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// ==================== EVENT ATTENDEES ====================

export async function registerForEvent(eventId: string, data: RegisterEventInput) {
  const existing = await prisma.alumniEventAttendee.findUnique({
    where: { eventId_alumniId: { eventId, alumniId: data.alumniId } },
  });

  if (existing) {
    throw new Error('Alumni already registered for this event');
  }

  return prisma.alumniEventAttendee.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      eventId,
      alumniId: data.alumniId,
      notes: data.notes,
    } as any,
    include: {
      alumni: { select: { id: true, name: true, registrationNo: true } },
      event: { select: { id: true, name: true, eventDate: true } },
    },
  });
}

async function attendeeInScope(id: string, actor: AlumniActor) {
  const attendee = await prisma.alumniEventAttendee.findUnique({
    where: { id },
    select: { eventId: true },
  });
  if (!attendee) throw Errors.notFound('Registration');
  await eventInScope(attendee.eventId, actor);
}

export async function updateAttendeeStatus(
  id: string,
  data: UpdateAttendeeStatusInput,
  actor: AlumniActor
) {
  await attendeeInScope(id, actor);

  const updateData: Prisma.AlumniEventAttendeeUpdateInput = {
    status: data.status,
  };

  if (data.status === 'confirmed') {
    updateData.confirmedAt = new Date();
  } else if (data.status === 'attended') {
    updateData.attendedAt = new Date();
  }

  return prisma.alumniEventAttendee.update({
    where: { id },
    data: updateData,
    include: {
      alumni: { select: { id: true, name: true, registrationNo: true } },
      event: { select: { id: true, name: true, eventDate: true } },
    },
  });
}

export async function cancelRegistration(id: string, actor: AlumniActor) {
  await attendeeInScope(id, actor);

  return prisma.alumniEventAttendee.delete({ where: { id } });
}

// ==================== STATISTICS ====================

export async function getAlumniStats(unitId?: string) {
  const where: Prisma.AlumniWhereInput = {
    deletedAt: null,
    ...(unitId && { unitId }),
  };

  const [totalAlumni, byStatus, byYear, donationStats] = await Promise.all([
    prisma.alumni.count({ where }),
    prisma.alumni.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
    prisma.alumni.groupBy({
      by: ['graduationYear'],
      where,
      _count: true,
      orderBy: { graduationYear: 'desc' },
      take: 10,
    }),
    prisma.alumniDonation.aggregate({
      where: { ...(unitId && { unitId }), type: 'MONETARY' },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return {
    totalAlumni,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    byYear: byYear.map((y) => ({ year: y.graduationYear, count: y._count })),
    donations: {
      totalAmount: donationStats._sum.amount || 0,
      totalCount: donationStats._count,
    },
  };
}
