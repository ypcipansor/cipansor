import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  CLASS_ENROLLMENT_STATUS,
  isStudentStatus,
  STUDENT_STATUS_VALUES,
  type UpdateStudentComplianceInput,
} from '@cipansor/shared';
import { ApiError, Errors } from '@/middleware/error';
import { assertStudentIdentifiersAvailable } from '@/modules/students/student-identifiers';
import { seesAllUnits } from '@/utils/resolve-unit-id';

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

/** Siapa yang meminta — cukup untuk menentukan lingkup unitnya. */
export interface ComplianceActor {
  roleCode?: string | null;
  role?: string | null;
  unitId?: string | null;
}

/**
 * Lingkup unit. Modul ini memuat NIK anak, NIK dan penghasilan orang tua, dan
 * nomor KIP — data pribadi spesifik (UU 27/2022 Ps. 4). Sampai 2026-09-14 tidak
 * satu pun fungsinya memeriksa unit, dan GET per santri tidak memeriksa peran:
 * di rig, akun SISWA SD IT membaca NIK dan penghasilan orang tua santri SMP IT,
 * dan tata usaha SD IT mengubah RT santri SMP IT. Aturannya sama dengan Daftar
 * Santri (`student.service.findAll`): yayasan dan layanan lintas unit melihat
 * semua unit, selain itu hanya unitnya sendiri.
 */
function lingkupUnit(actor: ComplianceActor): Prisma.StudentWhereInput {
  return seesAllUnits(actor) ? {} : { unitId: actor.unitId || 'none' };
}

/** Unit laporan: pilihan pemanggil hanya berlaku bagi yang melihat semua unit. */
function unitLaporan(actor: ComplianceActor, diminta?: string): string | undefined {
  return seesAllUnits(actor) ? diminta : actor.unitId || 'none';
}

/**
 * Full compliance (Indonesia-specific) view of a single student. Santri di luar
 * lingkup unit pemanggil dijawab sama dengan santri yang tidak ada (null → 404),
 * supaya keberadaannya pun tidak bocor.
 */
export function getComplianceByStudent(studentId: string, actor: ComplianceActor) {
  return prisma.student.findFirst({
    where: { id: studentId, deletedAt: null, ...lingkupUnit(actor) },
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

/**
 * Wilayah domisili mengikuti desanya. Formulir dulu hanya mengirim `villageId`,
 * sehingga provinsi/kabupaten/kecamatan — tiga dari 13 kolom wajib Dapodik di
 * REQUIRED_FIELDS — tidak pernah terisi dan tak ada santri yang bisa 100%.
 * Kini induknya diturunkan dari desa di server; induk yang dikirim dan
 * bertentangan dengan desanya ditolak, bukan ditimpa diam-diam.
 */
async function resolveWilayah(input: UpdateStudentComplianceInput) {
  if (!input.villageId) return {};

  const village = await prisma.village.findUnique({
    where: { id: input.villageId },
    select: {
      districtId: true,
      district: { select: { regencyId: true, regency: { select: { provinceId: true } } } },
    },
  });
  if (!village) {
    throw Errors.badRequest('Kelurahan/desa tidak dikenal. Pilih ulang dari daftar wilayah.');
  }

  const turunan = {
    districtId: village.districtId,
    regencyId: village.district.regencyId,
    provinceId: village.district.regency.provinceId,
  };
  for (const [kolom, nilai] of Object.entries(turunan) as [keyof typeof turunan, string][]) {
    if (input[kolom] && input[kolom] !== nilai) {
      throw Errors.badRequest(
        'Provinsi, kabupaten/kota, dan kecamatan tidak cocok dengan kelurahan/desa yang dipilih.'
      );
    }
  }
  return turunan;
}

/**
 * Simpan data kelengkapan. `input` sudah lolos `updateStudentComplianceSchema`
 * (ketat, nama kolom Prisma), jadi di sini tidak ada lagi pemetaan nama atau
 * konversi tanggal — dan tidak ada kolom lain yang bisa ikut tertulis.
 */
export async function updateCompliance(
  studentId: string,
  input: UpdateStudentComplianceInput,
  actor: ComplianceActor
) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null, ...lingkupUnit(actor) },
    select: { id: true, nisn: true, nik: true },
  });
  if (!student) throw Errors.notFound('Student');

  await assertStudentIdentifiersAvailable(input, student);
  const wilayah = await resolveWilayah(input);

  return prisma.student.update({
    where: { id: studentId },
    data: { ...input, ...wilayah },
  });
}

