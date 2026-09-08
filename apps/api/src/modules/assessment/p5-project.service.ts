import { prisma } from '@/lib/prisma';
import { ApiError, ErrorCode } from '@/middleware/error';
import { Prisma } from '@prisma/client';

export class P5ProjectService {
  /**
   * Create a new P5 Project
   */
  static async createProject(data: {
    unitId: string;
    academicYearId: string;
    themeId: string;
    classId?: string;
    title: string;
    description: string;
    dimensions: any[]; // Array of dimension codes
    objectives?: any[];
    activities?: any[];
    schedule?: any[];
    startDate: Date;
    endDate: Date;
    supervisorId: string;
  }) {
    // Verify theme exists
    const theme = await prisma.p5Theme.findUnique({
      where: { id: data.themeId },
    });

    if (!theme) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Tema P5 tidak ditemukan');
    }

    return prisma.p5Project.create({
      data: {
        unitId: data.unitId,
        academicYearId: data.academicYearId,
        themeId: data.themeId,
        classId: data.classId,
        title: data.title,
        description: data.description,
        dimensions: data.dimensions as Prisma.InputJsonValue,
        objectives: data.objectives as Prisma.InputJsonValue,
        activities: data.activities as Prisma.InputJsonValue,
        schedule: data.schedule as Prisma.InputJsonValue,
        startDate: data.startDate,
        endDate: data.endDate,
        supervisorId: data.supervisorId,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Update an existing P5 Project
   */
  static async updateProject(
    id: string,
    data: Partial<{
      title: string;
      description: string;
      dimensions: any[];
      objectives: any[];
      activities: any[];
      schedule: any[];
      startDate: Date;
      endDate: Date;
      status: string;
      supervisorId: string;
    }>
  ) {
    const project = await prisma.p5Project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Projek P5 tidak ditemukan');
    }

    return prisma.p5Project.update({
      where: { id },
      data: {
        ...data,
        dimensions: data.dimensions as Prisma.InputJsonValue,
        objectives: data.objectives as Prisma.InputJsonValue,
        activities: data.activities as Prisma.InputJsonValue,
        schedule: data.schedule as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Delete a P5 Project
   */
  static async deleteProject(id: string) {
    return prisma.p5Project.delete({
      where: { id },
    });
  }

  /**
   * Get a P5 Project by ID
   */
  static async getProjectById(id: string) {
    return prisma.p5Project.findUnique({
      where: { id },
      include: {
        theme: true,
        supervisor: {
          include: {
            user: { select: { name: true } },
          },
        },
        class: { select: { name: true } },
      },
    });
  }

  /**
   * List P5 Projects with filters
   */
  static async getProjects(filters: {
    unitId?: string;
    academicYearId?: string;
    classId?: string;
    supervisorId?: string;
  }) {
    const where: Prisma.P5ProjectWhereInput = {};

    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.academicYearId) where.academicYearId = filters.academicYearId;
    if (filters.classId) where.classId = filters.classId;
    if (filters.supervisorId) where.supervisorId = filters.supervisorId;

    return prisma.p5Project.findMany({
      where,
      include: {
        theme: true,
        supervisor: {
          include: {
            user: { select: { name: true } },
          },
        },
        class: { select: { name: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * Record Assessment for a student in a project
   */
  static async upsertAssessment(data: {
    projectId: string;
    studentId: string;
    assessorId: string;
    beriman?: string;
    berkebinekaan?: string;
    bergotongroyong?: string;
    mandiri?: string;
    bernalarkritis?: string;
    kreatif?: string;
    overallGrade?: string;
    notes?: string;
  }) {
    const { projectId, studentId, assessorId, ...scores } = data;

    // Verify project exists
    const project = await prisma.p5Project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Projek P5 tidak ditemukan');
    }

    return prisma.p5Assessment.upsert({
      where: {
        projectId_studentId: {
          projectId,
          studentId,
        },
      },
      create: {
        projectId,
        studentId,
        assessedById: assessorId,
        assessedAt: new Date(),
        ...scores,
      },
      update: {
        assessedById: assessorId,
        assessedAt: new Date(),
        ...scores,
      },
    });
  }

  /**
   * Bulk Upsert Assessments for a class
   */
  static async bulkUpsertAssessments(
    assessments: {
      projectId: string;
      studentId: string;
      assessorId: string;
      beriman?: string;
      berkebinekaan?: string;
      bergotongroyong?: string;
      mandiri?: string;
      bernalarkritis?: string;
      kreatif?: string;
      overallGrade?: string;
      notes?: string;
    }[]
  ) {
    // Since Prisma doesn't support bulk upsert with different values efficiently in one query,
    // we'll use a transaction of upserts.
    return prisma.$transaction(
      assessments.map((assessment) => {
        const { projectId, studentId, assessorId, ...scores } = assessment;
        return prisma.p5Assessment.upsert({
          where: {
            projectId_studentId: {
              projectId,
              studentId,
            },
          },
          create: {
            projectId,
            studentId,
            assessedById: assessorId,
            assessedAt: new Date(),
            ...scores,
          },
          update: {
            assessedById: assessorId,
            assessedAt: new Date(),
            ...scores,
          },
        });
      })
    );
  }

  /**
   * Get Student Assessments for Report Card
   */
  static async getStudentAssessmentsForReport(studentId: string, academicYearId: string) {
    const assessments = await prisma.p5Assessment.findMany({
      where: {
        studentId,
        project: {
          academicYearId,
        },
      },
      include: {
        project: {
          include: {
            theme: true,
          },
        },
        assessedBy: {
          include: {
            user: { select: { name: true } },
          },
        },
      },
    });

    // Format for Report Card
    return assessments.map((assessment) => {
      const dimensions = [];
      if (assessment.beriman)
        dimensions.push({ code: 'BER', name: 'Beriman, Bertakwa...', capaian: assessment.beriman });
      if (assessment.berkebinekaan)
        dimensions.push({
          code: 'BKB',
          name: 'Berkebinekaan Global',
          capaian: assessment.berkebinekaan,
        });
      if (assessment.bergotongroyong)
        dimensions.push({ code: 'GR', name: 'Gotong Royong', capaian: assessment.bergotongroyong });
      if (assessment.mandiri)
        dimensions.push({ code: 'MAN', name: 'Mandiri', capaian: assessment.mandiri });
      if (assessment.bernalarkritis)
        dimensions.push({
          code: 'BK',
          name: 'Bernalar Kritis',
          capaian: assessment.bernalarkritis,
        });
      if (assessment.kreatif)
        dimensions.push({ code: 'KR', name: 'Kreatif', capaian: assessment.kreatif });

      return {
        id: assessment.id,
        projectId: assessment.projectId,
        theme: assessment.project.theme.name,
        title: assessment.project.title,
        description: assessment.project.description,
        // Expose the project period so the caller can attribute it to a semester
        // (P5Project has no `semester` column — the semester is derived from
        // when the project ran).
        startDate: assessment.project.startDate,
        endDate: assessment.project.endDate,
        dimensions,
        notes: assessment.notes,
        assessor: assessment.assessedBy.user.name,
      };
    });
  }
}
