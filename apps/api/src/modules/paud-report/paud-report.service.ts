import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { Prisma, PAUDAspect, PAUDAchievementLevel, UserRole } from '@prisma/client';
import type {
  ListReportsQuery,
  CreateReportInput,
  UpdateReportInput,
  GenerateReportInput,
  BulkGenerateReportInput,
  FinalizeReportInput,
  AddPhotoInput,
  UpdatePhotoInput,
} from './paud-report.schema';

// ============================================
// CONSTANTS
// ============================================

const ASPECT_NAMES: Record<PAUDAspect, string> = {
  NAM: 'Nilai Agama dan Moral',
  FM: 'Fisik Motorik',
  KOG: 'Kognitif',
  BHS: 'Bahasa',
  SE: 'Sosial Emosional',
  SNI: 'Seni',
};

const ACHIEVEMENT_DESCRIPTIONS: Record<PAUDAchievementLevel, string> = {
  BB: 'Belum Berkembang',
  MB: 'Mulai Berkembang',
  BSH: 'Berkembang Sesuai Harapan',
  BSB: 'Berkembang Sangat Baik',
};

// Minimum assessments required per aspect to auto-generate narrative
const MIN_ASSESSMENTS_PER_ASPECT = 3;

type ReportAccessContext = { role: string; unitId: string | null; userId: string };

async function assertCanAccessStudent(
  studentId: string,
  unitId: string,
  context: ReportAccessContext
) {
  if (context.role === UserRole.SUPER_ADMIN) return;

  if (context.role === UserRole.PARENT) {
    const link = await prisma.studentParent.findUnique({
      where: {
        studentId_parentId: {
          studentId,
          parentId: context.userId,
        },
      },
      select: { id: true },
    });

    if (!link) throw Errors.forbidden('Access denied');
    return;
  }

  if (!context.unitId) throw Errors.forbidden('Access denied');
  if (unitId !== context.unitId) throw Errors.forbidden('Access denied');
}

// ============================================
// LIST REPORTS
// ============================================

export async function findAllReports(
  query: ListReportsQuery,
  context: { role: string; unitId?: string | null; userId: string }
) {
  const { page, limit, studentId, academicYearId, unitId, semester, classId, status, search } =
    query;
  const skip = (page - 1) * limit;

  const where: Prisma.PAUDNarrativeReportWhereInput = {
    ...(studentId && { studentId }),
    ...(academicYearId && { academicYearId }),
    ...(unitId && { unitId }),
    ...(semester && { semester }),
    ...(status && { status }),
    ...(classId && {
      student: {
        enrollments: {
          some: { classId },
        },
      },
    }),
    ...(search && {
      student: {
        user: {
          name: { contains: search, mode: 'insensitive' as const },
        },
      },
    }),
    // Filter by unit if not admin
    ...(context.unitId && { unitId: context.unitId }),
  };

  const [reports, total] = await Promise.all([
    prisma.pAUDNarrativeReport.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        student: {
          select: {
            id: true,
            nisn: true, nik: true,
            nisn: true,
            photoUrl: true,
            user: { select: { name: true } },
          },
        },
        unit: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
        photos: {
          orderBy: { orderNumber: 'asc' },
          take: 3, // Preview only 3 photos
        },
      },
    }),
    prisma.pAUDNarrativeReport.count({ where }),
  ]);

  return {
    reports,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ============================================
// GET REPORT BY ID
// ============================================

export async function findReportById(id: string, context: ReportAccessContext) {
  const reportForAccess = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
    select: { id: true, studentId: true, unitId: true },
  });

  if (!reportForAccess) throw Errors.notFound('Report');
  await assertCanAccessStudent(reportForAccess.studentId, reportForAccess.unitId, context);

  const report = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          nisn: true,
          photoUrl: true,
          birthDate: true,
          birthPlace: true,
          gender: true,
          user: { select: { name: true } },
          enrollments: {
            where: { status: 'ACTIVE' },
            include: {
              class: { select: { id: true, name: true } },
            },
            take: 1,
          },
        },
      },
      unit: { select: { id: true, name: true, type: true } },
      academicYear: { select: { id: true, name: true, startDate: true, endDate: true } },
      photos: {
        orderBy: { orderNumber: 'asc' },
      },
    },
  });

  if (!report) throw Errors.notFound('Report');
  return report;
}

// ============================================
// CREATE REPORT
// ============================================

