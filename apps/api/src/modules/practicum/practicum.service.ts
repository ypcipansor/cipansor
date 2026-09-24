import { prisma } from '../../lib/prisma';
import { Prisma, PracticumStatus } from '@prisma/client';

export class PracticumService {
  // Lesson Plans
  async createLessonPlan(studentId: string, data: any) {
    return prisma.practicumLessonPlan.create({
      data: {
        ...data,
        studentId,
        status: 'DRAFT',
      },
    });
  }

  async getLessonPlans(studentId?: string, academicYearId?: string) {
    return prisma.practicumLessonPlan.findMany({
      where: {
        ...(studentId && { studentId }),
        ...(academicYearId && { academicYearId }),
      },
      include: {
        student: { include: { user: { select: { name: true } } } },
        academicYear: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLessonPlanById(id: string) {
    return prisma.practicumLessonPlan.findUniqueOrThrow({
      where: { id },
      include: {
        student: { include: { user: { select: { name: true } } } },
        academicYear: true,
        reviewer: { select: { name: true } },
        evaluations: { include: { evaluator: { select: { name: true } } } },
        schedules: { include: { targetClass: true } },
      },
    });
  }

  async updateLessonPlan(id: string, data: any) {
    return prisma.practicumLessonPlan.update({
      where: { id },
      data,
    });
  }

  async reviewLessonPlan(
    id: string,
    reviewerId: string,
    data: { status: PracticumStatus; reviewNotes?: string }
  ) {
    return prisma.practicumLessonPlan.update({
      where: { id },
      data: {
        status: data.status,
        reviewNotes: data.reviewNotes,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
  }

  // Schedules
  async createSchedule(data: any) {
    return prisma.practicumSchedule.create({
      data: {
        ...data,
        date: new Date(data.date),
      },
    });
  }

  async getSchedules(targetClassId?: string, date?: string) {
    const where: Prisma.PracticumScheduleWhereInput = {};
    if (targetClassId) where.targetClassId = targetClassId;
    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(d.getDate() + 1);
      where.date = { gte: d, lt: nextD };
    }

    return prisma.practicumSchedule.findMany({
      where,
      include: {
        lessonPlan: {
          include: {
            student: { include: { user: { select: { name: true } } } },
          },
        },
        targetClass: true,
      },
    });
  }

  // Evaluations
  async createEvaluation(evaluatorId: string, data: any) {
    const totalScore =
      (data.methodScore + data.contentScore + data.languageScore + data.performanceScore) / 4;

    return prisma.practicumEvaluation.create({
      data: {
        ...data,
        evaluatorId,
        totalScore,
      },
    });
  }
}

export const practicumService = new PracticumService();
