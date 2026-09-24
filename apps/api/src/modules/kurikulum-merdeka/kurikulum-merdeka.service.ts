import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { claimBlobsForRecord, releaseBlobClaims } from '@/utils/blob-claim';
import { extractBlobUrlsFromAttachmentValue } from '@/utils/blob-attachments';
import {
  ListLearningOutcomesQueryInput,
  CreateLearningOutcomeInput,
  UpdateLearningOutcomeInput,
  ListLearningObjectivesQueryInput,
  CreateLearningObjectiveInput,
  UpdateLearningObjectiveInput,
  ListTeachingModulesQueryInput,
  CreateTeachingModuleInput,
  UpdateTeachingModuleInput,
  CreatePhaseInput,
  UpdatePhaseInput,
  CreateP5ThemeInput,
  UpdateP5ThemeInput,
  ListP5ProjectsQueryInput,
  CreateP5ProjectInput,
  UpdateP5ProjectInput,
  ListP5AssessmentsQueryInput,
  CreateP5AssessmentInput,
  UpdateP5AssessmentInput,
  ListMerdekaAssessmentsQueryInput,
  CreateMerdekaAssessmentInput,
  UpdateMerdekaAssessmentInput,
  ListMerdekaResultsQueryInput,
  CreateMerdekaResultInput,
  UpdateMerdekaResultInput,
} from './kurikulum-merdeka.schema';

// ==================== LEARNING PHASES ====================

export async function listPhases() {
  return prisma.learningPhase.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: {
        select: { learningOutcomes: true },
      },
    },
  });
}

export async function getPhaseById(id: string) {
  return prisma.learningPhase.findUnique({
    where: { id },
    include: {
      learningOutcomes: {
        include: {
          subject: { select: { id: true, code: true, name: true } },
        },
        orderBy: { code: 'asc' },
      },
    },
  });
}

export async function createPhase(data: CreatePhaseInput) {
  return prisma.learningPhase.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description,
      gradeRange: data.gradeRange,
    },
  });
}

export async function updatePhase(id: string, data: UpdatePhaseInput) {
  return prisma.learningPhase.update({
    where: { id },
    data,
  });
}

// ==================== LEARNING OUTCOMES ====================

