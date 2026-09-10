import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  PAUDAspect,
  PAUDAchievementLevel,
  PAUDReportPeriod,
  CreatePAUDIndicatorInput,
  UpdatePAUDIndicatorInput,
  CreatePAUDAssessmentInput,
  UpdatePAUDAssessmentInput,
  BulkCreatePAUDAssessmentInput,
  CreatePAUDEvidenceInput,
  CreatePAUDNarrativeReportInput,
  UpdatePAUDNarrativeReportInput,
  FinalizePAUDReportInput,
} from '@cipansor/shared';

import type {
  ListIndicatorsQuery,
  ListAssessmentsQuery,
  ListNarrativeReportsQuery,
  AssessmentSummaryQuery,
  ClassSummaryQuery,
  BulkCreateClassPAUDAssessmentInput,
} from './paud-assessment.schema';

// ============================================
// INDICATOR SERVICE
// ============================================

async function findAllIndicators(
  query: ListIndicatorsQuery,
  context: { role: string; unitId?: string | null }
) {
  const { page, limit, aspect, ageGroupMin, ageGroupMax, isActive, search } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.PAUDDevelopmentIndicatorWhereInput = {
    ...(aspect && { aspect: aspect }),
    ...(ageGroupMin !== undefined && { ageGroupMin: { gte: ageGroupMin } }),
    ...(ageGroupMax !== undefined && { ageGroupMax: { lte: ageGroupMax } }),
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { code: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [indicators, total] = await Promise.all([
    prisma.pAUDDevelopmentIndicator.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ aspect: 'asc' }, { orderNumber: 'asc' }],
    }),
    prisma.pAUDDevelopmentIndicator.count({ where }),
  ]);

  return {
    indicators,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function findIndicatorById(id: string) {
  const indicator = await prisma.pAUDDevelopmentIndicator.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, name: true } },
    },
  });

  if (!indicator) {
    throw new Error('Indicator not found');
  }

  return indicator;
}

async function createIndicator(input: CreatePAUDIndicatorInput) {
  // Check for duplicate code
  const existing = await prisma.pAUDDevelopmentIndicator.findUnique({
    where: { code: input.code },
  });

  if (existing) {
    throw new Error('Indicator with this code already exists');
  }

  return prisma.pAUDDevelopmentIndicator.create({
    data: {
      unitId: input.unitId,
      aspect: input.aspect,
      code: input.code,
      name: input.name,
      description: input.description,
      ageGroupMin: input.ageGroupMin,
      ageGroupMax: input.ageGroupMax,
      orderNumber: input.orderNumber,
      isActive: input.isActive,
    },
  });
}

