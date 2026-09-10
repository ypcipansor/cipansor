import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// =====================================
// TYPES
// =====================================

interface SkhunData {
  student: {
    id: string;
    name: string;
    nisn: string | null;
    birthPlace: string | null;
    birthDate: Date | null;
    gender: string | null;
    parentName: string | null;
  };
  school: {
    name: string;
    npsn: string | null;
    address: string | null;
    accreditation: string | null;
  };
  academicYear: {
    id: string;
    name: string;
  };
  grades: Array<{
    subjectName: string;
    subjectCode: string;
    score: number;
    isPassed: boolean;
    examType: string;
  }>;
  average: number;
  totalScore: number;
  isPassed: boolean;
  rank: number | null;
  totalStudents: number;
  skhunNumber: string;
  issuedDate: Date;
  examPeriod: string;
}

interface TranscriptData {
  student: {
    id: string;
    name: string;
    nisn: string | null;
    birthPlace: string | null;
    birthDate: Date | null;
    gender: string | null;
    parentName: string | null;
    admissionYear: string;
    graduationYear: string;
  };
  school: {
    name: string;
    npsn: string | null;
    address: string | null;
    level: string;
  };
  semesters: Array<{
    semester: number;
    academicYear: string;
    subjects: Array<{
      name: string;
      code: string;
      score: number;
      grade: string;
      credits: number;
    }>;
    average: number;
    rank: number | null;
  }>;
  finalGrades: Array<{
    subjectName: string;
    averageScore: number;
    letterGrade: string;
    isPassedKKM: boolean;
  }>;
  tahfidzSummary: {
    totalJuz: number;
    totalSurah: number;
    totalAyah: number;
    lastJuz: number;
    lastSurah: string;
    tahfidzGrade: string;
  } | null;
  overallAverage: number;
  gpa: number;
  isGraduated: boolean;
  graduationStatus: string;
  transcriptNumber: string;
  issuedDate: Date;
}

// =====================================
// HELPER FUNCTIONS
// =====================================

function calculateLetterGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

function calculateGPA(averageScore: number): number {
  // Konversi ke skala 4.0
  if (averageScore >= 90) return 4.0;
  if (averageScore >= 85) return 3.7;
  if (averageScore >= 80) return 3.3;
  if (averageScore >= 75) return 3.0;
  if (averageScore >= 70) return 2.7;
  if (averageScore >= 65) return 2.3;
  if (averageScore >= 60) return 2.0;
  if (averageScore >= 55) return 1.7;
  if (averageScore >= 50) return 1.3;
  return 1.0;
}

function generateSkhunNumber(year: string, sequence: number): string {
  // Format: DN-XX/YYYY/NNNNN (DN = Dalam Negeri, XX = Kode Provinsi, YYYY = Tahun, NNNNN = Nomor Urut)
  const paddedSequence = sequence.toString().padStart(5, '0');
  return `DN-32/${year}/${paddedSequence}`;
}

function generateTranscriptNumber(year: string, sequence: number): string {
  // Format: TR/NPSN/YYYY/NNNNN
  const paddedSequence = sequence.toString().padStart(5, '0');
  return `TR/20123456/${year}/${paddedSequence}`;
}

function getGraduationStatus(isPassed: boolean, average: number): string {
  if (!isPassed) return 'Tidak Lulus';
  if (average >= 90) return 'Lulus dengan Predikat Sangat Baik';
  if (average >= 80) return 'Lulus dengan Predikat Baik';
  if (average >= 70) return 'Lulus';
  return 'Lulus dengan Catatan';
}

// =====================================
// SKHUN (Surat Keterangan Hasil Ujian Nasional)
// =====================================