export async function createReport(input: CreateReportInput, context: ReportAccessContext) {
  // Validate student exists
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, unitId: true },
  });

  if (!student) {
    throw Errors.notFound('Student');
  }

  await assertCanAccessStudent(student.id, student.unitId, context);
  if (input.unitId !== student.unitId) {
    throw Errors.badRequest('Student unit mismatch');
  }

  // Check for duplicate (same student, academic year, semester)
  const existing = await prisma.pAUDNarrativeReport.findUnique({
    where: {
      studentId_academicYearId_semester: {
        studentId: input.studentId,
        academicYearId: input.academicYearId,
        semester: input.semester,
      },
    },
  });

  if (existing) {
    throw Errors.conflict(
      'Report already exists for this student in this semester. Use update instead.'
    );
  }

  // Validate academic year
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: input.academicYearId },
  });

  if (!academicYear) {
    throw Errors.notFound('Academic year');
  }

  return prisma.pAUDNarrativeReport.create({
    data: {
      studentId: input.studentId,
      unitId: input.unitId,
      academicYearId: input.academicYearId,
      semester: input.semester,
      narrativeNAM: input.narrativeNAM,
      narrativeFM: input.narrativeFM,
      narrativeKOG: input.narrativeKOG,
      narrativeBHS: input.narrativeBHS,
      narrativeSE: input.narrativeSE,
      narrativeSNI: input.narrativeSNI,
      overallStrengths: input.overallStrengths,
      areasForDevelopment: input.areasForDevelopment,
      parentRecommendations: input.parentRecommendations,
      totalDays: input.totalDays,
      presentDays: input.presentDays,
      sickDays: input.sickDays,
      excusedDays: input.excusedDays,
      status: 'DRAFT',
      createdById: context.userId,
    },
    include: {
      student: { select: { id: true, nisn: true, nik: true, user: { select: { name: true } } } },
      unit: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
    },
  });
}

// ============================================
// UPDATE REPORT
// ============================================

export async function updateReport(
  id: string,
  input: UpdateReportInput,
  context: ReportAccessContext
) {
  const report = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
    select: { id: true, status: true, studentId: true, unitId: true },
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  await assertCanAccessStudent(report.studentId, report.unitId, context);

  if (report.status === 'FINALIZED' || report.status === 'PRINTED') {
    throw Errors.badRequest('Cannot update a finalized or printed report');
  }

  return prisma.pAUDNarrativeReport.update({
    where: { id },
    data: {
      ...input,
      updatedAt: new Date(),
    },
    include: {
      student: { select: { id: true, nisn: true, nik: true, user: { select: { name: true } } } },
      unit: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
      photos: { orderBy: { orderNumber: 'asc' } },
    },
  });
}

// ============================================
// DELETE REPORT
// ============================================

export async function deleteReport(id: string, context: ReportAccessContext) {
  const report = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
    select: { id: true, status: true, studentId: true, unitId: true },
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  await assertCanAccessStudent(report.studentId, report.unitId, context);

  if (report.status === 'FINALIZED' || report.status === 'PRINTED') {
    throw Errors.badRequest('Cannot delete a finalized or printed report');
  }

  // Delete photos first (cascade should handle, but explicit is safer)
  await prisma.pAUDReportPhoto.deleteMany({ where: { reportId: id } });

  return prisma.pAUDNarrativeReport.delete({ where: { id } });
}

// ============================================
// GENERATE REPORT FROM ASSESSMENTS
// ============================================

