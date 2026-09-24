import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/** Fields required for a teacher record to count as compliance-complete. */
const REQUIRED_FIELDS = [
  'nik',
  'nuptk',
  'birthPlace',
  'birthDate',
  'employmentStatus',
  'lastEducation',
  'address',
  'provinceId',
  'regencyId',
  'districtId',
  'villageId',
] as const;

export interface CompletenessFilters {
  unitId?: string;
  status?: string;
}

/** Full compliance (Indonesia-specific) view of a single teacher. */
export function getComplianceByTeacher(teacherId: string) {
  return prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, name: true } },
      province: { select: { id: true, name: true, code: true } },
      regency: { select: { id: true, name: true, code: true } },
      district: { select: { id: true, name: true, code: true } },
      village: { select: { id: true, name: true, code: true } },
    },
  });
}

export function findTeacherById(teacherId: string) {
  return prisma.teacher.findUnique({ where: { id: teacherId } });
}

/** True if another teacher already uses this NIK. */
export async function isNikTaken(nik: string, excludeTeacherId: string): Promise<boolean> {
  const existing = await prisma.teacher.findFirst({
    where: { nik, id: { not: excludeTeacherId } },
  });
  return Boolean(existing);
}

/** Update a teacher's compliance fields (whitelisted; dates coerced from ISO strings). */
export function updateCompliance(teacherId: string, body: Record<string, any>) {
  const {
    nik,
    noKK,
    gender,
    birthPlace,
    birthDate,
    religion,
    nationality,
    address,
    rt,
    rw,
    postalCode,
    provinceId,
    regencyId,
    districtId,
    villageId,
    employmentStatus,
    pangkat,
    golongan,
    tmtPNS,
    tmtGuru,
    skNumber,
    skDate,
    lastEducation,
    lastEducationYear,
    lastEducationMajor,
    lastEducationInstitution,
    certificationStatus,
    certificationNumber,
    certificationYear,
    certificationSubject,
    bankName,
    bankAccountNumber,
    bankAccountName,
    weeklyHours,
  } = body;

  return prisma.teacher.update({
    where: { id: teacherId },
    data: {
      nik,
      noKK,
      gender,
      birthPlace,
      birthDate: birthDate ? new Date(birthDate) : undefined,
      religion,
      nationality,
      address,
      rt,
      rw,
      postalCode,
      provinceId,
      regencyId,
      districtId,
      villageId,
      employmentStatus,
      pangkat,
      golongan,
      tmtPNS: tmtPNS ? new Date(tmtPNS) : undefined,
      tmtGuru: tmtGuru ? new Date(tmtGuru) : undefined,
      skNumber,
      skDate: skDate ? new Date(skDate) : undefined,
      lastEducation,
      lastEducationYear,
      lastEducationMajor,
      lastEducationInstitution,
      certificationStatus,
      certificationNumber,
      certificationYear,
      certificationSubject,
      bankName,
      bankAccountNumber,
      bankAccountName,
      weeklyHours,
    },
  });
}

/** Completeness report + summary across teachers (optionally unit/status scoped). */
export async function getCompletenessReport(filters: CompletenessFilters) {
  const whereClause: Prisma.TeacherWhereInput = {};
  if (filters.unitId) whereClause.unitId = filters.unitId;

  const teachers = await prisma.teacher.findMany({
    where: whereClause,
    include: {
      user: { select: { name: true } },
      unit: { select: { name: true } },
    },
  });

  const report = teachers.map((teacher) => {
    const filledFields = REQUIRED_FIELDS.filter((field) => (teacher as any)[field]);
    const completeness = Math.round((filledFields.length / REQUIRED_FIELDS.length) * 100);
    const missingFields = REQUIRED_FIELDS.filter((field) => !(teacher as any)[field]);
    const hasCertification = teacher.certificationStatus !== null;

    return {
      id: teacher.id,
      name: teacher.user.name,
      nip: teacher.nip,
      nuptk: teacher.nuptk,
      unit: teacher.unit?.name,
      completeness,
      missingFields,
      hasCertification,
      certificationStatus: teacher.certificationStatus,
      status: completeness === 100 ? 'complete' : completeness >= 70 ? 'partial' : 'incomplete',
    };
  });

  const filteredReport = filters.status
    ? report.filter((r) => r.status === filters.status)
    : report;

  const summary = {
    total: report.length,
    complete: report.filter((r) => r.status === 'complete').length,
    partial: report.filter((r) => r.status === 'partial').length,
    incomplete: report.filter((r) => r.status === 'incomplete').length,
    averageCompleteness:
      Math.round(report.reduce((acc, r) => acc + r.completeness, 0) / report.length) || 0,
    certified: teachers.filter((t) => t.certificationStatus === 'SUDAH_SERTIFIKASI').length,
    notCertified: teachers.filter((t) => t.certificationStatus !== 'SUDAH_SERTIFIKASI').length,
  };

  return { summary, teachers: filteredReport };
}