export async function generateSkhun(
  studentId: string,
  academicYearId: string,
  examPeriod: string = 'UTAMA'
): Promise<SkhunData> {
  // Get student with unit info
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: true,
      unit: true,
      enrollments: {
        include: {
          class: { include: { academicYear: true } },
        },
        orderBy: { enrolledAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!student) {
    throw new Error('Siswa tidak ditemukan');
  }

  // Get academic year
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
  });

  if (!academicYear) {
    throw new Error('Tahun ajaran tidak ditemukan');
  }

  // Get final exam grades for this student
  const grades = await prisma.grade.findMany({
    where: {
      studentId,
      academicYearId,
      exam: {
        type: 'FINAL',
      },
    },
    include: {
      subject: true,
      exam: true,
    },
    orderBy: { subject: { name: 'asc' } },
  });

  // Transform grades for SKHUN
  const skhunGrades = grades.map((grade) => ({
    subjectName: grade.subject.name,
    subjectCode: grade.subject.code ?? '',
    score: Number(grade.score),
    isPassed: Number(grade.percentage) >= 55, // KKM Ujian = 55
    examType: grade.exam?.type ?? 'FINAL',
  }));

  // Calculate totals
  const totalScore = skhunGrades.reduce((sum, g) => sum + g.score, 0);
  const average = skhunGrades.length > 0 ? totalScore / skhunGrades.length : 0;
  const isPassed = skhunGrades.every((g) => g.isPassed) && average >= 55;

  // Get student rank (based on average final score in class)
  const currentEnrollment = student.enrollments[0];
  let rank: number | null = null;
  let totalStudents = 0;

  if (currentEnrollment) {
    const classEnrollments = await prisma.classEnrollment.findMany({
      where: { classId: currentEnrollment.classId, status: 'active' },
      include: {
        student: {
          include: {
            grades: {
              where: {
                academicYearId,
                exam: { type: 'FINAL' },
              },
            },
          },
        },
      },
    });

    const rankedStudents = classEnrollments
      .map((e) => ({
        id: e.student.id,
        average:
          e.student.grades.length > 0
            ? e.student.grades.reduce((sum: number, g: any) => sum + Number(g.score), 0) /
              e.student.grades.length
            : 0,
      }))
      .sort((a, b) => b.average - a.average);

    rank = rankedStudents.findIndex((s) => s.id === studentId) + 1;
    totalStudents = classEnrollments.length;
  }

  // Generate SKHUN number
  const existingSkhunCount = await prisma.reportCard.count({
    where: {
      academicYearId,
      isPublished: true,
    },
  });
  const skhunNumber = generateSkhunNumber(academicYear.name.split('/')[0], existingSkhunCount + 1);

  return {
    student: {
      id: student.id,
      name: student.user.name,
      nisn: student.nisn,
      birthPlace: student.birthPlace,
      birthDate: student.birthDate,
      gender: student.gender,
      parentName: student.parentName,
    },
    school: {
      name: student.unit.name,
      npsn: student.unit.npsn,
      address: student.unit.address,
      accreditation: student.unit.accreditation ?? 'B',
    },
    academicYear: {
      id: academicYear.id,
      name: academicYear.name,
    },
    grades: skhunGrades,
    average: Math.round(average * 100) / 100,
    totalScore,
    isPassed,
    rank: rank || null,
    totalStudents,
    skhunNumber,
    issuedDate: new Date(),
    examPeriod,
  };
}

