import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { UserRole, Prisma } from '@prisma/client';
import { seesAllUnits } from '@/utils/resolve-unit-id';

type MuhadatsahStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

interface AuthenticatedUser {
  sub: string;
  role: string;
  roleCode?: string | null;
  unitId: string | null;
}

interface ListMuhadatsahQuery {
  unitId?: string;
  studentId?: string;
  partnerId?: string;
  evaluatorId?: string;
  status?: MuhadatsahStatus;
  language?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
}

interface CreateMuhadatsahInput {
  unitId: string;
  studentId: string;
  partnerId?: string;
  scheduledAt: string;
  topic?: string;
  language: string;
}

interface UpdateMuhadatsahInput {
  topic?: string;
  language?: string;
  partnerId?: string;
  scheduledAt?: string;
  status?: MuhadatsahStatus;
}

interface EvaluateMuhadatsahInput {
  fluencyScore: number;
  grammarScore: number;
  vocabularyScore: number;
  pronunciationScore: number;
  feedback?: string;
  recordingUrl?: string;
  duration?: number;
}

export class MuhadatsahService {
  async list(query: ListMuhadatsahQuery, currentUser: AuthenticatedUser) {
    const {
      page,
      limit,
      unitId,
      studentId,
      partnerId,
      evaluatorId,
      status,
      language,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.MuhadatsahWhereInput = {};

    if (!seesAllUnits(currentUser)) {
      where.unitId = currentUser.unitId || 'none';
    } else if (unitId) {
      where.unitId = unitId;
    }

    if (studentId) {
      where.studentId = studentId;
    }

    if (partnerId) {
      where.partnerId = partnerId;
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
      prisma.muhadatsah.findMany({
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
          partner: {
            include: {
              user: { select: { name: true } },
            },
          },
          evaluator: { include: { user: { select: { name: true } } } },
        },
      }),
      prisma.muhadatsah.count({ where }),
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
        partner: r.partner
          ? {
              id: r.partner.id,
              nisn: r.partner.nisn,
              nik: r.partner.nik,
              name: r.partner.user.name,
            }
          : null,
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
    const record = await prisma.muhadatsah.findUnique({
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
        partner: {
          include: {
            user: { select: { name: true } },
          },
        },
        evaluator: { include: { user: { select: { name: true } } } },
      },
    });

    if (!record) {
      throw Errors.notFound('Muhadatsah record not found');
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
      partner: record.partner
        ? {
            id: record.partner.id,
            nisn: record.partner.nisn,
            nik: record.partner.nik,
            name: record.partner.user.name,
          }
        : null,
      evaluator: record.evaluator
        ? {
            id: record.evaluator.id,
            name: record.evaluator.user.name,
          }
        : null,
    };
  }

  async create(input: CreateMuhadatsahInput, currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.SUPER_ADMIN && input.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Cannot create muhadatsah for another unit');
    }

    const student = await prisma.student.findUnique({ where: { id: input.studentId } });
    if (!student || student.deletedAt) {
      throw Errors.notFound('Student not found');
    }

    if (input.partnerId) {
      const partner = await prisma.student.findUnique({ where: { id: input.partnerId } });
      if (!partner || partner.deletedAt) {
        throw Errors.notFound('Partner student not found');
      }
    }

    const record = await prisma.muhadatsah.create({
      data: {
        unitId: input.unitId,
        studentId: input.studentId,
        partnerId: input.partnerId,
        scheduledAt: new Date(input.scheduledAt),
        topic: input.topic,
        language: input.language,
        status: 'SCHEDULED',
      },
      include: {
        student: { include: { user: { select: { name: true } } } },
        partner: { include: { user: { select: { name: true } } } },
        unit: { select: { id: true, name: true } },
      },
    });