/** Teachers ready for SIMTUN/EMIS export + a count of those not yet ready. */
export async function getSimtunReady(filters: { unitId?: string }) {
  const whereClause: Prisma.TeacherWhereInput = {
    nik: { not: null },
    nuptk: { not: null },
    birthPlace: { not: null },
    birthDate: { not: null },
    employmentStatus: { not: null },
  };
  if (filters.unitId) whereClause.unitId = filters.unitId;

  const readyTeachers = await prisma.teacher.findMany({
    where: whereClause,
    include: {
      user: { select: { name: true } },
      unit: { select: { name: true, npsn: true } },
      teacherSubjects: { include: { subject: { select: { name: true, code: true } } } },
    },
  });

  const notReadyCount = await prisma.teacher.count({
    where: {
      OR: [
        { nik: null },
        { nuptk: null },
        { birthPlace: null },
        { birthDate: null },
        { employmentStatus: null },
      ],
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
    },
  });

  return {
    summary: {
      ready: readyTeachers.length,
      notReady: notReadyCount,
      total: readyTeachers.length + notReadyCount,
    },
    teachers: readyTeachers.map((t) => ({
      id: t.id,
      nip: t.nip,
      nuptk: t.nuptk,
      nik: t.nik,
      name: t.user.name,
      birthPlace: t.birthPlace,
      birthDate: t.birthDate,
      gender: t.gender,
      religion: t.religion,
      employmentStatus: t.employmentStatus,
      pangkat: t.pangkat,
      golongan: t.golongan,
      lastEducation: t.lastEducation,
      lastEducationMajor: t.lastEducationMajor,
      certificationStatus: t.certificationStatus,
      certificationNumber: t.certificationNumber,
      certificationSubject: t.certificationSubject,
      weeklyHours: t.weeklyHours,
      address: t.address,
      unit: t.unit?.name,
      npsn: t.unit?.npsn,
      subjects: t.teacherSubjects.map((ts) => ts.subject.name),
    })),
  };
}

/** Certification-status report grouped by subject and year. */
export async function getCertificationReport(filters: { unitId?: string }) {
  const whereClause: Prisma.TeacherWhereInput = {};
  if (filters.unitId) whereClause.unitId = filters.unitId;

  const teachers = await prisma.teacher.findMany({
    where: whereClause,
    include: {
      user: { select: { name: true } },
      unit: { select: { name: true } },
      teacherSubjects: { include: { subject: { select: { name: true } } } },
    },
    orderBy: [{ certificationStatus: 'asc' }, { user: { name: 'asc' } }],
  });

  const certified = teachers.filter((t) => t.certificationStatus === 'SUDAH_SERTIFIKASI');
  const notCertified = teachers.filter((t) => t.certificationStatus !== 'SUDAH_SERTIFIKASI');

  const bySubject = certified.reduce((acc: any, t) => {
    const subject = t.certificationSubject || 'Unknown';
    if (!acc[subject]) acc[subject] = [];
    acc[subject].push({
      id: t.id,
      name: t.user.name,
      nuptk: t.nuptk,
      certificationNumber: t.certificationNumber,
      certificationYear: t.certificationYear,
    });
    return acc;
  }, {});

  const byYear = certified.reduce((acc: any, t) => {
    const year = t.certificationYear?.toString() || 'Unknown';
    if (!acc[year]) acc[year] = 0;
    acc[year]++;
    return acc;
  }, {});

  return {
    summary: {
      total: teachers.length,
      certified: certified.length,
      notCertified: notCertified.length,
      certificationRate: Math.round((certified.length / teachers.length) * 100) || 0,
    },
    bySubject,
    byYear,
    certified: certified.map((t) => ({
      id: t.id,
      name: t.user.name,
      nip: t.nip,
      nuptk: t.nuptk,
      certificationNumber: t.certificationNumber,
      certificationSubject: t.certificationSubject,
      certificationYear: t.certificationYear,
      unit: t.unit?.name,
    })),
    notCertified: notCertified.map((t) => ({
      id: t.id,
      name: t.user.name,
      nip: t.nip,
      nuptk: t.nuptk,
      lastEducation: t.lastEducation,
      lastEducationMajor: t.lastEducationMajor,
      specialization: t.specialization,
      unit: t.unit?.name,
    })),
  };
}

/** Apply many compliance updates, collecting per-row success/failure. */
export async function bulkUpdate(updates: Array<Record<string, any>>) {
  const results: Array<{ teacherId: string; success: true; name: string }> = [];
  const errors: Array<{ teacherId: string | null; error: string }> = [];
  const dateFields = ['birthDate', 'tmtPNS', 'tmtGuru', 'skDate'];

  for (const update of updates) {
    try {
      const { teacherId, ...data } = update;
      if (!teacherId) {
        errors.push({ teacherId: null, error: 'Teacher ID is required' });
        continue;
      }

      const processedData: any = { ...data };
      for (const field of dateFields) {
        if (data[field]) processedData[field] = new Date(data[field]);
      }

      const updated = await prisma.teacher.update({
        where: { id: teacherId },
        data: processedData,
        include: { user: { select: { name: true } } },
      });
      results.push({ teacherId, success: true, name: updated.user.name });
    } catch (error: any) {
      errors.push({ teacherId: update.teacherId, error: error.message || 'Update failed' });
    }
  }

  return { successful: results, failed: errors };
}