/** Completeness report + summary across students (optionally unit/status scoped). */
export async function getCompletenessReport(filters: CompletenessFilters, actor: ComplianceActor) {
  // `status` datang mentah dari query string. Ejaan yang tidak ada di kolomnya
  // (mis. "ACTIVE") dulu menghasilkan laporan kosong tanpa galat — sama dengan
  // laporan Daftar Santri di reporting.service.
  if (filters.status && !isStudentStatus(filters.status)) {
    throw Errors.badRequest(
      `Status santri tidak dikenal: "${filters.status}". Nilai yang sah: ${STUDENT_STATUS_VALUES.join(', ')}.`
    );
  }
  const whereClause: Prisma.StudentWhereInput = {};
  const unitId = unitLaporan(actor, filters.unitId);
  if (unitId) whereClause.unitId = unitId;
  if (filters.status) whereClause.status = filters.status;

  const students = await prisma.student.findMany({
    where: whereClause,
    include: {
      user: { select: { name: true } },
      unit: { select: { name: true } },
      enrollments: {
        where: { status: CLASS_ENROLLMENT_STATUS.ACTIVE },
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
      nis: student.nis,
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
export async function getDapodikReady(filters: { unitId?: string }, actor: ComplianceActor) {
  const unitId = unitLaporan(actor, filters.unitId);
  // Dapodik readiness gates on the optional national identifiers; birthPlace
  // and birthDate are non-nullable columns (always present), so a `not: null`
  // filter on them is a redundant no-op and is intentionally omitted.
  const whereClause: Prisma.StudentWhereInput = {
    nisn: { not: null },
    nik: { not: null },
  };
  if (unitId) whereClause.unitId = unitId;

  const readyStudents = await prisma.student.findMany({
    where: whereClause,
    include: {
      user: { select: { name: true } },
      unit: { select: { name: true, npsn: true } },
      enrollments: {
        where: { status: CLASS_ENROLLMENT_STATUS.ACTIVE },
        include: { class: { select: { name: true } } },
        take: 1,
      },
    },
  });

  // `birthDate` NOT NULL: `{ birthDate: { equals: null } }` (dulu ada di sini,
  // dibungkus `as any`) ditolak Prisma 7 — "Argument `equals` is missing" — dan
  // setiap pembukaan Kelengkapan Data dijawab 500. Tanpa `as any` kompilator
  // sudah menolaknya.
  const notReadyCount = await prisma.student.count({
    where: {
      OR: [{ nisn: null }, { nik: null }, { birthPlace: '' }],
      ...(unitId ? { unitId } : {}),
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
      nis: s.nis,
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

/**
 * Terapkan banyak pembaruan, satu per satu, lewat jalur yang SAMA dengan PUT
 * tunggal (keunikan NISN/NIK dan wilayah ikut diperiksa). Dulu setiap baris
 * langsung ke `prisma.student.update` dengan isi apa pun yang dikirim.
 */
export async function bulkUpdate(
  updates: Array<UpdateStudentComplianceInput & { studentId: string }>,
  actor: ComplianceActor
) {
  const successful: Array<{ studentId: string; success: true }> = [];
  const failed: Array<{ studentId: string; error: string }> = [];

  for (const { studentId, ...input } of updates) {
    try {
      await updateCompliance(studentId, input, actor);
      successful.push({ studentId, success: true });
    } catch (error) {
      // Pesan ApiError ditulis untuk petugas; galat lain (basis data) tidak
      // diteruskan mentah ke klien.
      failed.push({
        studentId,
        error: error instanceof ApiError ? error.message : 'Gagal menyimpan baris ini',
      });
    }
  }

  return { successful, failed };
}