export async function getSkhunByStudent(studentId: string, academicYearId?: string) {
  const where: Prisma.ReportCardWhereInput = { studentId };
  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  // Get latest report card with skhun data
  const reportCard = await prisma.reportCard.findFirst({
    where: {
      ...where,
      isPublished: true,
    },
    include: {
      student: { include: { user: true } },
      academicYear: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!reportCard) {
    return null;
  }

  return generateSkhun(studentId, reportCard.academicYearId);
}

// =====================================
// TRANSKRIP NILAI
// =====================================

export async function generateTranscript(
  studentId: string,
  graduationYear?: string
): Promise<TranscriptData> {
  // Get student with all related data
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: true,
      unit: true,
      enrollments: {
        include: {
          class: { include: { academicYear: true } },
        },
        orderBy: { enrolledAt: 'desc' },
      },
    },
  });

  if (!student) {
    throw new Error('Siswa tidak ditemukan');
  }

  // Get all report cards for this student
  const reportCards = await prisma.reportCard.findMany({
    where: { studentId },
    include: {
      academicYear: true,
      details: true,
    },
    orderBy: [{ academicYearId: 'asc' }, { semester: 'asc' }],
  });

  // Transform to semesters data
  const semesters = reportCards.map((rc) => {
    const subjects = rc.details.map((detail) => ({
      name: detail.subjectName,
      code: '',
      score: Number(detail.averageScore ?? 0),
      grade: detail.letterGrade ?? calculateLetterGrade(Number(detail.averageScore ?? 0)),
      credits: 2, // Default credits
    }));

    const semesterAverage =
      subjects.length > 0 ? subjects.reduce((sum, s) => sum + s.score, 0) / subjects.length : 0;

    return {
      semester: rc.semester,
      academicYear: rc.academicYear?.name ?? '',
      subjects,
      average: Math.round(semesterAverage * 100) / 100,
      rank: rc.rank,
    };
  });

  // Calculate final grades (average across all semesters per subject)
  const subjectScores: Record<string, number[]> = {};
  semesters.forEach((sem) => {
    sem.subjects.forEach((subj) => {
      if (!subjectScores[subj.name]) {
        subjectScores[subj.name] = [];
      }
      subjectScores[subj.name].push(subj.score);
    });
  });

  const finalGrades = Object.entries(subjectScores).map(([name, scores]) => {
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    return {
      subjectName: name,
      averageScore: Math.round(avgScore * 100) / 100,
      letterGrade: calculateLetterGrade(avgScore),
      isPassedKKM: avgScore >= 70,
    };
  });

  // Get tahfidz summary
  const tahfidzRecords = await prisma.tahfidzRecord.findMany({
    where: { studentId },
    orderBy: [{ juz: 'desc' }, { createdAt: 'desc' }],
  });

  let tahfidzSummary = null;
  if (tahfidzRecords.length > 0) {
    const uniqueJuz = new Set(tahfidzRecords.map((r) => r.juz));
    const uniqueSurah = new Set(tahfidzRecords.map((r) => r.surahName));
    const totalAyah = tahfidzRecords.reduce((sum, r) => sum + (r.totalAyah ?? 0), 0);
    const lastRecord = tahfidzRecords[0];

    // Calculate tahfidz grade based on total juz
    let tahfidzGrade = 'E';
    if (uniqueJuz.size >= 30) tahfidzGrade = 'A+';
    else if (uniqueJuz.size >= 20) tahfidzGrade = 'A';
    else if (uniqueJuz.size >= 10) tahfidzGrade = 'B';
    else if (uniqueJuz.size >= 5) tahfidzGrade = 'C';
    else if (uniqueJuz.size >= 1) tahfidzGrade = 'D';

    tahfidzSummary = {
      totalJuz: uniqueJuz.size,
      totalSurah: uniqueSurah.size,
      totalAyah,
      lastJuz: lastRecord.juz,
      lastSurah: lastRecord.surahName,
      tahfidzGrade,
    };
  }

  // Calculate overall average and GPA
  const allScores = finalGrades.map((g) => g.averageScore);
  const overallAverage =
    allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
  const gpa = calculateGPA(overallAverage);

  // Determine graduation status
  const isGraduated = finalGrades.every((g) => g.isPassedKKM) && overallAverage >= 70;
  const graduationStatus = getGraduationStatus(isGraduated, overallAverage);

  // Generate transcript number
  const currentYear = graduationYear ?? new Date().getFullYear().toString();
  const existingTranscriptCount = await prisma.reportCard.count({
    where: { isPublished: true },
  });
  const transcriptNumber = generateTranscriptNumber(currentYear, existingTranscriptCount + 1);

  // Determine admission and graduation years
  const firstReportCard = reportCards[0];
  const lastReportCard = reportCards[reportCards.length - 1];
  const admissionYear = firstReportCard?.academicYear?.name.split('/')[0] ?? currentYear;
  const gradYear = lastReportCard?.academicYear?.name.split('/')[1] ?? currentYear;

  return {
    student: {
      id: student.id,
      name: student.user.name,
      nisn: student.nisn,
      birthPlace: student.birthPlace,
      birthDate: student.birthDate,
      gender: student.gender,
      parentName: student.parentName,
      admissionYear,
      graduationYear: gradYear,
    },
    school: {
      name: student.unit.name,
      npsn: student.unit.npsn,
      address: student.unit.address,
      level: student.unit.type,
    },
    semesters,
    finalGrades,
    tahfidzSummary,
    overallAverage: Math.round(overallAverage * 100) / 100,
    gpa: Math.round(gpa * 100) / 100,
    isGraduated,
    graduationStatus,
    transcriptNumber,
    issuedDate: new Date(),
  };
}

// =====================================
// REPORT CARD PRINT DATA
// =====================================