async function updateIndicator(id: string, input: UpdatePAUDIndicatorInput) {
  const existing = await prisma.pAUDDevelopmentIndicator.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Indicator not found');
  }

  return prisma.pAUDDevelopmentIndicator.update({
    where: { id },
    data: {
      ...(input.aspect && { aspect: input.aspect }),
      ...(input.name && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.ageGroupMin !== undefined && { ageGroupMin: input.ageGroupMin }),
      ...(input.ageGroupMax !== undefined && { ageGroupMax: input.ageGroupMax }),
      ...(input.orderNumber !== undefined && { orderNumber: input.orderNumber }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

async function deleteIndicator(id: string) {
  const existing = await prisma.pAUDDevelopmentIndicator.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Indicator not found');
  }

  // Check if indicator is used in assessments
  const usageCount = await prisma.pAUDDevelopmentAssessment.count({
    where: { indicatorId: id },
  });

  if (usageCount > 0) {
    // Soft delete by setting isActive to false
    return prisma.pAUDDevelopmentIndicator.update({
      where: { id },
      data: { isActive: false },
    });
  }

  return prisma.pAUDDevelopmentIndicator.delete({
    where: { id },
  });
}

// ============================================
// ASSESSMENT SERVICE
// ============================================

async function findAllAssessments(
  query: ListAssessmentsQuery,
  context: { role: string; unitId?: string | null }
) {
  const {
    page,
    limit,
    studentId,
    unitId,
    academicYearId,
    semester,
    aspect,
    periodType,
    startDate,
    endDate,
    achievementLevel,
  } = query;
  const skip = (page - 1) * limit;

  // Semester is stored as string in DB (GANJIL/GENAP)

  const where: Prisma.PAUDDevelopmentAssessmentWhereInput = {
    ...(studentId && { studentId }),
    ...(unitId && { unitId }),
    ...(academicYearId && { academicYearId }),
    ...(semester && { semester }),
    ...(aspect && { aspect: aspect }),
    ...(periodType && { periodType: periodType }),
    ...(achievementLevel && { achievementLevel: achievementLevel }),
    ...(startDate && { periodDate: { gte: new Date(startDate) } }),
    ...(endDate && { periodDate: { lte: new Date(endDate) } }),
    // Filter by unit if not super admin
    ...(context.role !== 'SUPER_ADMIN' && context.unitId && { unitId: context.unitId }),
  };

  const [assessments, total] = await Promise.all([
    prisma.pAUDDevelopmentAssessment.findMany({
      where,
      skip,
      take: limit,
      include: {
        student: {
          select: {
            id: true,
            nisn: true, nik: true,
            user: { select: { name: true } },
          },
        },
        indicator: {
          select: { id: true, code: true, name: true },
        },
        assessedBy: {
          select: { id: true, name: true },
        },
        evidences: {
          select: { id: true, fileUrl: true, fileType: true, caption: true },
        },
      },
      orderBy: [{ periodDate: 'desc' }, { aspect: 'asc' }],
    }),
    prisma.pAUDDevelopmentAssessment.count({ where }),
  ]);

  return {
    assessments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function findAssessmentById(id: string) {
  const assessment = await prisma.pAUDDevelopmentAssessment.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          user: { select: { name: true } },
        },
      },
      unit: { select: { id: true, name: true, type: true } },
      academicYear: { select: { id: true, name: true } },
      indicator: true,
      assessedBy: { select: { id: true, name: true } },
      evidences: true,
    },
  });

  if (!assessment) {
    throw new Error('Assessment not found');
  }

  return assessment;
}

async function createAssessment(input: CreatePAUDAssessmentInput, assessedById: string) {
  // Validate student exists and belongs to unit
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, unitId: true },
  });

  if (!student) {
    throw new Error('Student not found');
  }

  if (input.unitId && student.unitId !== input.unitId) {
    throw new Error('Student does not belong to this unit');
  }

  // Ensure unitId is provided (either from input or student)
  const unitId = input.unitId || student.unitId;

  return prisma.pAUDDevelopmentAssessment.create({
    data: {
      studentId: input.studentId,
      unitId: unitId,
      academicYearId: input.academicYearId,
      semester: input.semester,
      periodType: input.periodType,
      periodDate: new Date(input.periodDate),
      aspect: input.aspect,
      indicatorId: input.indicatorId,
      achievementLevel: input.achievementLevel,
      narrativeText: input.narrativeText,
      teacherNotes: input.teacherNotes,
      recommendations: input.recommendations,
      assessedById,
    },
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          user: { select: { name: true } },
        },
      },
      indicator: { select: { id: true, code: true, name: true } },
    },
  });
}

async function bulkCreateAssessments(input: BulkCreatePAUDAssessmentInput, assessedById: string) {
  const { studentId, unitId, academicYearId, semester, periodType, periodDate, assessments } =
    input;

  // Validate student
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, unitId: true },
  });

  if (!student) {
    throw new Error('Student not found');
  }

  if (student.unitId !== unitId) {
    throw new Error('Student does not belong to this unit');
  }

  // Create all assessments in a transaction
  const created = await prisma.$transaction(
    assessments.map((assessment) =>
      prisma.pAUDDevelopmentAssessment.create({
        data: {
          studentId,
          unitId,
          academicYearId,
          semester,
          periodType: periodType,
          periodDate: new Date(periodDate),
          aspect: assessment.aspect,
          indicatorId: assessment.indicatorId,
          achievementLevel: assessment.achievementLevel,
          narrativeText: assessment.narrativeText,
          teacherNotes: assessment.teacherNotes,
          recommendations: assessment.recommendations,
          assessedById,
        },
      })
    )
  );

  return {
    count: created.length,
    assessments: created,
  };
}

