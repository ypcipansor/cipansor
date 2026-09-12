/**
 * Raport Merdeka Service
 *
 * Implementasi Kurikulum Merdeka:
 * - Capaian Pembelajaran (CP) dan Tujuan Pembelajaran (TP)
 * - Projek Penguatan Profil Pelajar Pancasila (P5)
 * - Penilaian Formatif dan Sumatif
 * - Deskripsi naratif capaian kompetensi
 *
 * Referensi: Permendikbudristek No. 56 Tahun 2022 tentang Kurikulum Merdeka
 */

import { prisma } from '../../lib/prisma';
import { ApiError, ErrorCode } from '../../middleware/error';
import { isTeacherOrAboveRoleCode, isAdminRoleCode } from '../../middleware/auth';
import { RoleCode } from '@prisma/client';
import type { JwtPayload } from '../../lib/jwt';
import { P5ProjectService } from './p5-project.service';

// Profil Pelajar Pancasila - 6 Dimensi
export const PROFIL_PELAJAR_PANCASILA = [
  {
    code: 'BER',
    name: 'Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia',
    description: 'Menghargai keragaman agama dan kepercayaan, mengamalkan ajaran agama',
    elements: [
      'Akhlak beragama',
      'Akhlak pribadi',
      'Akhlak kepada manusia',
      'Akhlak kepada alam',
      'Akhlak bernegara',
    ],
  },
  {
    code: 'BKB',
    name: 'Berkebinekaan Global',
    description: 'Mempertahankan budaya luhur, lokalitas, identitas dan tetap berpikiran terbuka',
    elements: [
      'Mengenal dan menghargai budaya',
      'Kemampuan komunikasi interkultural',
      'Refleksi dan tanggung jawab terhadap pengalaman kebinekaan',
      'Berkeadilan sosial',
    ],
  },
  {
    code: 'GR',
    name: 'Gotong Royong',
    description: 'Melakukan kegiatan bersama-sama dengan sukarela',
    elements: ['Kolaborasi', 'Kepedulian', 'Berbagi'],
  },
  {
    code: 'MAN',
    name: 'Mandiri',
    description: 'Bertanggung jawab atas proses dan hasil belajarnya',
    elements: ['Kesadaran akan diri dan situasi', 'Regulasi diri'],
  },
  {
    code: 'BK',
    name: 'Bernalar Kritis',
    description: 'Mampu menganalisis informasi secara objektif',
    elements: [
      'Memperoleh dan memproses informasi dan gagasan',
      'Menganalisis dan mengevaluasi penalaran',
      'Merefleksi pemikiran dan proses berpikir',
      'Mengambil keputusan',
    ],
  },
  {
    code: 'KR',
    name: 'Kreatif',
    description: 'Mampu memodifikasi dan menghasilkan sesuatu yang orisinal',
    elements: [
      'Menghasilkan gagasan yang orisinal',
      'Menghasilkan karya dan tindakan yang orisinal',
      'Memiliki keluwesan berpikir',
    ],
  },
];

// Tabel Konversi Nilai - Kurikulum Merdeka
const NILAI_TO_CAPAIAN: Record<
  string,
  { min: number; max: number; predikat: string; deskripsi: string }
> = {
  'SANGAT BAIK': {
    min: 91,
    max: 100,
    predikat: 'A',
    deskripsi:
      'Sangat mampu mendemonstrasikan pemahaman dan keterampilan di atas standar yang ditetapkan',
  },
  BAIK: {
    min: 76,
    max: 90,
    predikat: 'B',
    deskripsi: 'Mampu mendemonstrasikan pemahaman dan keterampilan sesuai standar yang ditetapkan',
  },
  CUKUP: {
    min: 61,
    max: 75,
    predikat: 'C',
    deskripsi: 'Cukup mampu mendemonstrasikan pemahaman dan keterampilan sesuai standar minimal',
  },
  'PERLU BIMBINGAN': {
    min: 0,
    max: 60,
    predikat: 'D',
    deskripsi: 'Perlu bimbingan lebih lanjut untuk mencapai kompetensi yang diharapkan',
  },
};

/**
 * Semester date range for an academic year.
 *
 * The Indonesian school year runs July–June. Semester 1 (Ganjil) spans the
 * school-year start through Dec 31 of that calendar year; Semester 2 (Genap)
 * spans Jan 1 of the following calendar year through the school-year end.
 *
 * Both grade classification and attendance must use the SAME boundary so a
 * grade in early January is not counted in one semester while the attendance
 * for those same days is counted in the other.
 *
 * Exported for the unit tests that pin the Dec 31 "end of day" boundary.
 */