export async function generateReportFromAssessments(
  input: GenerateReportInput,
  context: ReportAccessContext
) {
  const { studentId, unitId, academicYearId, semester, regenerate } = input;

  // Check if report already exists
  const existing = await prisma.pAUDNarrativeReport.findUnique({
    where: {
      studentId_academicYearId_semester: {
        studentId,
        academicYearId,
        semester,
      },
    },
    select: { id: true, status: true },
  });

  if (existing && !regenerate) {
    throw Errors.conflict(
      'Report already exists. Set regenerate=true to overwrite draft, or update existing report.'
    );
  }

  if (existing && existing.status !== 'DRAFT') {
    throw Errors.badRequest('Cannot regenerate a finalized or printed report');
  }

  // Validate student
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, unitId: true, user: { select: { name: true } } },
  });

  if (!student) {
    throw Errors.notFound('Student');
  }

  await assertCanAccessStudent(student.id, student.unitId, context);
  if (unitId !== student.unitId) {
    throw Errors.badRequest('Student unit mismatch');
  }

  // Get semester dates from academic year
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, startDate: true, endDate: true },
  });

  if (!academicYear) {
    throw Errors.notFound('Academic year');
  }

  // Calculate semester period
  const yearStart = new Date(academicYear.startDate);
  const yearEnd = new Date(academicYear.endDate);
  const midPoint = new Date(yearStart.getTime() + (yearEnd.getTime() - yearStart.getTime()) / 2);

  const semesterStart = semester === 'GANJIL' ? yearStart : midPoint;
  const semesterEnd = semester === 'GANJIL' ? midPoint : yearEnd;

  // Get assessments for this student in the semester period
  const assessments = await prisma.pAUDDevelopmentAssessment.findMany({
    where: {
      studentId,
      academicYearId,
      periodDate: {
        gte: semesterStart,
        lte: semesterEnd,
      },
    },
    include: {
      indicator: { select: { id: true, name: true, description: true } },
    },
    orderBy: [{ aspect: 'asc' }, { periodDate: 'asc' }],
  });

  if (assessments.length === 0) {
    throw Errors.badRequest('No assessments found for this student in this semester');
  }

  // Group assessments by aspect
  const aspectAssessments = groupAssessmentsByAspect(assessments);

  // Generate narratives for each aspect
  const narratives = generateNarratives(aspectAssessments, student.user?.name || 'Anak');

  // Get attendance summary from daily reports
  const attendanceSummary = await getAttendanceSummary(studentId, semesterStart, semesterEnd);

  // Get Health/Growth Summary
  const growthRecord = await prisma.growthRecord.findFirst({
    where: {
      studentId,
      recordDate: {
        gte: semesterStart,
        lte: semesterEnd,
      },
    },
    orderBy: { recordDate: 'desc' },
  });

  const healthSummary = growthRecord
    ? {
        weight: growthRecord.weight,
        height: growthRecord.height,
        headCircumference: growthRecord.headCircumference,
        notes: growthRecord.notes,
        bmiDescription: growthRecord.nutritionStatus || '-',
      }
    : null;

  // Get Tahfidz Summary
  const latestTahfidz = await prisma.tahfidzRecord.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });

  const tahfidzSummary = latestTahfidz
    ? {
        lastSurah: latestTahfidz.surahName,
        lastJuz: latestTahfidz.juz,
        lastAyah: latestTahfidz.ayahEnd,
        activity: latestTahfidz.activityType,
      }
    : null;

  const reportData = {
    studentId,
    unitId,
    academicYearId,
    semester,
    tahfidzSummary: tahfidzSummary ?? Prisma.DbNull,
    healthSummary: healthSummary ?? Prisma.DbNull,
    narrativeNAM: narratives.NAM,
    narrativeFM: narratives.FM,
    narrativeKOG: narratives.KOG,
    narrativeBHS: narratives.BHS,
    narrativeSE: narratives.SE,
    narrativeSNI: narratives.SNI,
    overallStrengths: narratives.overallStrengths,
    areasForDevelopment: narratives.areasForDevelopment,
    parentRecommendations: narratives.parentRecommendations,
    totalDays: attendanceSummary.totalDays,
    presentDays: attendanceSummary.presentDays,
    sickDays: attendanceSummary.sickDays,
    excusedDays: attendanceSummary.excusedDays,
    status: 'DRAFT',
    createdById: context.userId,
  };

  if (existing) {
    // Update existing draft
    return prisma.pAUDNarrativeReport.update({
      where: { id: existing.id },
      data: {
        ...reportData,
        updatedAt: new Date(),
      },
      include: {
        student: { select: { id: true, nisn: true, nik: true, user: { select: { name: true } } } },
        unit: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });
  }

  // Create new report
  return prisma.pAUDNarrativeReport.create({
    data: reportData,
    include: {
      student: { select: { id: true, nisn: true, nik: true, user: { select: { name: true } } } },
      unit: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
    },
  });
}

// ============================================
// BULK GENERATE REPORTS
// ============================================