export async function getReportCardPrintData(reportCardId: string) {
  const reportCard = await prisma.reportCard.findUnique({
    where: { id: reportCardId },
    include: {
      student: {
        include: {
          user: true,
          unit: true,
        },
      },
      class: {
        include: {
          homeroomTeacher: { include: { user: true } },
        },
      },
      academicYear: true,
      details: { orderBy: { subjectName: 'asc' } },
    },
  });

  if (!reportCard) {
    throw new Error('Rapor tidak ditemukan');
  }

  // Get tahfidz summary for this student
  const tahfidzRecords = await prisma.tahfidzRecord.findMany({
    where: { studentId: reportCard.studentId },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });

  // Calculate tahfidz grade based on records
  let tahfidzGrade = 'B';
  if (tahfidzRecords.length > 0) {
    const record = tahfidzRecords[0];
    if (record.score && record.score >= 90) tahfidzGrade = 'A';
    else if (record.score && record.score >= 80) tahfidzGrade = 'B';
    else if (record.score && record.score >= 70) tahfidzGrade = 'C';
    else tahfidzGrade = 'D';
  }

  const tahfidzSummary =
    tahfidzRecords.length > 0
      ? {
          lastJuz: tahfidzRecords[0].juz,
          lastSurah: tahfidzRecords[0].surahName,
          grade: tahfidzGrade,
        }
      : null;

  // Get extracurricular for this student
  const extracurricular = await prisma.extracurricularEnrollment.findMany({
    where: {
      studentId: reportCard.studentId,
    },
    include: {
      extracurricular: true,
    },
  });

  // Get P5 projects if available (mock for now)
  const p5Projects: any[] = [];

  return {
    ...reportCard,
    tahfidzSummary,
    extracurricular: extracurricular.map((e) => ({
      name: e.extracurricular.name,
      grade: e.grade ?? 'B',
      notes: e.notes,
    })),
    p5Projects,
    school: {
      name: reportCard.student.unit.name,
      npsn: reportCard.student.unit.npsn,
      address: reportCard.student.unit.address,
      phone: reportCard.student.unit.phone,
      email: reportCard.student.unit.email,
    },
    teacher: reportCard.class?.homeroomTeacher
      ? {
          name: reportCard.class.homeroomTeacher.user.name,
          nip: reportCard.class.homeroomTeacher.nip,
        }
      : null,
    printedAt: new Date(),
  };
}

// =====================================
// BULK OPERATIONS
// =====================================

export async function generateBulkSkhun(
  classId: string,
  academicYearId: string,
  examPeriod: string = 'UTAMA'
): Promise<SkhunData[]> {
  const enrollments = await prisma.classEnrollment.findMany({
    where: { classId, status: 'active' },
    include: { student: true },
  });

  const results: SkhunData[] = [];
  for (const enrollment of enrollments) {
    try {
      const skhun = await generateSkhun(enrollment.student.id, academicYearId, examPeriod);
      results.push(skhun);
    } catch (error) {
      console.error(`Error generating SKHUN for student ${enrollment.student.id}:`, error);
    }
  }

  return results;
}

export async function generateBulkTranscripts(classId: string): Promise<TranscriptData[]> {
  const enrollments = await prisma.classEnrollment.findMany({
    where: { classId, status: 'active' },
    include: { student: true },
  });

  const results: TranscriptData[] = [];
  for (const enrollment of enrollments) {
    try {
      const transcript = await generateTranscript(enrollment.student.id);
      results.push(transcript);
    } catch (error) {
      console.error(`Error generating transcript for student ${enrollment.student.id}:`, error);
    }
  }

  return results;
}

// =====================================
// EXPORT FUNCTIONS
// =====================================

export async function exportSkhunToExcel(studentId: string, academicYearId: string) {
  const skhun = await generateSkhun(studentId, academicYearId);

  return {
    headers: ['No', 'Mata Pelajaran', 'Kode', 'Nilai', 'Status'],
    rows: skhun.grades.map((g, index) => [
      index + 1,
      g.subjectName,
      g.subjectCode,
      g.score,
      g.isPassed ? 'Lulus' : 'Tidak Lulus',
    ]),
    summary: {
      totalScore: skhun.totalScore,
      average: skhun.average,
      status: skhun.isPassed ? 'LULUS' : 'TIDAK LULUS',
      rank: skhun.rank,
    },
    student: skhun.student,
    school: skhun.school,
    skhunNumber: skhun.skhunNumber,
  };
}

export async function exportTranscriptToExcel(studentId: string) {
  const transcript = await generateTranscript(studentId);

  return {
    headers: ['No', 'Mata Pelajaran', 'Nilai Rata-rata', 'Grade', 'Status KKM'],
    rows: transcript.finalGrades.map((g, index) => [
      index + 1,
      g.subjectName,
      g.averageScore,
      g.letterGrade,
      g.isPassedKKM ? 'Lulus' : 'Tidak Lulus',
    ]),
    summary: {
      overallAverage: transcript.overallAverage,
      gpa: transcript.gpa,
      graduationStatus: transcript.graduationStatus,
    },
    student: transcript.student,
    school: transcript.school,
    tahfidz: transcript.tahfidzSummary,
    transcriptNumber: transcript.transcriptNumber,
  };
}
