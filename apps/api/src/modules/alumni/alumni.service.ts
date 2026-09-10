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
        student: { select: { id: true, nisn: true, nik: true } },
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
      ? alm.student.grades.reduce((sum, g) => sum + Number(g.percentage), 0) / alm.student.grades.length
      : null;

    const maxJuz = alm.student?.tahfidzRecords.length
      ? Math.max(...alm.student.tahfidzRecords.map(r => r.juz))
      : alm.tahfidzLevel ? (parseInt(alm.tahfidzLevel, 10) || 0) : 0;

    const hasHigherEd = alm.educations.some(e =>
      e.degree.includes('S1') || e.degree.includes('Bachelor') || e.degree.includes('S2')
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
      student: { select: { id: true, nisn: true, nik: true } },
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

export async function createAlumni(data: CreateAlumniInput) {
  const year = data.graduationYear;
  const count = await prisma.alumni.count({
    where: { graduationYear: year },
  });
  const registrationNo = `ALM-${year}-${String(count + 1).padStart(4, '0')}`;

  return prisma.alumni.create({
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
}

export async function updateAlumni(id: string, data: UpdateAlumniInput) {
  return prisma.alumni.update({
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
}

export async function deleteAlumni(id: string) {
  return prisma.alumni.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function convertFromStudent(studentId: string, data: ConvertFromStudentInput) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: true },
  });

  if (!student) {
    throw new Error('Student not found');
  }

  const year = student.graduateYear || new Date().getFullYear();
  const count = await prisma.alumni.count({
    where: { graduationYear: year },
  });
  const registrationNo = `ALM-${year}-${String(count + 1).padStart(4, '0')}`;

  const [alumni] = await prisma.$transaction([
    prisma.alumni.create({
      data: {
        studentId: student.id,
        unitId: student.unitId,
        registrationNo,
        name: student.user.name,
        gender: student.gender,
        birthPlace: student.birthPlace,
        birthDate: student.birthDate,
        graduationYear: year,
        graduationDate: data.graduationDate ? new Date(data.graduationDate) : new Date(),
        lastClass: data.lastClass,
        tahfidzLevel: data.tahfidzLevel,
        email: student.user.email,
        phone: student.parentPhone,
        address: student.address,
        notes: data.notes,
      } as any,
      include: {
        unit: { select: { id: true, name: true, type: true } },
        student: { select: { id: true, nisn: true, nik: true } },
      },
    }),
    prisma.student.update({
      where: { id: studentId },
      data: {
        status: 'alumni',
        graduateYear: year,
      },
    }),
  ]);

  return alumni;
}

export async function batchGraduateStudents(data: {
  studentIds: string[];
  graduationDate: string;
  graduationYear: number;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const studentId of data.studentIds) {
      const student = await tx.student.findUnique({
        where: { id: studentId },
        include: { user: true, enrollments: { where: { status: 'active' }, include: { class: true }, take: 1 } },
      });

      if (!student) continue;

      const count = await tx.alumni.count({
        where: { graduationYear: data.graduationYear },
      });
      const registrationNo = `ALM-${data.graduationYear}-${String(count + 1).padStart(4, '0')}`;

      const alumni = await tx.alumni.create({
        data: {
          studentId: student.id,
          unitId: student.unitId,
          registrationNo,
          name: student.user.name,
          gender: student.gender,
          birthPlace: student.birthPlace,
          birthDate: student.birthDate,
          graduationYear: data.graduationYear,
          graduationDate: new Date(data.graduationDate),
          lastClass: student.enrollments[0]?.class.name || '-',
          email: student.user.email,
          phone: student.parentPhone,
          address: student.address,
          notes: data.notes,
        } as any,
      });

      await tx.student.update({
        where: { id: studentId },
        data: { status: 'alumni', graduateYear: data.graduationYear },
      });

      await tx.classEnrollment.updateMany({
        where: { studentId, status: 'active' },
        data: { status: 'completed' },
      });

      results.push(alumni);
    }
    return results;
  });
}

export async function getCareersByAlumni(alumniId: string) {
  return prisma.alumniCareer.findMany({
    where: { alumniId },
    orderBy: { startDate: 'desc' },
  });
}

export async function createCareer(alumniId: string, data: CreateCareerInput) {
  if (data.isCurrent) {
    await prisma.alumniCareer.updateMany({
      where: { alumniId, isCurrent: true },
      data: { isCurrent: false },
    });
  }

  return prisma.alumniCareer.create({
    data: {
      alumniId,
      ...data,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    } as any,
  });
}

export async function updateCareer(id: string, data: UpdateCareerInput) {
  const career = await prisma.alumniCareer.findUnique({ where: { id } });
  if (!career) throw new Error('Career not found');

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

export async function deleteCareer(id: string) {
  return prisma.alumniCareer.delete({ where: { id } });
}

export async function getEducationsByAlumni(alumniId: string) {
  return prisma.alumniEducation.findMany({
    where: { alumniId },
    orderBy: { startYear: 'desc' },
  });
}

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

export async function createEducation(alumniId: string, data: CreateEducationInput) {
  return prisma.alumniEducation.create({
    data: {
      alumniId,
      ...data,
    } as any,
  });
}

export async function updateEducation(id: string, data: UpdateEducationInput) {
  return prisma.alumniEducation.update({
    where: { id },
    data,
  });
}

export async function deleteEducation(id: string) {
  return prisma.alumniEducation.delete({ where: { id } });
}

export async function getDonations(query: DonationQueryInput) {
  const { page, limit, alumniId, unitId, type, startDate, endDate } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.AlumniDonationWhereInput = {
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

export async function createDonation(alumniId: string, data: CreateDonationInput) {
  const year = new Date().getFullYear();
  const count = await prisma.alumniDonation.count({
    where: { donatedAt: { gte: new Date(`${year}-01-01`) } },
  });
  const receiptNo = data.receiptNo || `DON-${year}-${String(count + 1).padStart(5, '0')}`;

  return prisma.alumniDonation.create({
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

export async function updateDonation(id: string, data: UpdateDonationInput) {
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

export async function deleteDonation(id: string) {
  return prisma.alumniDonation.delete({ where: { id } });
}

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

export async function createEvent(data: CreateEventInput) {
  return prisma.alumniEvent.create({
    data: {
      ...data,
      eventDate: new Date(data.eventDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      fee: data.fee ? new Prisma.Decimal(data.fee) : undefined,
    } as any,
    include: {
      unit: { select: { id: true, name: true } },
    },
  });
}

export async function updateEvent(id: string, data: UpdateEventInput) {
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

export async function deleteEvent(id: string) {
  return prisma.alumniEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function registerForEvent(eventId: string, data: RegisterEventInput) {
  const existing = await prisma.alumniEventAttendee.findUnique({
    where: { eventId_alumniId: { eventId, alumniId: data.alumniId } },
  });

  if (existing) {
    throw new Error('Alumni already registered for this event');
  }

  return prisma.alumniEventAttendee.create({
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

export async function updateAttendeeStatus(id: string, data: UpdateAttendeeStatusInput) {
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

export async function cancelRegistration(id: string) {
  return prisma.alumniEventAttendee.delete({ where: { id } });
}

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
      _count: { graduationYear: true },
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
    byYear: byYear.map((y) => ({ year: y.graduationYear, count: y._count.graduationYear })),
    donations: {
      totalAmount: donationStats._sum.amount || 0,
      totalCount: donationStats._count,
    },
  };
}