async function createClassAssessment(
  input: BulkCreateClassPAUDAssessmentInput,
  assessedById: string
) {
  const {
    classId,
    unitId,
    academicYearId,
    semester,
    periodType,
    periodDate,
    aspect,
    indicatorId,
    assessments,
  } = input;

  // Validate class belongs to unit (optional, but good practice)
  const classData = await prisma.class.findUnique({
    where: { id: classId },
    select: { unitId: true },
  });

  if (!classData || classData.unitId !== unitId) {
    throw new Error('Class not found or does not belong to this unit');
  }

  // Create assessments transactionally
  const created = await prisma.$transaction(
    assessments.map((assessment) =>
      prisma.pAUDDevelopmentAssessment.create({
        data: {
          studentId: assessment.studentId,
          unitId,
          academicYearId,
          semester,
          periodType,
          periodDate: new Date(periodDate),
          aspect,
          indicatorId,
          achievementLevel: assessment.achievementLevel,
          narrativeText: assessment.narrativeText,
          teacherNotes: assessment.teacherNotes,
          recommendations: assessment.recommendations,
          assessedById,
        },
      })
    )
  );

  return {
    count: created.length,
    assessments: created,
  };
}

async function updateAssessment(id: string, input: UpdatePAUDAssessmentInput) {
  const existing = await prisma.pAUDDevelopmentAssessment.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Assessment not found');
  }

  return prisma.pAUDDevelopmentAssessment.update({
    where: { id },
    data: {
      ...(input.periodType && { periodType: input.periodType }),
      ...(input.periodDate && { periodDate: new Date(input.periodDate) }),
      ...(input.aspect && { aspect: input.aspect }),
      ...(input.indicatorId !== undefined && { indicatorId: input.indicatorId }),
      ...(input.achievementLevel && { achievementLevel: input.achievementLevel }),
      ...(input.narrativeText !== undefined && { narrativeText: input.narrativeText }),
      ...(input.teacherNotes !== undefined && { teacherNotes: input.teacherNotes }),
      ...(input.recommendations !== undefined && { recommendations: input.recommendations }),
    },
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          user: { select: { name: true } },
        },
      },
      indicator: { select: { id: true, code: true, name: true } },
    },
  });
}

async function deleteAssessment(id: string) {
  const existing = await prisma.pAUDDevelopmentAssessment.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Assessment not found');
  }

  // Delete related evidences first
  await prisma.pAUDAssessmentEvidence.deleteMany({
    where: { assessmentId: id },
  });

  return prisma.pAUDDevelopmentAssessment.delete({
    where: { id },
  });
}

// ============================================
// EVIDENCE SERVICE
// ============================================

async function createEvidence(input: CreatePAUDEvidenceInput) {
  // Validate assessment exists
  const assessment = await prisma.pAUDDevelopmentAssessment.findUnique({
    where: { id: input.assessmentId },
  });

  if (!assessment) {
    throw new Error('Assessment not found');
  }

  return prisma.pAUDAssessmentEvidence.create({
    data: {
      assessmentId: input.assessmentId,
      fileUrl: input.fileUrl,
      fileType: input.fileType,
      fileName: input.fileName,
      caption: input.caption,
    },
  });
}

async function deleteEvidence(id: string) {
  const existing = await prisma.pAUDAssessmentEvidence.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Evidence not found');
  }

  return prisma.pAUDAssessmentEvidence.delete({
    where: { id },
  });
}

// ============================================
// NARRATIVE REPORT SERVICE
// ============================================

async function findAllNarrativeReports(
  query: ListNarrativeReportsQuery,
  context: { role: string; unitId?: string | null }
) {
  const { page, limit, studentId, unitId, academicYearId, semester, status } = query;
  const skip = (page - 1) * limit;

  // Semester is stored as string in DB (GANJIL/GENAP)

  const where: Prisma.PAUDNarrativeReportWhereInput = {
    ...(studentId && { studentId }),
    ...(unitId && { unitId }),
    ...(academicYearId && { academicYearId }),
    ...(semester && { semester }),
    ...(status && { status }),
    // Filter by unit if not super admin
    ...(context.role !== 'SUPER_ADMIN' && context.unitId && { unitId: context.unitId }),
  };

  const [reports, total] = await Promise.all([
    prisma.pAUDNarrativeReport.findMany({
      where,
      skip,
      take: limit,
      include: {
        student: {
          select: {
            id: true,
            nisn: true, nik: true,
            user: { select: { name: true } },
          },
        },
        unit: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        photos: { select: { id: true, photoUrl: true, caption: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
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

async function findNarrativeReportById(id: string) {
  const report = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          user: { select: { name: true } },
        },
      },
      unit: { select: { id: true, name: true, type: true } },
      academicYear: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      photos: true,
    },
  });

  if (!report) {
    throw new Error('Narrative report not found');
  }

  return report;
}

async function createNarrativeReport(input: CreatePAUDNarrativeReportInput, createdById: string) {
  // Check for existing report
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
    throw new Error(
      'Narrative report already exists for this student, academic year, and semester'
    );
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
      totalDays: input.totalDays || 0,
      presentDays: input.presentDays || 0,
      sickDays: input.sickDays || 0,
      excusedDays: input.excusedDays || 0,
      createdById,
    },
    include: {
      student: {
        select: {
          id: true,
          nisn: true, nik: true,
          user: { select: { name: true } },
        },
      },
    },
  });
}