export function getSemesterDateRange(
  academicYear: { startDate: Date | string; endDate: Date | string },
  semester: number
): { startDate: Date; endDate: Date } {
  // Every caller that reaches here must pass exactly 1 or 2. The unified-raport
  // controller parses `semester` straight from the query string, so a value like
  // 99 used to fall through the `semester === 1 ? … : …` ternary and silently
  // produce a Semester 2 (Genap) raport that looked legitimate. Reject it here
  // so ALL entry points — individual, class bulk and unified — are covered by
  // the same boundary.
  if (semester !== 1 && semester !== 2) {
    throw new ApiError(ErrorCode.BAD_REQUEST, 'Semester harus bernilai 1 (Ganjil) atau 2 (Genap)');
  }
  const startDate = new Date(academicYear.startDate);
  const endDate = new Date(academicYear.endDate);
  // Anchor the boundary to the operation's timezone (WIB, UTC+7), not to the
  // server host. The exam/grade timestamps (`scheduledAt`/`gradedAt`) are
  // stored by Prisma as UTC DateTimes, and a school schedules them in WIB, so
  // the "Semester 2 starts Jan 1" rule is really "01 Jan 00:00 WIB". A distinct
  // Jan 1 *local-morning* exam (before 07:00 WIB) is stored as the *previous*
  // Dec 31 UTC evening; anchored at UTC midnight it would fall inside Semester 1.
  //
  // WIB = UTC+7, so "01 Jan 00:00 WIB" == "31 Dec 17:00 UTC". The boundary is
  // pinned with `Date.UTC` plus the constant WIB offset, which makes it
  // independent of whatever timezone this process happens to run in (on a UTC
  // host, anchoring naively at `Date.UTC(y, 11, 31, 23, 59, 59, 999)` reproduces
  // the bug above).
  //
  // End of day Dec 31 WIB (not midnight): a Dec 31-afternoon WIB exam must not
  // slip past the `<= semEndDate` check and be dropped from Semester 1. With the
  // WIB anchor, `sem1End` is the last millisecond of Dec 31 WIB and `sem2Start`
  // is the first millisecond of Jan 1 WIB, so the two windows never overlap.
  const WIB_UTC_OFFSET_HOURS = 7;
  const startYear = startDate.getUTCFullYear();
  // "01 Jan 00:00 of the next year" expressed in UTC, minus the 7h the
  // operational calendar is ahead of UTC.
  const sem2StartLocal = Date.UTC(startYear + 1, 0, 1); // 01 Jan 00:00 UTC
  const sem2Start = new Date(
    sem2StartLocal - WIB_UTC_OFFSET_HOURS * 60 * 60 * 1000 // 31 Dec 17:00 UTC
  );
  const sem1End = new Date(sem2Start.getTime() - 1); // last ms before sem2Start
  return semester === 1 ? { startDate, endDate: sem1End } : { startDate: sem2Start, endDate };
}

export class RaportMerdekaService {
  /**
   * Get all P5 dimensions
   */
  static getProfilPelajarPancasila() {
    return PROFIL_PELAJAR_PANCASILA;
  }

  /**
   * Generate Capaian Pembelajaran description based on score
   */
  static getCapaianPembelajaran(score: number): {
    predikat: string;
    level: string;
    deskripsi: string;
  } {
    for (const [level, config] of Object.entries(NILAI_TO_CAPAIAN)) {
      if (score >= config.min && score <= config.max) {
        return {
          predikat: config.predikat,
          level,
          deskripsi: config.deskripsi,
        };
      }
    }
    return {
      predikat: 'D',
      level: 'PERLU BIMBINGAN',
      deskripsi: 'Perlu bimbingan lebih lanjut untuk mencapai kompetensi yang diharapkan',
    };
  }

