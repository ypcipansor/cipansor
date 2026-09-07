import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { UserRole, Prisma } from '@prisma/client';
import { seesAllUnits } from '@/utils/resolve-unit-id';

type MuhadhorohStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

interface AuthenticatedUser {
  sub: string;
  role: string;
  roleCode?: string | null;
  unitId: string | null;
}

interface ListMuhadhorohQuery {
  unitId?: string;
  studentId?: string;
  evaluatorId?: string;
  status?: MuhadhorohStatus;
  language?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
}

interface CreateMuhadhorohInput {
  unitId: string;
  studentId: string;
  scheduledAt: string;
  topic: string;
  language?: string;
}

interface UpdateMuhadhorohInput {
  topic?: string;
  language?: string;
  scheduledAt?: string;
  status?: MuhadhorohStatus;
}

interface EvaluateMuhadhorohInput {
  contentScore: number;
  deliveryScore: number;
  languageScore: number;
  feedback?: string;
  videoUrl?: string;
  duration?: number;
}

export class MuhadhorohService {
  async list(query: ListMuhadhorohQuery, currentUser: AuthenticatedUser) {
    const { page, limit, unitId, studentId, evaluatorId, status, language, startDate, endDate } =
      query;
    const skip = (page - 1) * limit;

    const where: Prisma.MuhadhorohWhereInput = {};

    if (!seesAllUnits(currentUser)) {
      where.unitId = currentUser.unitId || 'none';
    } else if (unitId) {
      where.unitId = unitId;
    }

    if (studentId) {
      where.studentId = studentId;
    }

    if (evaluatorId) {
      where.evaluatorId = evaluatorId;
    }

    if (status) {
      where.status = status;
    }

    if (language) {
      where.language = language;
    }

    if (startDate || endDate) {
      where.scheduledAt = {};
      if (startDate) where.scheduledAt.gte = new Date(startDate);
      if (endDate) where.scheduledAt.lte = new Date(endDate);
    }

    const [records, total] = await Promise.all([
      prisma.muhadhoroh.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        include: {
          unit: { select: { id: true, name: true } },
          student: {
            include: {
              user: { select: { name: true } },
              enrollments: {
                where: { status: 'ACTIVE' },
                include: { class: { select: { id: true, name: true, level: true } } },
                take: 1,
              },
            },
          },
          evaluator: { include: { user: { select: { name: true } } } },
        },
      }),
      prisma.muhadhoroh.count({ where }),
    ]);

    return {
      data: records.map((r) => ({
        ...r,
        student: {
          id: r.student.id,
          nisn: r.student.nisn,
          nik: r.student.nik,
          name: r.student.user.name,
          class: r.student.enrollments[0]?.class || null,
        },
        evaluator: r.evaluator
          ? {
              id: r.evaluator.id,
              name: r.evaluator.user.name,
            }
          : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string, currentUser: AuthenticatedUser) {
    const record = await prisma.muhadhoroh.findUnique({
      where: { id },
      include: {
        unit: true,
        student: {
          include: {
            user: { select: { name: true, email: true } },
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { class: true },
              take: 1,
            },
          },
        },
        evaluator: { include: { user: { select: { name: true } } } },
      },
    });

    if (!record) {
      throw Errors.notFound('Muhadhoroh record not found');
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN && record.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    return {
      ...record,
      student: {
        id: record.student.id,
        nisn: record.student.nisn,
        nik: record.student.nik,
        name: record.student.user.name,
        email: record.student.user.email,
        class: record.student.enrollments[0]?.class || null,
      },
      evaluator: record.evaluator
        ? {
            id: record.evaluator.id,
            name: record.evaluator.user.name,
          }
        : null,
    };
  }

  async create(input: CreateMuhadhorohInput, currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.SUPER_ADMIN && input.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Cannot create muhadhoroh for another unit');
    }

    const student = await prisma.student.findUnique({ where: { id: input.studentId } });
    if (!student || student.deletedAt) {
      throw Errors.notFound('Student not found');
    }

    const record = await prisma.muhadhoroh.create({
      data: {
        unitId: input.unitId,
        studentId: input.studentId,
        scheduledAt: new Date(input.scheduledAt),
        topic: input.topic,
        language: input.language || 'Indonesian',
        status: 'SCHEDULED',
      },
      include: {
        student: { include: { user: { select: { name: true } } } },
        unit: { select: { id: true, name: true } },
      },
    });

    return record;
  }

  async update(id: string, input: UpdateMuhadhorohInput, currentUser: AuthenticatedUser) {
    await this.getById(id, currentUser);

    const updated = await prisma.muhadhoroh.update({
      where: { id },
      data: {
        topic: input.topic,
        language: input.language,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        status: input.status,
      },
    });

    return updated;
  }

  async delete(id: string, currentUser: AuthenticatedUser) {
    await this.getById(id, currentUser);
    await prisma.muhadhoroh.delete({ where: { id } });
    return { success: true };
  }

  async evaluate(id: string, input: EvaluateMuhadhorohInput, currentUser: AuthenticatedUser) {
    const record = await this.getById(id, currentUser);

    if (record.status === 'COMPLETED') {
      throw Errors.conflict('This muhadhoroh has already been evaluated');
    }

    if (record.status === 'CANCELLED') {
      throw Errors.conflict('Cannot evaluate a cancelled muhadhoroh');
    }

    const totalScore = Math.round(
      (input.contentScore + input.deliveryScore + input.languageScore) / 3
    );
    const grade = this.calculateGrade(totalScore);

    const teacher = await prisma.teacher.findFirst({
      where: { userId: currentUser.sub },
    });

    const updated = await prisma.muhadhoroh.update({
      where: { id },
      data: {
        contentScore: input.contentScore,
        deliveryScore: input.deliveryScore,
        languageScore: input.languageScore,
        totalScore,
        grade,
        feedback: input.feedback,
        videoUrl: input.videoUrl,
        duration: input.duration,
        evaluatorId: teacher?.id || null,
        evaluatedAt: new Date(),
        status: 'COMPLETED',
      },
    });

    return updated;
  }

  async cancel(id: string, currentUser: AuthenticatedUser) {
    const record = await this.getById(id, currentUser);

    if (record.status !== 'SCHEDULED') {
      throw Errors.conflict('Only scheduled muhadhoroh can be cancelled');
    }

    const updated = await prisma.muhadhoroh.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return updated;
  }

  async getUpcoming(unitId: string, limit: number = 10) {
    const now = new Date();

    const records = await prisma.muhadhoroh.findMany({
      where: {
        unitId,
        status: 'SCHEDULED',
        scheduledAt: { gte: now },
      },
      take: limit,
      orderBy: { scheduledAt: 'asc' },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { class: { select: { name: true } } },
              take: 1,
            },
          },
        },
      },
    });

    return records.map((r) => ({
      ...r,
      student: {
        id: r.student.id,
        nisn: r.student.nisn,
        nik: r.student.nik,
        name: r.student.user.name,
        class: r.student.enrollments[0]?.class?.name || null,
      },
    }));
  }

  async getStudentHistory(studentId: string, limit: number = 20) {
    const records = await prisma.muhadhoroh.findMany({
      where: { studentId },
      take: limit,
      orderBy: { scheduledAt: 'desc' },
      include: {
        evaluator: { include: { user: { select: { name: true } } } },
      },
    });

    return records;
  }

  async getStatistics(unitId: string, startDate?: string, endDate?: string) {
    const where: Prisma.MuhadhorohWhereInput = { unitId };

    if (startDate && endDate) {
      where.scheduledAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const [total, byStatus, byLanguage, avgScores] = await Promise.all([
      prisma.muhadhoroh.count({ where }),
      prisma.muhadhoroh.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      prisma.muhadhoroh.groupBy({
        by: ['language'],
        where,
        _count: { language: true },
      }),
      prisma.muhadhoroh.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _avg: {
          contentScore: true,
          deliveryScore: true,
          languageScore: true,
          totalScore: true,
        },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.status })),
      byLanguage: byLanguage.map((l) => ({ language: l.language, count: l._count.language })),
      averages: {
        content: avgScores._avg.contentScore || 0,
        delivery: avgScores._avg.deliveryScore || 0,
        language: avgScores._avg.languageScore || 0,
        total: avgScores._avg.totalScore || 0,
      },
    };
  }

  async getTopPerformers(unitId: string, limit: number = 10) {
    const performers = await prisma.muhadhoroh.groupBy({
      by: ['studentId'],
      where: {
        unitId,
        status: 'COMPLETED',
        totalScore: { not: null },
      },
      _avg: { totalScore: true },
      _count: { id: true },
      orderBy: { _avg: { totalScore: 'desc' } },
      take: limit,
    });

    const studentIds = performers.map((p) => p.studentId);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: {
        user: { select: { name: true } },
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { class: { select: { name: true } } },
          take: 1,
        },
      },
    });

    const studentMap = new Map(students.map((s) => [s.id, s]));

    return performers.map((p) => {
      const student = studentMap.get(p.studentId);
      return {
        studentId: p.studentId,
        name: student?.user.name || 'Unknown',
        nisn: student?.nisn || null,
        nik: student?.nik || null,
        class: student?.enrollments[0]?.class?.name || null,
        averageScore: p._avg.totalScore || 0,
        totalSessions: p._count.id,
      };
    });
  }

  private calculateGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'E';
  }
}

export const muhadhorohService = new MuhadhorohService();
