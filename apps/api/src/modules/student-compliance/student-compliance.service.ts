import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/** Fields required for a student record to count as Dapodik-complete. */
const REQUIRED_FIELDS = [
  'nisn',
  'nik',
  'noKK',
  'birthPlace',
  'birthDate',
  'religion',
  'address',
  'provinceId',
  'regencyId',
  'districtId',
  'villageId',
  'fatherName',
  'motherName',
] as const;

export interface CompletenessFilters {
  unitId?: string;
  status?: string;
}

/** Full compliance (Indonesia-specific) view of a single student. */
export function getComplianceByStudent(studentId: string) {
  return prisma.student.findUnique({
    where: { id: studentId },
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

export function findStudentById(studentId: string) {
  return prisma.student.findUnique({ where: { id: studentId } });
}

/** True if another student already uses this NISN. */
export async function isNisnTaken(nisn: string, excludeStudentId: string): Promise<boolean> {
  const existing = await prisma.student.findFirst({
    where: { nisn, id: { not: excludeStudentId } },
  });
  return Boolean(existing);
}

/** True if another student already uses this NIK. */
export async function isNikTaken(nik: string, excludeStudentId: string): Promise<boolean> {
  const existing = await prisma.student.findFirst({
    where: { nik, id: { not: excludeStudentId } },
  });
  return Boolean(existing);
}

/** Update a student's compliance fields (dates coerced from ISO strings). */
export function updateCompliance(studentId: string, data: Record<string, any>) {
  const { fatherBirthDate, motherBirthDate, ...rest } = data;
  return prisma.student.update({
    where: { id: studentId },
    data: {
      ...rest,
      fatherBirthDate: fatherBirthDate ? new Date(fatherBirthDate) : undefined,
      motherBirthDate: motherBirthDate ? new Date(motherBirthDate) : undefined,
    },
  });
}

/** Completeness report + summary across students (optionally unit/status scoped). */
export async function getCompletenessReport(filters: CompletenessFilters) {
  const whereClause: Prisma.StudentWhereInput = {};
  if (filters.unitId) whereClause.unitId = filters.unitId;
  if (filters.status) whereClause.status = filters.status;

  const students = await prisma.student.findMany({
    where: whereClause,
    include: {
      user: { select: { name: true } },
      unit: { select: { name: true } },
      enrollments: {
        where: { status: 'ACTIVE' },
        include: { class: { select: { name: true } } },
        take: 1,
      },
    },
  });

  const report = students.map((student) => {
    const filledFields = REQUIRED_FIELDS.filter((field) => (student as any)[field]);
    const completeness = Math.round((filledFields.length / REQUIRED_FIELDS.length) * 100);
    const missingFields = REQUIRED_FIELDS.filter((field) => !(student as any)[field]);

    return {
      id: student.id,
      name: student.user.name,
      unit: student.unit?.name,
      class: student.enrollments[0]?.class?.name || '-',
      completeness,
      missingFields,
      status: completeness === 100 ? 'complete' : completeness >= 70 ? 'partial' : 'incomplete',
    };
  });

  const summary = {
    total: report.length,
    complete: report.filter((r) => r.status === 'complete').length,
    partial: report.filter((r) => r.status === 'partial').length,
    incomplete: report.filter((r) => r.status === 'incomplete').length,
    averageCompleteness:
      Math.round(report.reduce((acc, r) => acc + r.completeness, 0) / report.length) || 0,
  };

  return { summary, students: report };
}

/** Students ready for Dapodik export + a count of those not yet ready. */
export async function getDapodikReady(filters: { unitId?: string }) {
  // Dapodik readiness gates on the optional national identifiers; birthPlace
  // and birthDate are non-nullable columns (always present), so a `not: null`
  // filter on them is a redundant no-op and is intentionally omitted.
  const whereClause: Prisma.StudentWhereInput = {
    nisn: { not: null },
    nik: { not: null },
  };
  if (filters.unitId) whereClause.unitId = filters.unitId;

  const readyStudents = await prisma.student.findMany({
    where: whereClause,
    include: {
      user: { select: { name: true } },
      unit: { select: { name: true, npsn: true } },
      enrollments: {
        where: { status: 'ACTIVE' },
        include: { class: { select: { name: true } } },
        take: 1,
      },
    },
  });

  const notReadyCount = await prisma.student.count({
    where: {
      OR: [
        { nisn: { equals: null } },
        { nik: { equals: null } },
        { birthPlace: '' },
        { birthDate: { equals: null } },
      ] as any,
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
    },
  });

  return {
    summary: {
      ready: readyStudents.length,
      notReady: notReadyCount,
      total: readyStudents.length + notReadyCount,
    },
    students: readyStudents.map((s) => ({
      id: s.id,
      nisn: s.nisn,
      nik: s.nik,
      name: s.user.name,
      birthPlace: s.birthPlace,
      birthDate: s.birthDate,
      gender: s.gender,
      religion: s.religion,
      address: s.address,
      transportMode: s.transportMode,
      distanceToSchool: s.distanceToSchool,
      specialNeeds: s.specialNeeds,
      kipNumber: s.kipNumber,
      unit: s.unit?.name,
      npsn: s.unit?.npsn,
      class: s.enrollments[0]?.class?.name || '-',
    })),
  };
}

/** Apply many compliance updates, collecting per-row success/failure. */
export async function bulkUpdate(updates: Array<Record<string, any>>) {
  const results: Array<{ studentId: string; success: true; name: string }> = [];
  const errors: Array<{ studentId: string | null; error: string }> = [];

  for (const update of updates) {
    try {
      const { studentId, ...data } = update;
      if (!studentId) {
        errors.push({ studentId: null, error: 'Student ID is required' });
        continue;
      }

      const processedData: any = { ...data };
      if (data.fatherBirthDate) processedData.fatherBirthDate = new Date(data.fatherBirthDate);
      if (data.motherBirthDate) processedData.motherBirthDate = new Date(data.motherBirthDate);

      const updated = await prisma.student.update({
        where: { id: studentId },
        data: processedData,
        include: { user: { select: { name: true } } },
      });
      results.push({ studentId, success: true, name: updated.user.name });
    } catch (error: any) {
      errors.push({ studentId: update.studentId, error: error.message || 'Update failed' });
    }
  }

  return { successful: results, failed: errors };
}