    return record;
  }

  async update(id: string, input: UpdateMuhadatsahInput, currentUser: AuthenticatedUser) {
    await this.getById(id, currentUser);

    const updated = await prisma.muhadatsah.update({
      where: { id },
      data: {
        topic: input.topic,
        language: input.language,
        partnerId: input.partnerId,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        status: input.status,
      },
    });

    return updated;
  }

  async delete(id: string, currentUser: AuthenticatedUser) {
    await this.getById(id, currentUser);
    await prisma.muhadatsah.delete({ where: { id } });
    return { success: true };
  }

  async evaluate(id: string, input: EvaluateMuhadatsahInput, currentUser: AuthenticatedUser) {
    const record = await this.getById(id, currentUser);

    if (record.status === 'COMPLETED') {
      throw Errors.conflict('This muhadatsah has already been evaluated');
    }

    if (record.status === 'CANCELLED') {
      throw Errors.conflict('Cannot evaluate a cancelled muhadatsah');
    }

    const totalScore = Math.round(
      (input.fluencyScore + input.grammarScore + input.vocabularyScore + input.pronunciationScore) /
        4
    );
    const grade = this.calculateGrade(totalScore);

    const teacher = await prisma.teacher.findFirst({
      where: { userId: currentUser.sub },
    });

    const updated = await prisma.muhadatsah.update({
      where: { id },
      data: {
        fluencyScore: input.fluencyScore,
        grammarScore: input.grammarScore,
        vocabularyScore: input.vocabularyScore,
        pronunciationScore: input.pronunciationScore,
        totalScore,
        grade,
        feedback: input.feedback,
        recordingUrl: input.recordingUrl,
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
      throw Errors.conflict('Only scheduled muhadatsah can be cancelled');
    }

    const updated = await prisma.muhadatsah.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return updated;
  }

  async getUpcoming(unitId: string, limit: number = 10) {
    const now = new Date();

    const records = await prisma.muhadatsah.findMany({
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
          },
        },
        partner: {
          include: {
            user: { select: { name: true } },
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
      },
      partner: r.partner
        ? {
            id: r.partner.id,
            nisn: r.partner.nisn,
            nik: r.partner.nik,
            name: r.partner.user.name,
          }
        : null,
    }));
  }

  async getStudentHistory(studentId: string, limit: number = 20) {
    const records = await prisma.muhadatsah.findMany({
      where: {
        OR: [{ studentId }, { partnerId: studentId }],
      },
      take: limit,
      orderBy: { scheduledAt: 'desc' },
      include: {
        student: { include: { user: { select: { name: true } } } },
        partner: { include: { user: { select: { name: true } } } },
        evaluator: { include: { user: { select: { name: true } } } },
      },
    });

    return records;
  }

  async getStatistics(unitId: string, startDate?: string, endDate?: string) {
    const where: Prisma.MuhadatsahWhereInput = { unitId };

    if (startDate && endDate) {
      where.scheduledAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const [total, byStatus, byLanguage, avgScores] = await Promise.all([
      prisma.muhadatsah.count({ where }),
      prisma.muhadatsah.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      prisma.muhadatsah.groupBy({
        by: ['language'],
        where,
        _count: { language: true },
      }),
      prisma.muhadatsah.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _avg: {
          fluencyScore: true,
          grammarScore: true,
          vocabularyScore: true,
          pronunciationScore: true,
          totalScore: true,
        },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.status })),
      byLanguage: byLanguage.map((l) => ({ language: l.language, count: l._count.language })),
      averages: {
        fluency: avgScores._avg.fluencyScore || 0,
        grammar: avgScores._avg.grammarScore || 0,
        vocabulary: avgScores._avg.vocabularyScore || 0,
        pronunciation: avgScores._avg.pronunciationScore || 0,
        total: avgScores._avg.totalScore || 0,
      },
    };
  }

  async getTopPerformers(unitId: string, language?: string, limit: number = 10) {
    const where: Prisma.MuhadatsahWhereInput = {
      unitId,
      status: 'COMPLETED',
      totalScore: { not: null },
    };

    if (language) {
      where.language = language;
    }

    const performers = await prisma.muhadatsah.groupBy({
      by: ['studentId'],
      where,
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

  async matchPartners(unitId: string, language: string) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const scheduledThisWeek = await prisma.muhadatsah.findMany({
      where: {
        unitId,
        language,
        status: 'SCHEDULED',
        scheduledAt: { gte: weekStart, lte: weekEnd },
      },
      select: { studentId: true, partnerId: true },
    });

    const scheduledStudentIds = new Set<string>();
    scheduledThisWeek.forEach((s) => {
      scheduledStudentIds.add(s.studentId);
      if (s.partnerId) scheduledStudentIds.add(s.partnerId);
    });

    const availableStudents = await prisma.student.findMany({
      where: {
        unitId,
        deletedAt: null,
        id: { notIn: Array.from(scheduledStudentIds) },
      },
      include: {
        user: { select: { name: true } },
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { class: { select: { name: true, level: true } } },
          take: 1,
        },
      },
    });

    return availableStudents.map((s) => ({
      id: s.id,
      nisn: s.nisn,
      nik: s.nik,
      name: s.user.name,
      class: s.enrollments[0]?.class || null,
    }));
  }

  private calculateGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'E';
  }
}

export const muhadatsahService = new MuhadatsahService();