async function updateNarrativeReport(id: string, input: UpdatePAUDNarrativeReportInput) {
  const existing = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Narrative report not found');
  }

  if (existing.status === 'FINALIZED') {
    throw new Error('Cannot update a finalized report');
  }

  return prisma.pAUDNarrativeReport.update({
    where: { id },
    data: {
      ...(input.narrativeNAM !== undefined && { narrativeNAM: input.narrativeNAM }),
      ...(input.narrativeFM !== undefined && { narrativeFM: input.narrativeFM }),
      ...(input.narrativeKOG !== undefined && { narrativeKOG: input.narrativeKOG }),
      ...(input.narrativeBHS !== undefined && { narrativeBHS: input.narrativeBHS }),
      ...(input.narrativeSE !== undefined && { narrativeSE: input.narrativeSE }),
      ...(input.narrativeSNI !== undefined && { narrativeSNI: input.narrativeSNI }),
      ...(input.overallStrengths !== undefined && { overallStrengths: input.overallStrengths }),
      ...(input.areasForDevelopment !== undefined && {
        areasForDevelopment: input.areasForDevelopment,
      }),
      ...(input.parentRecommendations !== undefined && {
        parentRecommendations: input.parentRecommendations,
      }),
      ...(input.teacherSignature !== undefined && { teacherSignature: input.teacherSignature }),
      ...(input.principalSignature !== undefined && {
        principalSignature: input.principalSignature,
      }),
      ...(input.totalDays !== undefined && { totalDays: input.totalDays }),
      ...(input.presentDays !== undefined && { presentDays: input.presentDays }),
      ...(input.sickDays !== undefined && { sickDays: input.sickDays }),
      ...(input.excusedDays !== undefined && { excusedDays: input.excusedDays }),
    },
  });
}

async function finalizeNarrativeReport(id: string, input: FinalizePAUDReportInput) {
  const existing = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Narrative report not found');
  }

  if (existing.status === 'FINALIZED') {
    throw new Error('Report is already finalized');
  }

  return prisma.pAUDNarrativeReport.update({
    where: { id },
    data: {
      status: 'FINALIZED',
      finalizedAt: new Date(),
      ...(input.teacherSignature && { teacherSignature: input.teacherSignature }),
      ...(input.principalSignature && { principalSignature: input.principalSignature }),
    },
  });
}

async function deleteNarrativeReport(id: string) {
  const existing = await prisma.pAUDNarrativeReport.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Narrative report not found');
  }

  if (existing.status === 'FINALIZED') {
    throw new Error('Cannot delete a finalized report');
  }

  // Delete related photos first
  await prisma.pAUDReportPhoto.deleteMany({
    where: { reportId: id },
  });

  return prisma.pAUDNarrativeReport.delete({
    where: { id },
  });
}

// ============================================
// SUMMARY/STATISTICS SERVICE
// ============================================