  /**
   * Validate whether the user may read the given student's raport for a
   * specific academic year.
   *
   * Access rules (see also {@link assertRaportAccess}, shared with the bulk
   * class endpoint so the two flows can never drift apart):
   * - SUPER_ADMIN bypasses scoping.
   * - An admin role (per-school ADMIN / legacy UNIT_ADMIN) whose `unitId` matches
   *   the student's unit may read the whole unit.
   * - Any other teacher-or-above role must cover one of the student's classes in
   *   the requested `academicYearId` (homeroom / teaches a subject there / set an
   *   exam there). A same-unit teacher is NOT granted unit-wide raport access; a
   *   cross-unit teacher with an exam OR a UserRoleAssignment in the unit alone is
   *   NOT enough.
   *
   * CRITICAL: access must be scoped to the CLASSES THE STUDENT SAT IN for the
   * requested academic year, not the student's *current* enrollment. Otherwise a
   * teacher who only teaches the student "this year" would inherit access to the
   * student's raport for every past year (a class the teacher never taught), and
   * an enrollment the student has since left would leak into the wrong years too.
   * `ClassEnrollment` itself has no `academicYearId`, but its `class` relation
   * does, so the lookup is filtered through `class.academicYearId`.
   */
  static async validateStudentScope(
    user: JwtPayload | undefined,
    studentId: string,
    academicYearId: string
  ) {
    if (!user) return;
    const userRoleCode = user.roleCode || user.role;
    if (userRoleCode === RoleCode.SUPER_ADMIN || userRoleCode === 'SUPER_ADMIN') return;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { unitId: true },
    });

    if (!student) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Siswa tidak ditemukan');
    }

    const studentClasses = await prisma.classEnrollment.findMany({
      where: { studentId, class: { academicYearId } },
      select: { classId: true },
    });

    await this.assertRaportAccess(
      user,
      student.unitId,
      studentClasses.map((c) => c.classId),
      'Anda tidak memiliki akses ke siswa di unit lain'
    );
  }

  /**
   * Shared raport access gate used by both the single-student endpoint and the
   * bulk class endpoint.
   *
   * `unitId` is the unit the raport belongs to (the student's unit, or the
   * class's unit for bulk). `classIds` are the classes the subject (the student
   * itself, or the single class for bulk) belongs to.
   *
   * - SUPER_ADMIN bypasses (handled by callers before reaching here).
   * - An admin role in the SAME unit passes.
   * - An admin role in ANOTHER unit passes only with an active educator/admin
   *   `UserRoleAssignment` in that unit.
   * - Every other role (teachers, principals, ustadz, ...) must cover one of
   *   the given classes: homeroom, teach a subject there, or set an exam for
   *   it. A classless subject (`TeacherSubject.classId = null`) only covers
   *   classes inside the teacher's OWN unit — it must never open a student of
   *   ANOTHER unit (Flag 4).
   *
   * Throws 403 with `denyMessage` when access is not granted.
   */
  private static async assertRaportAccess(
    user: JwtPayload,
    unitId: string,
    classIds: string[],
    denyMessage: string
  ) {
    const userRoleCode = user.roleCode || user.role;
    const isAdmin = isAdminRoleCode(userRoleCode) || userRoleCode === 'UNIT_ADMIN';
    const isSameUnit = !!user.unitId && unitId === user.unitId;

    if (isAdmin && isSameUnit) return;

    const userId = user.id || user.sub;
    const now = new Date();

    if (isAdmin) {
      // A cross-unit admin may open a raport only when an active educator/admin
      // assignment places them in this unit.
      const userRoleInUnit = await prisma.userRoleAssignment.findFirst({
        where: {
          userId,
          isActive: true,
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            { OR: [{ unitId }, { unitId: null }] },
          ],
        },
        include: { role: { select: { code: true } } },
      });
      if (userRoleInUnit && isTeacherOrAboveRoleCode(userRoleInUnit.role.code)) return;
      throw new ApiError(ErrorCode.FORBIDDEN, denyMessage);
    }

    // Non-admin educators must cover one of the subject's classes. This closes
    // two leaks at once: a same-unit teacher used to read every raport of the
    // unit (Flag 3), and a cross-unit teacher with a single exam / classless
    // subject / unit assignment opened every student of the unit (Flag 4).
    if (classIds.length === 0) {
      throw new ApiError(ErrorCode.FORBIDDEN, denyMessage);
    }

    const teacherAssignment = await prisma.teacher.findFirst({
      where: {
        userId,
        OR: [
          // Teacher is homeroom for one of the subject's classes (only if that
          // class is not soft-deleted).
          { homeroomClasses: { some: { id: { in: classIds }, deletedAt: null } } },
          // Teacher teaches a subject in one of the subject's classes — only an
          // ACTIVE assignment counts. A deactivated `TeacherSubject.isActive =
          // false` must not keep the raport accessible after the teacher was
          // taken off the class.
          { teacherSubjects: { some: { classId: { in: classIds }, isActive: true } } },
          // A classless subject (covers all classes) only applies inside the
          // teacher's OWN unit — a cross-unit teacher's classless subject must
          // NOT open every student of another unit. Also only active assignments.
          { unitId, teacherSubjects: { some: { classId: null, isActive: true } } },
          // Teacher set an exam for one of the subject's classes (only if that
          // class is not soft-deleted).
          { exams: { some: { classId: { in: classIds } } } },
        ],
      },
    });

    if (!teacherAssignment) {
      throw new ApiError(ErrorCode.FORBIDDEN, denyMessage);
    }
  }

  /**
   * Generate Raport Merdeka for a student
   * Includes: Intrakurikuler, Projek P5, Ekstrakurikuler
   */
  static async generateRaportMerdeka(
    studentId: string,
    academicYearId: string,
    semester: number,
    user?: JwtPayload,
    opts?: { skipScopeValidation?: boolean }
  ) {
    if (user && !opts?.skipScopeValidation) {
      // Scope access to the classes the student sat in for THIS academic year,
      // so a teacher covering the student this year cannot open past-year
      // raports for classes they never taught.
      await this.validateStudentScope(user, studentId, academicYearId);
    }
    // Helper: Determine Fase from class level or unit type
    const getFaseFromClassLevel = (levelStr?: string, unitTypeStr?: string): string => {
      const levelNum = parseInt((levelStr || '').replace(/\D/g, ''), 10);
      if (unitTypeStr === 'PAUD' || unitTypeStr === 'TK') return 'Fondasi';
      if (levelNum === 1 || levelNum === 2) return 'A';
      if (levelNum === 3 || levelNum === 4) return 'B';
      if (levelNum === 5 || levelNum === 6) return 'C';
      if (levelNum >= 7 && levelNum <= 9) return 'D';
      if (levelNum === 10) return 'E';
      if (levelNum === 11 || levelNum === 12) return 'F';
      if (unitTypeStr === 'SMP') return 'D';
      if (unitTypeStr === 'SMA' || unitTypeStr === 'SMK' || unitTypeStr === 'MA') return 'E-F';
      if (unitTypeStr === 'SD') return 'A-C';
      return 'D';
    };

    // Get student data with enrollment
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        nis: true,
        nisn: true,
        user: { select: { name: true } },
        unit: { select: { id: true, name: true, type: true } },
        enrollments: {
          where: {
            class: { academicYearId },
          },
          include: {
            class: {
              include: {
                academicYear: true,
                homeroomTeacher: {
                  include: { user: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Siswa tidak ditemukan');
    }

    const enrollment = student.enrollments[0];
    if (!enrollment) {
      throw new ApiError(
        ErrorCode.NOT_FOUND,
        'Data enrollment tidak ditemukan untuk tahun ajaran ini'
      );
    }

    // Get report card
    const reportCard = await prisma.reportCard.findUnique({
      where: {
        studentId_classId_academicYearId_semester: {
          studentId,
          classId: enrollment.classId,
          academicYearId,
          semester,
        },
      },
      include: {
        details: true,
        academicYear: true,
      },
    });

    // Bound Semester 1 and Semester 2 with the SAME boundary used by the
    // attendance summary. Note: `Grade` has NO `semester` column (verified
    // against the Prisma schema), so a grade cannot be attributed to a
    // semester directly. Instead we classify each grade by the assessment's
    // own date — `exam.scheduledAt` when the grade came from an exam,
    // otherwise `gradedAt` — using the shared semester date range so grades
    // and attendance never disagree about which side of the boundary a date
    // falls on.
    const { startDate: semStartDate, endDate: semEndDate } = getSemesterDateRange(
      enrollment.class.academicYear,
      semester
    );

    // Fetch all grades for the year, then classify in memory using the
    // assessment's own date. Keeps the window check away from `gradedAt` for
    // exam-linked grades.
    const yearGrades = await prisma.grade.findMany({
      where: {
        studentId,
        academicYearId,
      },
      include: {
        exam: true,
        subject: true,
      },
    });

    const grades = yearGrades.filter((grade) => {
      const effectiveDate = grade.exam?.scheduledAt ?? grade.gradedAt;
      return effectiveDate >= semStartDate && effectiveDate <= semEndDate;
    });

    // Group grades by subject
    const subjectGrades = new Map<string, { subject: any; scores: number[] }>();
    for (const grade of grades) {
      if (!subjectGrades.has(grade.subjectId)) {
        subjectGrades.set(grade.subjectId, {
          subject: grade.subject,
          scores: [],
        });
      }
      subjectGrades.get(grade.subjectId)!.scores.push(Number(grade.score));
    }

    // Calculate intrakurikuler assessments
    const intrakurikuler = Array.from(subjectGrades.values()).map((sg) => {
      const avgScore = sg.scores.reduce((a, b) => a + b, 0) / sg.scores.length;
      const capaian = this.getCapaianPembelajaran(avgScore);

      return {
        subjectCode: sg.subject.code,
        subjectName: sg.subject.name,
        subjectType: sg.subject.type,
        nilaiAkhir: Math.round(avgScore * 100) / 100,
        predikat: capaian.predikat,
        levelCapaian: capaian.level,
        deskripsi: this.generateSubjectDescription(sg.subject.name, avgScore, capaian),
      };
    });

    // Get P5 Project assessments (from extracurricular or special assessments)
    const p5Projects = await this.getP5Projects(studentId, academicYearId, semester);

    // Get ekstrakurikuler data
    const ekstrakurikuler = await this.getEkstrakurikulerData(studentId, academicYearId);

    // Get tahfidz summary
    const tahfidzSummary = await this.getTahfidzSummary(studentId);

    // Get attendance summary
    const attendanceSummary = await this.getAttendanceSummary(
      studentId,
      enrollment.classId,
      academicYearId,
      semester
    );

    // Get academic year info
    const academicYear = enrollment.class.academicYear;
    const computedFase = getFaseFromClassLevel(enrollment.class.level, student.unit.type);

    return {
      raportFormat: 'KURIKULUM_MERDEKA',
      siswa: {
        id: student.id,
        nis: student.nis,
        nisn: student.nisn,
        nama: student.user.name,
        kelas: enrollment.class.name,
        fase: computedFase,
        unit: student.unit.name,
        unitType: student.unit.type,
      },
      pimpinanUnit: {
        nama: '',
        jabatan: `Kepala ${student.unit.name}`,
      },
      tahunAjaran: {
        id: academicYear.id,
        tahun: academicYear.name,
        semester,
        semesterLabel: semester === 1 ? 'Ganjil' : 'Genap',
      },
      waliKelas: {
        nama: enrollment.class.homeroomTeacher?.user.name ?? '-',
      },
      // A. Capaian Pembelajaran (Intrakurikuler)
      intrakurikuler: {
        kelompokUmum: intrakurikuler.filter(
          (i) => !['TAHFIDZ', 'RELIGIOUS'].includes(i.subjectType)
        ),
        kelompokPesantren: intrakurikuler.filter((i) =>
          ['TAHFIDZ', 'RELIGIOUS'].includes(i.subjectType)
        ),
      },
      // B. Projek Penguatan Profil Pelajar Pancasila (P5)
      projekP5: p5Projects,
      // C. Ekstrakurikuler
      ekstrakurikuler,
      // D. Tahfidz Al-Qur'an Summary
      tahfidz: tahfidzSummary,
      // E. Kehadiran
      kehadiran: attendanceSummary,
      // F. Catatan Wali Kelas
      catatanWaliKelas: reportCard?.teacherNotes ?? '',
      // G. Catatan Kepala Sekolah
      catatanKepalaSekolah: reportCard?.principalNotes ?? '',
      // Metadata
      tanggalCetak: new Date().toISOString(),
      status: reportCard?.isPublished ? 'PUBLISHED' : 'DRAFT',
    };
  }

  /**
   * Generate subject-specific description based on score
   */
  private static generateSubjectDescription(
    subjectName: string,
    score: number,
    capaian: { predikat: string; level: string; deskripsi: string }
  ): string {
    const subjectDescriptions: Record<string, Record<string, string>> = {
      Matematika: {
        'SANGAT BAIK':
          'Peserta didik sangat mampu memahami konsep matematika dan menerapkannya dalam pemecahan masalah dengan sangat baik.',
        BAIK: 'Peserta didik mampu memahami konsep matematika dan menerapkannya dalam pemecahan masalah dengan baik.',
        CUKUP:
          'Peserta didik cukup mampu memahami konsep dasar matematika namun perlu latihan lebih dalam pemecahan masalah.',
        'PERLU BIMBINGAN':
          'Peserta didik memerlukan bimbingan lebih lanjut dalam memahami konsep matematika.',
      },
      'Bahasa Indonesia': {
        'SANGAT BAIK':
          'Peserta didik sangat mampu berkomunikasi dalam bahasa Indonesia baik lisan maupun tulisan dengan sangat baik.',
        BAIK: 'Peserta didik mampu berkomunikasi dalam bahasa Indonesia dengan baik.',
        CUKUP: 'Peserta didik cukup mampu berkomunikasi dalam bahasa Indonesia.',
        'PERLU BIMBINGAN':
          'Peserta didik memerlukan bimbingan dalam berkomunikasi menggunakan bahasa Indonesia.',
      },
      'Tahfidz Al-Quran': {
        'SANGAT BAIK':
          'Peserta didik menunjukkan hafalan yang sangat baik dengan tajwid dan makhorijul huruf yang sempurna.',
        BAIK: 'Peserta didik menunjukkan hafalan yang baik dengan tajwid yang sesuai.',
        CUKUP: 'Peserta didik mampu menghafal dengan cukup baik namun perlu perbaikan pada tajwid.',
        'PERLU BIMBINGAN': 'Peserta didik perlu bimbingan lebih lanjut dalam menghafal Al-Quran.',
      },
      Fiqih: {
        'SANGAT BAIK':
          'Peserta didik sangat memahami dan mampu mengamalkan hukum-hukum Islam dalam kehidupan sehari-hari.',
        BAIK: 'Peserta didik memahami hukum-hukum Islam dan berupaya mengamalkannya dengan baik.',
        CUKUP: 'Peserta didik cukup memahami hukum-hukum Islam dasar.',
        'PERLU BIMBINGAN': 'Peserta didik perlu bimbingan lebih dalam memahami hukum-hukum Islam.',
      },
    };

    return (
      subjectDescriptions[subjectName]?.[capaian.level] ??
      'Peserta didik ' +
        capaian.level.toLowerCase() +
        ' dalam menguasai kompetensi ' +
        subjectName +
        '. ' +
        capaian.deskripsi
    );
  }

  /**
   * Get P5 project assessments
   */
  private static async getP5Projects(studentId: string, academicYearId: string, semester: number) {
    // Fetch real P5 assessments from database
    let p5Assessments = await P5ProjectService.getStudentAssessmentsForReport(
      studentId,
      academicYearId
    );

    // P5Project carries NO `semester` column, so the semester is attributed by
    // when the project ran: a project belongs to Semester 1 if its startDate
    // falls inside the Semester 1 window, Semester 2 if it falls inside the
    // Semester 2 window. Without this the same academic year's two semesters
    // would be mixed into one raport.
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { startDate: true, endDate: true },
    });

    if (academicYear) {
      const { startDate: semStart, endDate: semEnd } = getSemesterDateRange(academicYear, semester);
      const inSemester = p5Assessments.filter((assessment) => {
        const projectStart = new Date(assessment.startDate);
        return (
          projectStart.getTime() >= semStart.getTime() && projectStart.getTime() <= semEnd.getTime()
        );
      });
      p5Assessments = inSemester;
    }

    if (p5Assessments.length > 0) {
      // Map to report structure
      // Note: A student might have multiple projects in a semester.
      // Ideally the report should show all of them.
      // For legacy compatibility, if the frontend expects a single object, we might need to adjust.
      // But let's return the list as "projekList" or return the first one if the frontend only handles one.

      // Let's assume we return the most recent project details for now,
      // or modify the return type to be an array if we can update the frontend too.
      // Since we are building a "Unified" report later, let's return the array structure
      // but wrapped to match what we need.

      return p5Assessments.map((assessment) => ({
        tema: assessment.theme,
        judul: assessment.title,
        deskripsiProyek: assessment.description,
        dimensiTerkait: assessment.dimensions.map((dim) => ({
          dimensiCode: dim.code,
          dimensiName: dim.name,
          capaian: dim.capaian,
          deskripsi: `Peserta didik menunjukkan perkembangan dalam ${dim.name.toLowerCase()}.`, // Ideally dynamic based on score/rubric
        })),
        catatanProses: assessment.notes || 'Peserta didik berpartisipasi dalam kegiatan projek.',
      }));
    }

    // Return empty state if no projects found (better than mock data)
    return [];
  }

  /**
   * Get ekstrakurikuler data
   */
  private static async getEkstrakurikulerData(studentId: string, academicYearId: string) {
    // Get from ExtracurricularEnrollment
    const enrollments = await prisma.extracurricularEnrollment.findMany({
      where: {
        studentId,
        extracurricular: { academicYearId },
        status: 'ACTIVE',
      },
      include: {
        extracurricular: true,
      },
    });

    return enrollments.map((enrollment) => ({
      nama: enrollment.extracurricular.name,
      kategori: enrollment.extracurricular.category,
      predikat: enrollment.grade ?? 'Baik',
      keterangan: 'Mengikuti kegiatan ' + enrollment.extracurricular.name + ' dengan baik',
    }));
  }

  /**
   * Get tahfidz summary for raport
   */
  private static async getTahfidzSummary(studentId: string) {
    // Get latest tahfidz record
    const latestRecord = await prisma.tahfidzRecord.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });

    // Get total hafalan
    const totalRecords = await prisma.tahfidzRecord.aggregate({
      where: { studentId },
      _sum: {
        totalAyah: true,
      },
      _count: true,
    });

    // Get juz 30 (Juz Amma) status
    const juzAmma = await prisma.tahfidzRecord.findMany({
      where: {
        studentId,
        juz: 30,
      },
    });

    return {
      totalJuz: latestRecord?.juz ?? 0,
      totalSurah: latestRecord?.surahNumber ?? 0,
      totalAyat: Number(totalRecords._sum.totalAyah ?? 0),
      surahTerakhir: latestRecord?.surahName ?? '-',
      targetCapaian: 'Juz 30 (Juz Amma)',
      statusCapaian: juzAmma.length > 0 ? 'TERCAPAI' : 'DALAM PROSES',
      catatan: latestRecord?.notes ?? 'Terus semangat menghafal Al-Quran',
    };
  }

  /**
   * Get attendance summary
   */
  private static async getAttendanceSummary(
    studentId: string,
    classId: string,
    academicYearId: string,
    semester: number
  ) {
    // Get academic year for date range
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
    });

    if (!academicYear) {
      return {
        hadir: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0,
        persentaseKehadiran: 0,
      };
    }

    // Define semester date range using the same boundary as grade
    // classification, so a date in early January is in the same semester for
    // both values and attendance.
    const { startDate, endDate } = getSemesterDateRange(academicYear, semester);

    const attendance = await prisma.attendance.groupBy({
      by: ['status'],
      where: {
        studentId,
        classId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: {
        status: true,
      },
    });

    const summary = {
      hadir: 0,
      izin: 0,
      sakit: 0,
      alpa: 0,
      terlambat: 0,
      total: 0,
    };

    for (const att of attendance) {
      const count = att._count.status;
      switch (att.status) {
        case 'PRESENT':
          summary.hadir = count;
          break;
        case 'EXCUSED':
          summary.izin = count;
          break;
        case 'SICK':
          summary.sakit = count;
          break;
        case 'ABSENT':
          summary.alpa = count;
          break;
        case 'LATE':
          summary.terlambat = count;
          break;
      }
      summary.total += count;
    }

    return {
      ...summary,
      persentaseKehadiran:
        summary.total > 0
          ? Math.round(((summary.hadir + summary.terlambat) / summary.total) * 100)
          : 0,
    };
  }

  /**
   * Get CP (Capaian Pembelajaran) mapping for a subject
   */
  static getCPMapping(subjectCode: string, gradeLevel: string) {
    // CP Mapping based on Kurikulum Merdeka
    const cpMap: Record<string, Record<string, { fase: string; cp: string[] }>> = {
      MTK: {
        '1-2': {
          fase: 'A',
          cp: [
            'Mengenal bilangan cacah sampai 100',
            'Operasi penjumlahan dan pengurangan sederhana',
            'Mengenal bentuk geometri dasar',
          ],
        },
        '3-4': {
          fase: 'B',
          cp: [
            'Operasi hitung bilangan cacah sampai 10.000',
            'Pecahan sederhana',
            'Pengukuran dan satuan',
            'Bangun datar dan bangun ruang',
          ],
        },
        '5-6': {
          fase: 'C',
          cp: [
            'Operasi hitung bilangan bulat',
            'Pecahan, desimal, dan persen',
            'Perbandingan dan skala',
            'Statistika dasar',
          ],
        },
        '7-9': {
          fase: 'D',
          cp: [
            'Aljabar dan persamaan linear',
            'Geometri dan transformasi',
            'Statistika dan peluang',
            'Fungsi dan grafik',
          ],
        },
        '10-12': {
          fase: 'E-F',
          cp: [
            'Trigonometri',
            'Matriks dan vektor',
            'Turunan dan integral',
            'Statistika inferensial',
          ],
        },
      },
      THF: {
        '1-2': {
          fase: 'A',
          cp: ['Hafal Juz 30 dengan tajwid yang benar', 'Mampu membaca Al-Quran dengan lancar'],
        },
        '3-4': {
          fase: 'B',
          cp: ['Hafal Juz 30 dan sebagian Juz 29', 'Pemahaman makna ayat-ayat pendek'],
        },
        '5-6': {
          fase: 'C',
          cp: ['Hafal Juz 29-30', 'Memahami tafsir surah-surah pendek'],
        },
        '7-9': {
          fase: 'D',
          cp: ['Target 5 Juz', 'Hafal dengan sanad dan tartil'],
        },
        '10-12': {
          fase: 'E-F',
          cp: ['Target 10-15 Juz', 'Khatam dengan ijazah'],
        },
      },
    };

    return cpMap[subjectCode]?.[gradeLevel] ?? null;
  }

  /**
   * Get TP (Tujuan Pembelajaran) for a subject
   */
  static getTPMapping(subjectCode: string, fase: string) {
    // TP examples based on CP
    const tpMap: Record<string, Record<string, string[]>> = {
      MTK: {
        A: [
          'Peserta didik dapat mengenal dan menyebutkan bilangan cacah 1-100',
          'Peserta didik dapat melakukan operasi penjumlahan dan pengurangan dengan benar',
          'Peserta didik dapat mengenal bentuk segitiga, persegi, dan lingkaran',
        ],
        B: [
          'Peserta didik dapat melakukan operasi perkalian dan pembagian',
          'Peserta didik dapat mengenal pecahan sederhana',
          'Peserta didik dapat mengukur panjang dan berat',
        ],
        C: [
          'Peserta didik dapat melakukan operasi bilangan bulat',
          'Peserta didik dapat mengkonversi pecahan ke desimal dan persen',
          'Peserta didik dapat menghitung mean, median, dan modus',
        ],
        D: [
          'Peserta didik dapat menyelesaikan persamaan linear',
          'Peserta didik dapat menghitung luas dan keliling bangun datar',
          'Peserta didik dapat membaca dan membuat diagram statistik',
        ],
      },
      THF: {
        A: [
          'Peserta didik dapat membaca Al-Fatihah dengan tajwid yang benar',
          'Peserta didik dapat menghafal surah-surah pendek di Juz 30',
          'Peserta didik dapat menerapkan hukum bacaan nun sukun/tanwin',
        ],
        B: [
          'Peserta didik dapat menghafal 15 surah pendek dengan lancar',
          'Peserta didik dapat menerapkan hukum bacaan mim sukun',
          'Peserta didik dapat memahami arti surah An-Nas sampai Al-Fil',
        ],
        C: [
          'Peserta didik dapat menghafal Juz 30 lengkap',
          'Peserta didik dapat menerapkan semua hukum tajwid dengan benar',
          'Peserta didik dapat murojaah hafalan secara mandiri',
        ],
        D: [
          'Peserta didik dapat menghafal 5 juz dengan tartil',
          'Peserta didik dapat memahami tafsir surah-surah yang dihafal',
          'Peserta didik dapat mengajarkan tajwid dasar kepada teman',
        ],
      },
    };

    return tpMap[subjectCode]?.[fase] ?? [];
  }

  /**
   * Generate bulk raport for a class
   */
  static async generateBulkRaportMerdeka(
    classId: string,
    academicYearId: string,
    semester: number,
    user?: JwtPayload
  ) {
    // Enforce educator authority check for bulk raport generation using the
    // canonical teacher-or-above RoleCode group shared with the middleware —
    // not a hand-rolled `endsWith('_GURU')` fragment that drifts from the real
    // role vocabulary.
    if (user) {
      const roleCode = user.roleCode || user.role;
      if (roleCode !== RoleCode.SUPER_ADMIN && !isTeacherOrAboveRoleCode(roleCode)) {
        throw new ApiError(
          ErrorCode.FORBIDDEN,
          'Akses ditolak. Hanya pendidik dan pengelola yang dapat mengakses raport kelas.'
        );
      }
    }

    // Get class with academic year check and unit scope check
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: {
        unitId: true,
        academicYearId: true,
      },
    });

    if (!classInfo || classInfo.academicYearId !== academicYearId) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Kelas tidak ditemukan untuk tahun ajaran ini');
    }

    if (user && user.role !== 'SUPER_ADMIN' && user.roleCode !== 'SUPER_ADMIN') {
      // Same gate as the single-student endpoint (`assertRaportAccess`), so the
      // two flows can never drift apart. A same-unit non-admin teacher is NOT
      // granted a class raport for a class they do not teach (Flag 4 applies to
      // the bulk path too). A cross-unit teacher must cover THIS class — an exam
      // elsewhere in the unit, or a classless subject in another unit, no longer
      // opens it.
      await this.assertRaportAccess(
        user,
        classInfo.unitId,
        [classId],
        'Anda tidak memiliki akses ke kelas di unit lain'
      );
    }

    const enrollments = await prisma.classEnrollment.findMany({
      where: {
        classId,
        status: 'active',
      },
      include: {
        student: { select: { id: true } },
      },
    });

    // The class-level gate (assertRaportAccess above) already proved access to
    // THIS class, and every student below is enrolled in it for this academic
    // year, so re-running the per-student scope lookup would repeat the same
    // student/enrollment/teacher queries once per student for no additional
    // information. Skip it on the bulk path.
    const reports = await Promise.all(
      enrollments.map((enrollment) =>
        this.generateRaportMerdeka(enrollment.student.id, academicYearId, semester, user, {
          skipScopeValidation: true,
        })
      )
    );

    return {
      classId,
      academicYearId,
      semester,
      totalStudents: reports.length,
      reports,
    };
  }
}

export default RaportMerdekaService;