export async function listLearningOutcomes(query: ListLearningOutcomesQueryInput) {
  const { phaseId, subjectId, isActive, page, limit } = query;

  const where = {
    ...(phaseId && { phaseId }),
    ...(subjectId && { subjectId }),
    ...(isActive !== undefined && { isActive }),
  };

  const [outcomes, total] = await Promise.all([
    prisma.learningOutcome.findMany({
      where,
      include: {
        phase: { select: { id: true, code: true, name: true } },
        subject: { select: { id: true, code: true, name: true } },
        _count: { select: { learningObjectives: true } },
      },
      orderBy: { code: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.learningOutcome.count({ where }),
  ]);

  return {
    data: outcomes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getLearningOutcomeById(id: string) {
  return prisma.learningOutcome.findUnique({
    where: { id },
    include: {
      phase: { select: { id: true, code: true, name: true } },
      subject: { select: { id: true, code: true, name: true } },
      learningObjectives: {
        orderBy: { sequence: 'asc' },
      },
    },
  });
}

export async function createLearningOutcome(data: CreateLearningOutcomeInput) {
  return prisma.learningOutcome.create({
    data: {
      phaseId: data.phaseId,
      subjectId: data.subjectId,
      code: data.code,
      description: data.description,
      elements: data.elements,
      isActive: data.isActive,
    },
  });
}

export async function updateLearningOutcome(id: string, data: UpdateLearningOutcomeInput) {
  const updateData: Record<string, unknown> = {};

  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.elements !== undefined) updateData.elements = data.elements;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.phaseId !== undefined) updateData.phase = { connect: { id: data.phaseId } };
  if (data.subjectId !== undefined) updateData.subject = { connect: { id: data.subjectId } };

  return prisma.learningOutcome.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteLearningOutcome(id: string) {
  return prisma.learningOutcome.delete({
    where: { id },
  });
}

// ==================== LEARNING OBJECTIVES ====================

export async function listLearningObjectives(query: ListLearningObjectivesQueryInput) {
  const { learningOutcomeId, isActive, page, limit } = query;

  const where = {
    ...(learningOutcomeId && { learningOutcomeId }),
    ...(isActive !== undefined && { isActive }),
  };

  const [objectives, total] = await Promise.all([
    prisma.learningObjective.findMany({
      where,
      include: {
        learningOutcome: {
          include: {
            phase: { select: { id: true, code: true, name: true } },
            subject: { select: { id: true, code: true, name: true } },
          },
        },
        _count: { select: { teachingModules: true, assessments: true } },
      },
      orderBy: [{ learningOutcomeId: 'asc' }, { sequence: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.learningObjective.count({ where }),
  ]);

  return {
    data: objectives,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getLearningObjectiveById(id: string) {
  return prisma.learningObjective.findUnique({
    where: { id },
    include: {
      learningOutcome: {
        include: {
          phase: { select: { id: true, code: true, name: true } },
          subject: { select: { id: true, code: true, name: true } },
        },
      },
      teachingModules: {
        include: {
          teacher: { include: { user: { select: { name: true } } } },
        },
        take: 10,
      },
    },
  });
}

export async function createLearningObjective(data: CreateLearningObjectiveInput) {
  return prisma.learningObjective.create({
    data: {
      learningOutcomeId: data.learningOutcomeId,
      code: data.code,
      description: data.description,
      indicators: data.indicators,
      sequence: data.sequence,
      isActive: data.isActive,
    },
  });
}

export async function updateLearningObjective(id: string, data: UpdateLearningObjectiveInput) {
  const updateData: Record<string, unknown> = {};

  if (data.code !== undefined) updateData.code = data.code;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.indicators !== undefined) updateData.indicators = data.indicators;
  if (data.sequence !== undefined) updateData.sequence = data.sequence;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.learningOutcomeId !== undefined)
    updateData.learningOutcome = { connect: { id: data.learningOutcomeId } };

  return prisma.learningObjective.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteLearningObjective(id: string) {
  return prisma.learningObjective.delete({
    where: { id },
  });
}

// ==================== TEACHING MODULES ====================

export async function listTeachingModules(query: ListTeachingModulesQueryInput) {
  const { learningObjectiveId, teacherId, classId, isPublished, page, limit } = query;

  const where = {
    ...(learningObjectiveId && { learningObjectiveId }),
    ...(teacherId && { teacherId }),
    ...(classId && { classId }),
    ...(isPublished !== undefined && { isPublished }),
  };

  const [modules, total] = await Promise.all([
    prisma.teachingModule.findMany({
      where,
      include: {
        learningObjective: {
          include: {
            learningOutcome: {
              include: {
                phase: { select: { id: true, code: true, name: true } },
                subject: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        teacher: { include: { user: { select: { name: true } } } },
        class: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.teachingModule.count({ where }),
  ]);

  return {
    data: modules,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getTeachingModuleById(id: string) {
  return prisma.teachingModule.findUnique({
    where: { id },
    include: {
      learningObjective: {
        include: {
          learningOutcome: {
            include: {
              phase: true,
              subject: true,
            },
          },
        },
      },
      teacher: { include: { user: { select: { name: true, email: true } } } },
      class: { select: { id: true, name: true } },
    },
  });
}

export async function createTeachingModule(data: CreateTeachingModuleInput) {
  // Attachments are opaque JSON today, but any upload reference inside is a
  // blob this record will point at; claim those before the insert so a discard
  // cannot delete one mid-commit (BUG 4 / flag 9).
  const blobUrls = extractBlobUrlsFromAttachmentValue(data.attachments);
  return prisma.$transaction(async (tx) => {
    const claims = await claimBlobsForRecord(blobUrls, 'kurikulum', tx);
    if (!claims) {
      throw Errors.conflict(
        'Lampiran modul sedang diproses pihak lain; unggah ulang berkas tersebut'
      );
    }

    const module = await tx.teachingModule.create({
      data: {
        learningObjectiveId: data.learningObjectiveId,
        teacherId: data.teacherId,
        classId: data.classId,
        title: data.title,
        topic: data.topic,
        duration: data.duration,
        objectives: data.objectives,
        prerequisites: data.prerequisites,
        targetLearners: data.targetLearners,
        materials: data.materials,
        activities: data.activities,
        assessmentPlan: data.assessmentPlan,
        differentiation: data.differentiation,
        reflection: data.reflection,
        attachments: data.attachments,
        isPublished: data.isPublished,
      },
    });

    await releaseBlobClaims(claims, tx);
    return module;
  });
}

export async function updateTeachingModule(id: string, data: UpdateTeachingModuleInput) {
  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.topic !== undefined) updateData.topic = data.topic;
  if (data.duration !== undefined) updateData.duration = data.duration;
  if (data.objectives !== undefined) updateData.objectives = data.objectives;
  if (data.prerequisites !== undefined) updateData.prerequisites = data.prerequisites;
  if (data.targetLearners !== undefined) updateData.targetLearners = data.targetLearners;
  if (data.materials !== undefined) updateData.materials = data.materials;
  if (data.activities !== undefined) updateData.activities = data.activities;
  if (data.assessmentPlan !== undefined) updateData.assessmentPlan = data.assessmentPlan;
  if (data.differentiation !== undefined) updateData.differentiation = data.differentiation;
  if (data.reflection !== undefined) updateData.reflection = data.reflection;
  if (data.attachments !== undefined) updateData.attachments = data.attachments;
  if (data.isPublished !== undefined) updateData.isPublished = data.isPublished;
  if (data.learningObjectiveId !== undefined)
    updateData.learningObjective = { connect: { id: data.learningObjectiveId } };
  if (data.classId !== undefined)
    updateData.class = data.classId ? { connect: { id: data.classId } } : { disconnect: true };

  // Replacement attachments are new blob references; claim them before the row
  // can point at them (flag 9). The submitter's old URLs simply stop being
  // referenced once this update commits, so a discard of those is then safe.
  const blobUrls =
    data.attachments === undefined ? [] : extractBlobUrlsFromAttachmentValue(data.attachments);
  return prisma.$transaction(async (tx) => {
    const claims = await claimBlobsForRecord(blobUrls, 'kurikulum', tx);
    if (!claims) {
      throw Errors.conflict(
        'Lampiran modul sedang diproses pihak lain; unggah ulang berkas tersebut'
      );
    }

    const module = await tx.teachingModule.update({
      where: { id },
      data: updateData,
    });

    await releaseBlobClaims(claims, tx);
    return module;
  });
}

export async function deleteTeachingModule(id: string) {
  return prisma.teachingModule.delete({
    where: { id },
  });
}

// ==================== P5 THEMES ====================

export async function listP5Themes() {
  return prisma.p5Theme.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { projects: true } },
    },
  });
}

export async function getP5ThemeById(id: string) {
  return prisma.p5Theme.findUnique({
    where: { id },
    include: {
      projects: {
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function createP5Theme(data: CreateP5ThemeInput) {
  return prisma.p5Theme.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description,
      isActive: data.isActive,
    },
  });
}

export async function updateP5Theme(id: string, data: UpdateP5ThemeInput) {
  return prisma.p5Theme.update({
    where: { id },
    data,
  });
}

// ==================== P5 DIMENSIONS ====================

export function getP5Dimensions() {
  return [
    { code: 'BERIMAN', name: 'Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia' },
    { code: 'BERKEBINEKAAN', name: 'Berkebinekaan Global' },
    { code: 'BERGOTONG_ROYONG', name: 'Bergotong Royong' },
    { code: 'MANDIRI', name: 'Mandiri' },
    { code: 'BERNALAR_KRITIS', name: 'Bernalar Kritis' },
    { code: 'KREATIF', name: 'Kreatif' },
  ];
}

// ==================== P5 PROJECTS ====================

export async function listP5Projects(query: ListP5ProjectsQueryInput) {
  const { unitId, academicYearId, themeId, classId, supervisorId, status, page, limit } = query;

  const where = {
    ...(unitId && { unitId }),
    ...(academicYearId && { academicYearId }),
    ...(themeId && { themeId }),
    ...(classId && { classId }),
    ...(supervisorId && { supervisorId }),
    ...(status && { status }),
  };

  const [projects, total] = await Promise.all([
    prisma.p5Project.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
        theme: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, name: true } },
        supervisor: { include: { user: { select: { name: true } } } },
        _count: { select: { assessments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.p5Project.count({ where }),
  ]);

  return {
    data: projects,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getP5ProjectById(id: string) {
  return prisma.p5Project.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
      theme: true,
      class: { select: { id: true, name: true } },
      supervisor: { include: { user: { select: { name: true, email: true } } } },
      assessments: {
        include: {
          student: { include: { user: { select: { name: true } } } },
          assessedBy: { include: { user: { select: { name: true } } } },
        },
        orderBy: { assessedAt: 'desc' },
      },
    },
  });
}

export async function createP5Project(data: CreateP5ProjectInput) {
  return prisma.p5Project.create({
    data: {
      unitId: data.unitId,
      academicYearId: data.academicYearId,
      themeId: data.themeId,
      classId: data.classId,
      title: data.title,
      description: data.description,
      objectives: data.objectives,
      dimensions: data.dimensions,
      activities: data.activities,
      schedule: data.schedule,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      supervisorId: data.supervisorId,
      status: data.status,
    },
  });
}

export async function updateP5Project(id: string, data: UpdateP5ProjectInput) {
  const updateData: Record<string, unknown> = { ...data };

  if (data.startDate) {
    updateData.startDate = new Date(data.startDate);
  }
  if (data.endDate) {
    updateData.endDate = new Date(data.endDate);
  }

  return prisma.p5Project.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteP5Project(id: string) {
  return prisma.p5Project.delete({
    where: { id },
  });
}

// ==================== P5 ASSESSMENTS ====================

export async function listP5Assessments(query: ListP5AssessmentsQueryInput) {
  const { projectId, studentId, assessedById, page, limit } = query;

  const where = {
    ...(projectId && { projectId }),
    ...(studentId && { studentId }),
    ...(assessedById && { assessedById }),
  };

  const [assessments, total] = await Promise.all([
    prisma.p5Assessment.findMany({
      where,
      include: {
        project: { select: { id: true, title: true, dimensions: true } },
        student: { include: { user: { select: { name: true } } } },
        assessedBy: { include: { user: { select: { name: true } } } },
      },
      orderBy: { assessedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.p5Assessment.count({ where }),
  ]);

  return {
    data: assessments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getP5AssessmentById(id: string) {
  return prisma.p5Assessment.findUnique({
    where: { id },
    include: {
      project: {
        include: {
          theme: true,
          unit: { select: { id: true, name: true } },
        },
      },
      student: { include: { user: { select: { name: true, email: true } } } },
      assessedBy: { include: { user: { select: { name: true } } } },
    },
  });
}

export async function createP5Assessment(data: CreateP5AssessmentInput) {
  return prisma.p5Assessment.create({
    data: {
      projectId: data.projectId,
      studentId: data.studentId,
      beriman: data.beriman,
      berkebinekaan: data.berkebinekaan,
      bergotongroyong: data.bergotongroyong,
      mandiri: data.mandiri,
      bernalarkritis: data.bernalarkritis,
      kreatif: data.kreatif,
      overallGrade: data.overallGrade,
      notes: data.notes,
      assessedById: data.assessedById,
    },
  });
}

export async function updateP5Assessment(id: string, data: UpdateP5AssessmentInput) {
  return prisma.p5Assessment.update({
    where: { id },
    data,
  });
}

export async function deleteP5Assessment(id: string) {
  return prisma.p5Assessment.delete({
    where: { id },
  });
}

// ==================== MERDEKA ASSESSMENTS ====================

export async function listMerdekaAssessments(query: ListMerdekaAssessmentsQueryInput) {
  const { unitId, classId, subjectId, teacherId, academicYearId, category, status, page, limit } =
    query;

  const where = {
    ...(unitId && { unitId }),
    ...(classId && { classId }),
    ...(subjectId && { subjectId }),
    ...(teacherId && { teacherId }),
    ...(academicYearId && { academicYearId }),
    ...(category && { category }),
    ...(status && { status }),
  };

  const [assessments, total] = await Promise.all([
    prisma.merdekaAssessment.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        subject: { select: { id: true, code: true, name: true } },
        learningObjective: {
          include: {
            learningOutcome: {
              include: {
                phase: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        teacher: { include: { user: { select: { name: true } } } },
        academicYear: { select: { id: true, name: true } },
        _count: { select: { results: true } },
      },
      orderBy: { assessmentDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.merdekaAssessment.count({ where }),
  ]);

  return {
    data: assessments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getMerdekaAssessmentById(id: string) {
  return prisma.merdekaAssessment.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
      subject: { select: { id: true, code: true, name: true } },
      learningObjective: {
        include: {
          learningOutcome: {
            include: {
              phase: true,
            },
          },
        },
      },
      teacher: { include: { user: { select: { name: true, email: true } } } },
      academicYear: { select: { id: true, name: true } },
      results: {
        include: {
          student: { include: { user: { select: { name: true } } } },
          gradedBy: { select: { id: true, name: true } },
        },
        orderBy: { gradedAt: 'desc' },
      },
    },
  });
}

export async function createMerdekaAssessment(data: CreateMerdekaAssessmentInput) {
  return prisma.merdekaAssessment.create({
    data: {
      unitId: data.unitId,
      classId: data.classId,
      subjectId: data.subjectId,
      learningObjectiveId: data.learningObjectiveId,
      teacherId: data.teacherId,
      academicYearId: data.academicYearId,
      title: data.title,
      category: data.category,
      description: data.description,
      instructions: data.instructions,
      assessmentDate: new Date(data.assessmentDate),
      duration: data.duration,
      maxScore: data.maxScore,
      weight: data.weight,
      rubric: data.rubric,
      status: data.status,
    },
  });
}

export async function updateMerdekaAssessment(id: string, data: UpdateMerdekaAssessmentInput) {
  const updateData: Record<string, unknown> = { ...data };

  if (data.assessmentDate) {
    updateData.assessmentDate = new Date(data.assessmentDate);
  }

  return prisma.merdekaAssessment.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteMerdekaAssessment(id: string) {
  return prisma.merdekaAssessment.delete({
    where: { id },
  });
}

// ==================== MERDEKA ASSESSMENT RESULTS ====================

export async function listMerdekaResults(query: ListMerdekaResultsQueryInput) {
  const { assessmentId, studentId, page, limit } = query;

  const where = {
    ...(assessmentId && { assessmentId }),
    ...(studentId && { studentId }),
  };

  const [results, total] = await Promise.all([
    prisma.merdekaAssessmentResult.findMany({
      where,
      include: {
        assessment: {
          include: {
            subject: { select: { id: true, code: true, name: true } },
            class: { select: { id: true, name: true } },
          },
        },
        student: { include: { user: { select: { name: true } } } },
        gradedBy: { select: { id: true, name: true } },
      },
      orderBy: { gradedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.merdekaAssessmentResult.count({ where }),
  ]);

  return {
    data: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getMerdekaResultById(id: string) {
  return prisma.merdekaAssessmentResult.findUnique({
    where: { id },
    include: {
      assessment: {
        include: {
          subject: true,
          class: true,
          teacher: { include: { user: { select: { name: true } } } },
        },
      },
      student: { include: { user: { select: { name: true, email: true } } } },
      gradedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function createMerdekaResult(data: CreateMerdekaResultInput) {
  // Attachments may carry upload references; claim them before the row
  // references them (BUG 4 / flag 9).
  const blobUrls = extractBlobUrlsFromAttachmentValue(data.attachments);
  return prisma.$transaction(async (tx) => {
    const claims = await claimBlobsForRecord(blobUrls, 'kurikulum', tx);
    if (!claims) {
      throw Errors.conflict(
        'Lampiran hasil penilaian sedang diproses pihak lain; unggah ulang berkas tersebut'
      );
    }

    const result = await tx.merdekaAssessmentResult.create({
      data: {
        assessmentId: data.assessmentId,
        studentId: data.studentId,
        score: data.score,
        percentage: data.percentage,
        grade: data.grade,
        feedback: data.feedback,
        attachments: data.attachments,
        gradedById: data.gradedById,
      },
    });

    await releaseBlobClaims(claims, tx);
    return result;
  });
}

export async function updateMerdekaResult(id: string, data: UpdateMerdekaResultInput) {
  const updateData: Record<string, unknown> = {};

  if (data.score !== undefined) updateData.score = data.score;
  if (data.percentage !== undefined) updateData.percentage = data.percentage;
  if (data.grade !== undefined) updateData.grade = data.grade;
  if (data.feedback !== undefined) updateData.feedback = data.feedback;
  if (data.attachments !== undefined) {
    updateData.attachments = data.attachments === null ? { unset: true } : data.attachments;
  }

  // A replacement attachment set introduces new blob references: claim them
  // before the update commits (flag 9).
  const blobUrls =
    data.attachments === undefined || data.attachments === null
      ? []
      : extractBlobUrlsFromAttachmentValue(data.attachments);
  return prisma.$transaction(async (tx) => {
    const claims = await claimBlobsForRecord(blobUrls, 'kurikulum', tx);
    if (!claims) {
      throw Errors.conflict(
        'Lampiran hasil penilaian sedang diproses pihak lain; unggah ulang berkas tersebut'
      );
    }

    const result = await tx.merdekaAssessmentResult.update({
      where: { id },
      data: updateData,
    });

    await releaseBlobClaims(claims, tx);
    return result;
  });
}

export async function deleteMerdekaResult(id: string) {
  return prisma.merdekaAssessmentResult.delete({
    where: { id },
  });
}

// ==================== SUMMARY & STATISTICS ====================

export async function getKurikulumMerdekaSummary(unitId?: string, academicYearId?: string) {
  const unitFilter = unitId ? { unitId } : {};
  const yearFilter = academicYearId ? { academicYearId } : {};

  const [
    phasesCount,
    outcomesCount,
    objectivesCount,
    modulesCount,
    themesCount,
    projectsCount,
    p5AssessmentsCount,
    merdekaAssessmentsCount,
    activeProjects,
  ] = await Promise.all([
    prisma.learningPhase.count(),
    prisma.learningOutcome.count({ where: { isActive: true } }),
    prisma.learningObjective.count({ where: { isActive: true } }),
    prisma.teachingModule.count({ where: { isPublished: true } }),
    prisma.p5Theme.count({ where: { isActive: true } }),
    prisma.p5Project.count({ where: { ...unitFilter, ...yearFilter } }),
    prisma.p5Assessment.count(),
    prisma.merdekaAssessment.count({ where: { ...unitFilter, ...yearFilter } }),
    prisma.p5Project.count({ where: { ...unitFilter, ...yearFilter, status: 'ACTIVE' } }),
  ]);

  return {
    phases: phasesCount,
    learningOutcomes: outcomesCount,
    learningObjectives: objectivesCount,
    teachingModules: modulesCount,
    p5Themes: themesCount,
    p5Projects: projectsCount,
    p5ActiveProjects: activeProjects,
    p5Assessments: p5AssessmentsCount,
    merdekaAssessments: merdekaAssessmentsCount,
  };
}