export async function bulkGenerateReports(
  input: BulkGenerateReportInput,
  context: ReportAccessContext
) {
  const { classId, unitId, academicYearId, semester, regenerate } = input;

  // Get all students in the class
  const enrollments = await prisma.classEnrollment.findMany({
    where: {
      classId,
      status: 'ACTIVE',
    },
    select: {
      studentId: true,
      student: { select: { id: true, user: { select: { name: true } } } },
    },
  });

  if (enrollments.length === 0) {
    throw Errors.badRequest('No active students found in this class');
  }

  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [] as { studentId: string; studentName: string; error: string }[],
  };

  for (const enrollment of enrollments) {
    try {
      await generateReportFromAssessments(
        {
          studentId: enrollment.studentId,
          unitId,
          academicYearId,
          semester,
          regenerate,
        },
        context
      );
      results.success++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('already exists') && !regenerate) {
        results.skipped++;
      } else if (errorMessage.includes('No assessments found')) {
        results.skipped++;
        results.errors.push({
          studentId: enrollment.studentId,
          studentName: enrollment.student.user?.name || 'Unknown',
          error: 'No assessments found',
        });
      } else {
        results.failed++;
        results.errors.push({
          studentId: enrollment.studentId,
          studentName: enrollment.student.user?.name || 'Unknown',
          error: errorMessage,
        });
      }
    }
  }

  return results;
}

// ============================================
// FINALIZE REPORT
// ============================================

export async function finalizeReport(
  id: string,
  input: FinalizeReportInput,
  context: ReportAccessContext
) {
  const report = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
    select: { id: true, status: true, studentId: true, unitId: true },
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  await assertCanAccessStudent(report.studentId, report.unitId, context);

  if (report.status === 'FINALIZED' || report.status === 'PRINTED') {
    throw Errors.badRequest('Report is already finalized');
  }

  return prisma.pAUDNarrativeReport.update({
    where: { id },
    data: {
      status: 'FINALIZED',
      finalizedAt: new Date(),
      teacherSignature: input.teacherSignature,
      principalSignature: input.principalSignature,
    },
    include: {
      student: { select: { id: true, nisn: true, nik: true, user: { select: { name: true } } } },
      unit: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
    },
  });
}

// ============================================
// MARK AS PRINTED
// ============================================

export async function markAsPrinted(id: string, context: ReportAccessContext) {
  const report = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
    select: { id: true, status: true, studentId: true, unitId: true },
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  await assertCanAccessStudent(report.studentId, report.unitId, context);

  if (report.status === 'DRAFT') {
    throw Errors.badRequest('Cannot print a draft report. Finalize it first.');
  }

  return prisma.pAUDNarrativeReport.update({
    where: { id },
    data: {
      status: 'PRINTED',
      printedAt: new Date(),
    },
  });
}

// ============================================
// PHOTO MANAGEMENT
// ============================================