async function getStudentAssessmentSummary(query: AssessmentSummaryQuery) {
  const { studentId, academicYearId, semester } = query;

  // Semester is stored as string in DB (GANJIL/GENAP)

  const where: Prisma.PAUDDevelopmentAssessmentWhereInput = {
    studentId,
    ...(academicYearId && { academicYearId }),
    ...(semester && { semester }),
  };

  // Get all assessments grouped by aspect
  const assessments = await prisma.pAUDDevelopmentAssessment.findMany({
    where,
    include: {
      indicator: { select: { code: true, name: true } },
    },
    orderBy: [{ aspect: 'asc' }, { periodDate: 'desc' }],
  });

  // Calculate summary per aspect
  const aspects: PAUDAspect[] = ['NAM', 'FM', 'KOG', 'BHS', 'SE', 'SNI'];
  const achievementOrder = { BB: 1, MB: 2, BSH: 3, BSB: 4 };

  const summary = aspects.map((aspect) => {
    const aspectAssessments = assessments.filter((a) => a.aspect === aspect);
    const total = aspectAssessments.length;

    if (total === 0) {
      return {
        aspect,
        aspectName: getAspectName(aspect),
        totalAssessments: 0,
        latestLevel: null,
        latestDate: null,
        averageLevel: null,
        distribution: { BB: 0, MB: 0, BSH: 0, BSB: 0 },
      };
    }

    // Calculate distribution
    const distribution = { BB: 0, MB: 0, BSH: 0, BSB: 0 };
    let levelSum = 0;
    aspectAssessments.forEach((a) => {
      distribution[a.achievementLevel as PAUDAchievementLevel]++;
      levelSum += achievementOrder[a.achievementLevel as PAUDAchievementLevel];
    });

    // Get latest assessment for this aspect
    const latest = aspectAssessments[0];

    return {
      aspect,
      aspectName: getAspectName(aspect),
      totalAssessments: total,
      latestLevel: latest?.achievementLevel as PAUDAchievementLevel,
      latestDate: latest?.periodDate,
      averageLevel: levelSum / total,
      distribution,
    };
  });

  return {
    studentId,
    academicYearId,
    semester: semester || undefined,
    summary,
    totalAssessments: assessments.length,
  };
}

async function getClassSummary(query: ClassSummaryQuery) {
  const { unitId, academicYearId, semester, aspect } = query;

  // Semester is stored as string in DB (GANJIL/GENAP)

  // Get all students in the unit
  const students = await prisma.student.findMany({
    where: { unitId, deletedAt: null },
    select: {
      id: true,
      nisn: true, nik: true,
      user: { select: { name: true } },
    },
  });

  // Get assessments for all students
  const where: Prisma.PAUDDevelopmentAssessmentWhereInput = {
    unitId,
    ...(academicYearId && { academicYearId }),
    ...(semester && { semester }),
    ...(aspect && { aspect: aspect }),
  };

  const assessments = await prisma.pAUDDevelopmentAssessment.findMany({
    where,
    select: {
      studentId: true,
      aspect: true,
      achievementLevel: true,
    },
  });

  // Calculate summary per student
  const studentSummaries = students.map((student) => {
    const studentAssessments = assessments.filter((a) => a.studentId === student.id);
    const distribution = { BB: 0, MB: 0, BSH: 0, BSB: 0 };

    studentAssessments.forEach((a) => {
      distribution[a.achievementLevel as PAUDAchievementLevel]++;
    });

    return {
      student: {
        id: student.id,
        nisn: student.nisn || student.nik || "-",
        name: student.user.name,
      },
      totalAssessments: studentAssessments.length,
      distribution,
    };
  });

  // Overall class distribution
  const classDistribution = { BB: 0, MB: 0, BSH: 0, BSB: 0 };
  assessments.forEach((a) => {
    classDistribution[a.achievementLevel as PAUDAchievementLevel]++;
  });

  return {
    unitId,
    academicYearId,
    semester: semester || undefined,
    aspect,
    totalStudents: students.length,
    totalAssessments: assessments.length,
    classDistribution,
    students: studentSummaries,
  };
}

// Helper function to get aspect full name
function getAspectName(aspect: PAUDAspect): string {
  const names: Record<PAUDAspect, string> = {
    NAM: 'Nilai Agama & Moral',
    FM: 'Fisik Motorik',
    KOG: 'Kognitif',
    BHS: 'Bahasa',
    SE: 'Sosial Emosional',
    SNI: 'Seni',
  };
  return names[aspect];
}

// ============================================
// EXPORT SERVICE
// ============================================

export const paudAssessmentService = {
  // Indicators
  findAllIndicators,
  findIndicatorById,
  createIndicator,
  updateIndicator,
  deleteIndicator,

  // Assessments
  findAllAssessments,
  findAssessmentById,
  createAssessment,
  bulkCreateAssessments,
  createClassAssessment,
  updateAssessment,
  deleteAssessment,

  // Evidence
  createEvidence,
  deleteEvidence,

  // Narrative Reports
  findAllNarrativeReports,
  findNarrativeReportById,
  createNarrativeReport,
  updateNarrativeReport,
  finalizeNarrativeReport,
  deleteNarrativeReport,

  // Summary
  getStudentAssessmentSummary,
  getClassSummary,
};
