import { prisma } from '../../lib/prisma';

export class ResearchService {
  // Themes
  async createTheme(data: any) {
    return prisma.researchTheme.create({ data });
  }

  async getThemes(unitId?: string, academicYearId?: string) {
    return prisma.researchTheme.findMany({
      where: {
        ...(unitId && { unitId }),
        ...(academicYearId && { academicYearId }),
      },
      include: {
        _count: { select: { submissions: true } },
      },
    });
  }

  async getThemeById(id: string) {
    return prisma.researchTheme.findUniqueOrThrow({
      where: { id },
      include: {
        submissions: {
          include: {
            student: { include: { user: { select: { name: true } } } },
          },
        },
      },
    });
  }

  // Submissions
  async createSubmission(studentId: string, data: any) {
    return prisma.researchSubmission.create({
      data: {
        ...data,
        studentId,
        status: 'DRAFT',
      },
    });
  }

  async getSubmissionsByStudent(studentId: string) {
    return prisma.researchSubmission.findMany({
      where: { studentId },
      include: {
        theme: true,
      },
    });
  }

  async getSubmissionById(id: string) {
    return prisma.researchSubmission.findUniqueOrThrow({
      where: { id },
      include: {
        student: { include: { user: { select: { name: true } } } },
        theme: true,
        references: true,
        reviewer: { select: { name: true } },
      },
    });
  }

  async updateSubmission(id: string, data: any) {
    return prisma.researchSubmission.update({
      where: { id },
      data,
    });
  }

  async reviewSubmission(
    id: string,
    reviewerId: string,
    data: { status: string; feedback?: string }
  ) {
    return prisma.researchSubmission.update({
      where: { id },
      data: {
        status: data.status,
        feedback: data.feedback,
        reviewedById: reviewerId,
      },
    });
  }

  // References
  async addReference(data: any) {
    return prisma.researchReference.create({ data });
  }

  async deleteReference(id: string) {
    return prisma.researchReference.delete({ where: { id } });
  }
}

export const researchService = new ResearchService();