export async function addPhoto(
  reportId: string,
  input: AddPhotoInput,
  context: ReportAccessContext
) {
  const report = await prisma.pAUDNarrativeReport.findUnique({
    where: { id: reportId },
    select: { id: true, status: true, studentId: true, unitId: true },
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  await assertCanAccessStudent(report.studentId, report.unitId, context);

  if (report.status === 'FINALIZED' || report.status === 'PRINTED') {
    throw Errors.badRequest('Cannot add photos to a finalized or printed report');
  }

  // Check max photos (limit to 10)
  const photoCount = await prisma.pAUDReportPhoto.count({
    where: { reportId },
  });

  if (photoCount >= 10) {
    throw Errors.badRequest('Maximum 10 photos allowed per report');
  }

  return prisma.pAUDReportPhoto.create({
    data: {
      reportId,
      photoUrl: input.photoUrl,
      caption: input.caption,
      orderNumber: input.orderNumber,
    },
  });
}

export async function updatePhoto(
  photoId: string,
  input: UpdatePhotoInput,
  context: ReportAccessContext
) {
  const photo = await prisma.pAUDReportPhoto.findUnique({
    where: { id: photoId },
    include: {
      report: { select: { status: true, studentId: true, unitId: true } },
    },
  });

  if (!photo) {
    throw Errors.notFound('Photo');
  }

  await assertCanAccessStudent(photo.report.studentId, photo.report.unitId, context);

  if (photo.report.status === 'FINALIZED' || photo.report.status === 'PRINTED') {
    throw Errors.badRequest('Cannot update photos in a finalized or printed report');
  }

  return prisma.pAUDReportPhoto.update({
    where: { id: photoId },
    data: input,
  });
}

export async function deletePhoto(photoId: string, context: ReportAccessContext) {
  const photo = await prisma.pAUDReportPhoto.findUnique({
    where: { id: photoId },
    include: {
      report: { select: { status: true, studentId: true, unitId: true } },
    },
  });

  if (!photo) {
    throw Errors.notFound('Photo');
  }

  await assertCanAccessStudent(photo.report.studentId, photo.report.unitId, context);

  if (photo.report.status === 'FINALIZED' || photo.report.status === 'PRINTED') {
    throw Errors.badRequest('Cannot delete photos from a finalized or printed report');
  }

  return prisma.pAUDReportPhoto.delete({ where: { id: photoId } });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

interface AspectAssessment {
  aspect: PAUDAspect;
  assessments: Array<{
    id: string;
    achievementLevel: PAUDAchievementLevel;
    narrativeText: string | null;
    recommendations: string | null;
    periodDate: Date;
    indicator: { id: string; name: string; description: string | null } | null;
  }>;
}

function groupAssessmentsByAspect(
  assessments: Array<{
    id: string;
    aspect: PAUDAspect;
    achievementLevel: PAUDAchievementLevel;
    narrativeText: string | null;
    recommendations: string | null;
    periodDate: Date;
    indicator: { id: string; name: string; description: string | null } | null;
  }>
): AspectAssessment[] {
  const grouped: Record<PAUDAspect, AspectAssessment['assessments']> = {
    NAM: [],
    FM: [],
    KOG: [],
    BHS: [],
    SE: [],
    SNI: [],
  };

  for (const assessment of assessments) {
    grouped[assessment.aspect].push(assessment);
  }

  return Object.entries(grouped).map(([aspect, items]) => ({
    aspect: aspect as PAUDAspect,
    assessments: items,
  }));
}

interface GeneratedNarratives {
  NAM: string | null;
  FM: string | null;
  KOG: string | null;
  BHS: string | null;
  SE: string | null;
  SNI: string | null;
  overallStrengths: string | null;
  areasForDevelopment: string | null;
  parentRecommendations: string | null;
}

function generateNarratives(
  aspectAssessments: AspectAssessment[],
  studentName: string
): GeneratedNarratives {
  const narratives: GeneratedNarratives = {
    NAM: null,
    FM: null,
    KOG: null,
    BHS: null,
    SE: null,
    SNI: null,
    overallStrengths: null,
    areasForDevelopment: null,
    parentRecommendations: null,
  };

  const strengths: string[] = [];
  const improvements: string[] = [];
  const recommendations: string[] = [];

  for (const { aspect, assessments } of aspectAssessments) {
    if (assessments.length < MIN_ASSESSMENTS_PER_ASPECT) {
      narratives[aspect] =
        `Data penilaian untuk aspek ${ASPECT_NAMES[aspect]} belum cukup untuk membuat narasi. Minimal ${MIN_ASSESSMENTS_PER_ASPECT} penilaian diperlukan.`;
      continue;
    }

    // Get latest achievement level
    const latestAssessment = assessments[assessments.length - 1];
    const latestLevel = latestAssessment.achievementLevel;

    // Calculate trend
    const trend = calculateTrend(assessments);

    // Collect existing narratives from assessments
    const existingNarratives = assessments
      .filter((a) => a.narrativeText)
      .map((a) => a.narrativeText!)
      .slice(-3); // Get last 3 narratives

    // Generate aspect narrative
    const aspectNarrative = generateAspectNarrative(
      studentName,
      aspect,
      latestLevel,
      trend,
      existingNarratives,
      assessments.map((a) => a.indicator).filter((i): i is NonNullable<typeof i> => i !== null)
    );

    narratives[aspect] = aspectNarrative;

    // Collect strengths and improvements
    if (latestLevel === 'BSB' || latestLevel === 'BSH') {
      strengths.push(`${ASPECT_NAMES[aspect]}: ${ACHIEVEMENT_DESCRIPTIONS[latestLevel]}`);
    } else if (latestLevel === 'BB' || latestLevel === 'MB') {
      improvements.push(`${ASPECT_NAMES[aspect]}: ${ACHIEVEMENT_DESCRIPTIONS[latestLevel]}`);
    }

    // Collect recommendations from assessments
    const aspectRecommendations = assessments
      .filter((a) => a.recommendations)
      .map((a) => a.recommendations!);
    if (aspectRecommendations.length > 0) {
      recommendations.push(...aspectRecommendations.slice(-2));
    }
  }

  // Generate overall summaries
  if (strengths.length > 0) {
    narratives.overallStrengths = `${studentName} menunjukkan perkembangan yang baik pada aspek: ${strengths.join(', ')}.`;
  }

  if (improvements.length > 0) {
    narratives.areasForDevelopment = `Aspek yang perlu pengembangan lebih lanjut: ${improvements.join(', ')}.`;
  }

  if (recommendations.length > 0) {
    narratives.parentRecommendations = `Saran untuk orang tua: ${[...new Set(recommendations)].slice(0, 5).join('. ')}.`;
  } else {
    narratives.parentRecommendations = `Terus dampingi dan berikan stimulasi yang sesuai dengan tahap perkembangan anak di rumah.`;
  }

  return narratives;
}

function calculateTrend(
  assessments: Array<{ achievementLevel: PAUDAchievementLevel }>
): 'improving' | 'stable' | 'declining' {
  if (assessments.length < 2) return 'stable';

  const levelValues: Record<PAUDAchievementLevel, number> = {
    BB: 1,
    MB: 2,
    BSH: 3,
    BSB: 4,
  };

  const firstHalf = assessments.slice(0, Math.ceil(assessments.length / 2));
  const secondHalf = assessments.slice(Math.ceil(assessments.length / 2));

  const firstAvg =
    firstHalf.reduce((sum, a) => sum + levelValues[a.achievementLevel], 0) / firstHalf.length;
  const secondAvg =
    secondHalf.reduce((sum, a) => sum + levelValues[a.achievementLevel], 0) / secondHalf.length;

  if (secondAvg > firstAvg + 0.3) return 'improving';
  if (secondAvg < firstAvg - 0.3) return 'declining';
  return 'stable';
}

function generateAspectNarrative(
  studentName: string,
  aspect: PAUDAspect,
  level: PAUDAchievementLevel,
  trend: 'improving' | 'stable' | 'declining',
  existingNarratives: string[],
  indicators: Array<{ name: string; description: string | null }>
): string {
  const aspectName = ASPECT_NAMES[aspect];
  const levelDesc = ACHIEVEMENT_DESCRIPTIONS[level];

  let narrative = `Pada aspek ${aspectName}, ${studentName} menunjukkan capaian ${levelDesc}. `;

  // Add trend information
  if (trend === 'improving') {
    narrative += `Perkembangan ${studentName} pada aspek ini menunjukkan peningkatan yang positif sepanjang semester. `;
  } else if (trend === 'declining') {
    narrative += `Perlu perhatian lebih karena perkembangan pada aspek ini mengalami penurunan. `;
  } else {
    narrative += `Perkembangan ${studentName} pada aspek ini cukup stabil sepanjang semester. `;
  }

  // Add indicator details
  if (indicators.length > 0) {
    const indicatorNames = indicators
      .slice(0, 3)
      .map((i) => i.name)
      .join(', ');
    narrative += `Indikator yang dinilai meliputi: ${indicatorNames}. `;
  }

  // Add existing observations
  if (existingNarratives.length > 0) {
    const combined = existingNarratives.join(' ').substring(0, 300);
    narrative += combined;
    if (existingNarratives.join(' ').length > 300) {
      narrative += '...';
    }
  }

  return narrative.trim();
}

async function getAttendanceSummary(
  studentId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  totalDays: number;
  presentDays: number;
  sickDays: number;
  excusedDays: number;
}> {
  // Try to get from attendance records
  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      studentId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: { status: true },
  });

  if (attendanceRecords.length === 0) {
    // Fallback: try to get from daily reports
    const dailyReports = await prisma.dailyStudentReport.findMany({
      where: {
        studentId,
        reportDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: { id: true },
    });

    return {
      totalDays: dailyReports.length,
      presentDays: dailyReports.length,
      sickDays: 0,
      excusedDays: 0,
    };
  }

  const summary = {
    totalDays: attendanceRecords.length,
    presentDays: 0,
    sickDays: 0,
    excusedDays: 0,
  };

  for (const record of attendanceRecords) {
    if (record.status === 'PRESENT') summary.presentDays++;
    else if (record.status === 'SICK') summary.sickDays++;
    else if (record.status === 'EXCUSED') summary.excusedDays++;
  }

  return summary;
}

// ============================================
// EXPORT SERVICE
// ============================================

export const PAUDReportService = {
  findAllReports,
  findReportById,
  createReport,
  updateReport,
  deleteReport,
  generateReportFromAssessments,
  bulkGenerateReports,
  finalizeReport,
  markAsPrinted,
  addPhoto,
  updatePhoto,
  deletePhoto,
};
