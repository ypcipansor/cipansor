import { prisma } from '../../lib/prisma';
import { ApiError, ErrorCode } from '../../middleware/error';
import { Prisma, AttendanceStatus, Invoice, StudentParent } from '@prisma/client';
import { getStudentIbadahStats } from '../ibadah/ibadah.service';
import * as DormitoryService from '../dormitories/dormitories.service';

type StudentParentWithStudent = Awaited<ReturnType<typeof prisma.studentParent.findMany>>[0];
type GradeWithRelations = Awaited<ReturnType<typeof prisma.grade.findMany>>[0];

export class ParentService {
  async getChildren(parentId: string) {
    const children = await prisma.studentParent.findMany({
      where: { parentId },
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                isActive: true,
              },
            },
            unit: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            enrollments: {
              where: { status: 'active' },
              include: {
                class: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                    academicYear: {
                      select: {
                        id: true,
                        name: true,
                        isActive: true,
                      },
                    },
                    homeroomTeacher: {
                      select: {
                        id: true,
                        user: {
                          select: {
                            id: true,
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
              take: 1,
              orderBy: { enrolledAt: 'desc' },
            },
          },
        },
      },
    });

    return children.map((sp: (typeof children)[0]) => ({
      id: sp.student.id,
      name: sp.student.user.name,
      nisn: sp.student.nisn,
      nik: sp.student.nik,
      gender: sp.student.gender,
      birthPlace: sp.student.birthPlace,
      birthDate: sp.student.birthDate,
      address: sp.student.address,
      phone: sp.student.parentPhone,
      email: sp.student.user.email,
      photoUrl: sp.student.photoUrl,
      status: sp.student.status,
      relation: sp.relation,
      isPrimary: sp.isPrimary,
      unitId: sp.student.unitId,
      unit: sp.student.unit,
      currentClass: sp.student.enrollments[0]?.class || null,
    }));
  }

  async verifyParentAccess(parentId: string, studentId: string) {
    const link = await prisma.studentParent.findUnique({
      where: {
        studentId_parentId: { studentId, parentId },
      },
    });

    if (!link) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Anda tidak memiliki akses ke data anak ini');
    }

    return link;
  }

  async getChildProfile(parentId: string, studentId: string) {
    await this.verifyParentAccess(parentId, studentId);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        unit: {
          select: {
            id: true,
            name: true,
            type: true,
            address: true,
            phone: true,
          },
        },
        enrollments: {
          where: { status: 'active' },
          include: {
            class: {
              include: {
                academicYear: true,
                homeroomTeacher: {
                  include: {
                    user: {
                      select: {
                        name: true,
                        phone: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        },
        roomAssignments: {
          where: { isActive: true },
          include: {
            room: {
              include: {
                dormitory: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!student) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Data anak tidak ditemukan');
    }

    return {
      ...student,
      currentClass: student.enrollments[0]?.class || null,
      currentRoom: student.roomAssignments[0]?.room || null,
    };
  }

  async getChildAttendance(
    parentId: string,
    studentId: string,
    query: {
      startDate?: string;
      endDate?: string;
      academicYearId?: string;
    }
  ) {
    await this.verifyParentAccess(parentId, studentId);

    const where: Prisma.AttendanceWhereInput = { studentId };

    if (query.startDate || query.endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.startDate) dateFilter.gte = new Date(query.startDate);
      if (query.endDate) dateFilter.lte = new Date(query.endDate);
      where.date = dateFilter;
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        class: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 30,
    });

    const summary = await prisma.attendance.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    });

    type SummaryMap = {
      present: number;
      absent: number;
      late: number;
      sick: number;
      excused: number;
    };
    const summaryMap = summary.reduce<SummaryMap>(
      (acc, item) => ({
        ...acc,
        [item.status.toLowerCase()]: item._count.id,
      }),
      { present: 0, absent: 0, late: 0, sick: 0, excused: 0 }
    );

    return {
      records: attendances,
      summary: summaryMap,
      total: Object.values(summaryMap).reduce((a, b) => a + b, 0),
    };
  }

  async getChildWeeklyProgress(
    parentId: string,
    studentId: string,
    query: { weekStart?: string } = {}
  ) {
    await this.verifyParentAccess(parentId, studentId);

    const ref = query.weekStart ? new Date(query.weekStart) : new Date();
    const start = new Date(ref);
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const prevStart = new Date(start);
    prevStart.setDate(start.getDate() - 7);

    const [attendanceGroups, tahfidzRecords, weekGrades, prevGrades, rewards, violations] =
      await Promise.all([
        prisma.attendance.groupBy({
          by: ['status'],
          where: { studentId, date: { gte: start, lt: end } },
          _count: { id: true },
        }),
        prisma.tahfidzRecord.findMany({
          where: { studentId, recordedAt: { gte: start, lt: end } },
          select: { activityType: true, totalAyah: true, score: true },
        }),
        prisma.grade.findMany({
          where: { studentId, gradedAt: { gte: start, lt: end } },
          select: { percentage: true, score: true, maxScore: true },
        }),
        prisma.grade.findMany({
          where: { studentId, gradedAt: { gte: prevStart, lt: start } },
          select: { percentage: true, score: true, maxScore: true },
        }),
        prisma.reward.findMany({
          where: { studentId, givenAt: { gte: start, lt: end } },
          orderBy: { givenAt: 'desc' },
        }),
        prisma.violation.findMany({
          where: { studentId, occurredAt: { gte: start, lt: end } },
          orderBy: { occurredAt: 'desc' },
        }),
      ]);

    const att = { PRESENT: 0, ABSENT: 0, LATE: 0, SICK: 0, EXCUSED: 0 };
    for (const g of attendanceGroups) {
      att[g.status as keyof typeof att] = g._count.id;
    }

    let newMemorization = 0;
    let review = 0;
    const tahfidzScores: number[] = [];
    for (const r of tahfidzRecords) {
      if (r.activityType === 'ZIYADAH') newMemorization += r.totalAyah;
      else if (r.activityType === 'MUROJAAH') review += r.totalAyah;
      if (r.score != null) tahfidzScores.push(Number(r.score));
    }
    const tahfidzAvg =
      tahfidzScores.length > 0
        ? tahfidzScores.reduce((a, b) => a + b, 0) / tahfidzScores.length
        : null;
    const grade =
      tahfidzAvg == null
        ? '—'
        : tahfidzAvg >= 90
          ? 'Mumtaz'
          : tahfidzAvg >= 80
            ? 'Jayyid Jiddan'
            : tahfidzAvg >= 70
              ? 'Jayyid'
              : 'Maqbul';

    const pct = (g: { percentage: unknown; score: unknown; maxScore: unknown }) =>
      Number(
        g.percentage ??
          (g.maxScore ? (Number(g.score) / Number(g.maxScore)) * 100 : 0)
      );
    const avg = (arr: typeof weekGrades) =>
      arr.length > 0 ? arr.reduce((a, g) => a + pct(g), 0) / arr.length : null;
    const weekAvg = avg(weekGrades);
    const prevAvg = avg(prevGrades);
    let improvement = '';
    if (weekAvg != null && prevAvg != null) {
      const diff = weekAvg - prevAvg;
      improvement =
        Math.abs(diff) < 0.05
          ? 'Stabil dari minggu sebelumnya'
          : diff > 0
            ? `Naik ${diff.toFixed(1)} poin dari minggu sebelumnya`
            : `Turun ${Math.abs(diff).toFixed(1)} poin dari minggu sebelumnya`;
    }

    const weekLabel = `${start.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    })} – ${new Date(end.getTime() - 1).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;

    return {
      week: weekLabel,
      attendance: {
        present: att.PRESENT,
        absent: att.ABSENT,
        sick: att.SICK,
        permitted: att.EXCUSED,
      },
      tahfidz: { newMemorization, review, grade },
      behavior: {
        positive: rewards.length,
        negative: violations.length,
        notes: rewards[0]?.description || violations[0]?.description || '',
      },
      academic: {
        averageScore: weekAvg != null ? Math.round(weekAvg * 10) / 10 : 0,
        improvement,
      },
    };
  }

  async getChildTahfidz(
    parentId: string,
    studentId: string,
    query: {
      activityType?: string;
      page?: number;
      limit?: number;
    }
  ) {
    await this.verifyParentAccess(parentId, studentId);

    const page = query.page || 1;
    const limit = query.limit || 20;

    const where: Prisma.TahfidzRecordWhereInput = { studentId };
    if (query.activityType) {
      where.activityType =
        query.activityType as Prisma.TahfidzRecordWhereInput["activityType"];
    }

    const [records, total] = await Promise.all([
      prisma.tahfidzRecord.findMany({
        where,
        include: {
          recordedBy: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { recordedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tahfidzRecord.count({ where }),
    ]);

    const summaryByType = await prisma.tahfidzRecord.groupBy({
      by: ['activityType'],
      where: { studentId },
      _count: { id: true },
      _sum: { totalAyah: true },
    });

    const ziyadahRecords = await prisma.tahfidzRecord.findMany({
      where: {
        studentId,
        activityType: 'ZIYADAH',
      },
      select: { juz: true },
      distinct: ['juz'],
    });

    return {
      records,
      summary: {
        byType: summaryByType,
        totalJuzMemorized: ziyadahRecords.length,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getChildIbadah(
    parentId: string,
    studentId: string,
    query: {
      startDate: string;
      endDate: string;
    }
  ) {
    await this.verifyParentAccess(parentId, studentId);

    return getStudentIbadahStats({
      studentId,
      startDate: new Date(query.startDate),
      endDate: new Date(query.endDate),
    });
  }

  async getChildGrades(
    parentId: string,
    studentId: string,
    query: {
      academicYearId?: string;
      subjectId?: string;
    }
  ) {
    await this.verifyParentAccess(parentId, studentId);

    const where: Prisma.GradeWhereInput = { studentId };
    if (query.academicYearId) {
      where.academicYearId = query.academicYearId;
    }
    if (query.subjectId) {
      where.subjectId = query.subjectId;
    }

    const grades = await prisma.grade.findMany({
      where,
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            type: true,
            scheduledAt: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { gradedAt: 'desc' },
    });

    type SubjectGrades = {
      subject: (typeof grades)[0]['subject'];
      grades: typeof grades;
      averageScore: number;
    };

    const bySubject = grades.reduce<Record<string, SubjectGrades>>((acc, grade) => {
      const subjectId = grade.subject.id;
      if (!acc[subjectId]) {
        acc[subjectId] = {
          subject: grade.subject,
          grades: [],
          averageScore: 0,
        };
      }
      acc[subjectId].grades.push(grade);
      return acc;
    }, {});

    Object.values(bySubject).forEach((subjectGrades) => {
      const scores = subjectGrades.grades.map((g) =>
        Number(g.percentage || (Number(g.score) / Number(g.maxScore)) * 100)
      );
      subjectGrades.averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    });

    return {
      grades,
      bySubject: Object.values(bySubject),
    };
  }

  async getChildReportCards(parentId: string, studentId: string) {
    await this.verifyParentAccess(parentId, studentId);

    const reportCards = await prisma.reportCard.findMany({
      where: {
        studentId,
        isPublished: true,
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
        details: {
          orderBy: { subjectName: 'asc' },
        },
      },
      orderBy: [{ academicYear: { name: 'desc' } }, { semester: 'desc' }],
    });

    return reportCards;
  }

  async getChildFinance(parentId: string, studentId: string) {
    await this.verifyParentAccess(parentId, studentId);

    const invoices = await prisma.invoice.findMany({
      where: { studentId },
      include: {
        paymentType: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
        },
      },
      orderBy: { dueDate: 'desc' },
    });

    const summary = {
      totalInvoices: invoices.length,
      totalAmount: invoices.reduce((sum, inv) => sum + Number(inv.amount), 0),
      totalPaid: invoices.reduce((sum, inv) => sum + Number(inv.paidAmount), 0),
      totalOutstanding: 0,
      pendingCount: 0,
      overdueCount: 0,
    };

    summary.totalOutstanding = summary.totalAmount - summary.totalPaid;
    summary.pendingCount = invoices.filter(
      (inv) => inv.status === 'PENDING' || inv.status === 'PARTIAL'
    ).length;
    summary.overdueCount = invoices.filter((inv) => inv.status === 'OVERDUE').length;

    return {
      invoices,
      summary,
    };
  }

  async getChildCounseling(parentId: string, studentId: string) {
    await this.verifyParentAccess(parentId, studentId);

    const sessions = await prisma.counselingSession.findMany({
      where: {
        studentId,
        OR: [{ parentNotified: true }, { isConfidential: false }],
      },
      orderBy: { scheduledAt: 'desc' },
      take: 30,
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        summary: true,
        recommendations: true,
        counselor: {
          select: { user: { select: { name: true } } },
        },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      scheduledAt: session.scheduledAt,
      status: session.status,
      summary: session.summary,
      recommendations: session.recommendations,
      counselorName: session.counselor?.user?.name ?? null,
    }));
  }

  async getChildViolations(parentId: string, studentId: string) {
    await this.verifyParentAccess(parentId, studentId);

    const violations = await prisma.violation.findMany({
      where: { studentId },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    });

    const summary = await prisma.violation.aggregate({
      where: { studentId },
      _sum: { points: true },
      _count: { id: true },
    });

    const byType = await prisma.violation.groupBy({
      by: ['type'],
      where: { studentId },
      _count: { id: true },
      _sum: { points: true },
    });

    return {
      violations,
      summary: {
        totalViolations: summary._count.id,
        totalPoints: summary._sum.points || 0,
        byType,
      },
    };
  }

  async getChildRewards(parentId: string, studentId: string) {
    await this.verifyParentAccess(parentId, studentId);

    const rewards = await prisma.reward.findMany({
      where: { studentId },
      orderBy: { givenAt: 'desc' },
      take: 50,
    });

    const summary = await prisma.reward.aggregate({
      where: { studentId },
      _sum: { points: true },
      _count: { id: true },
    });

    const byCategory = await prisma.reward.groupBy({
      by: ['category'],
      where: { studentId },
      _count: { id: true },
      _sum: { points: true },
    });

    return {
      rewards,
      summary: {
        totalRewards: summary._count.id,
        totalPoints: summary._sum.points || 0,
        byCategory,
      },
    };
  }

  async getChildHealth(parentId: string, studentId: string) {
    await this.verifyParentAccess(parentId, studentId);

    const records = await prisma.medicalRecord.findMany({
      where: { studentId },
      include: {
        recordedBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { visitDate: 'desc' },
      take: 20,
    });

    const summary = await prisma.medicalRecord.groupBy({
      by: ['type'],
      where: { studentId },
      _count: { id: true },
    });

    return {
      records,
      summary,
    };
  }

  async getChildPermits(parentId: string, studentId: string) {
    await this.verifyParentAccess(parentId, studentId);

    const permits = await prisma.permit.findMany({
      where: { studentId },
      include: {
        approvedBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return permits;
  }

  async createPermitRequest(
    parentId: string,
    studentId: string,
    data: {
      type: string;
      reason: string;
      destination?: string;
      startDate: string;
      endDate: string;
    }
  ) {
    await this.verifyParentAccess(parentId, studentId);

    const permit = await prisma.permit.create({
      data: {
        studentId,
        type: data.type as any,
        reason: data.reason,
        destination: data.destination,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: 'PENDING',
      },
    });

    return permit;
  }

  async getAnnouncements(parentId: string) {
    const children = await prisma.studentParent.findMany({
      where: { parentId },
      include: {
        student: {
          select: { unitId: true },
        },
      },
    });

    const unitIds = [...new Set(children.map((c) => c.student.unitId))];

    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        AND: [
          {
            OR: [
              { unitId: null },
              { unitId: { in: unitIds } },
            ],
          },
          { targetRoles: { has: 'PARENT' } },
          {
            OR: [{ publishedAt: { lte: now } }, { publishedAt: null }],
          },
          {
            OR: [{ expiresAt: { gte: now } }, { expiresAt: null }],
          },
        ],
      },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
      take: 20,
    });

    return announcements;
  }

  async getNotifications(
    parentId: string,
    query: { status?: string; page?: number; limit?: number }
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const where: Prisma.NotificationWhereInput = { userId: parentId };
    if (query.status) {
      where.status = query.status as Prisma.NotificationWhereInput["status"];
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: parentId, status: 'UNREAD' },
      }),
    ]);

    return {
      notifications,
      unreadCount,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markNotificationRead(parentId: string, notificationId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: parentId },
    });

    if (!notification) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Notifikasi tidak ditemukan');
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });
  }

  async getDashboardSummary(parentId: string) {
    const children = await this.getChildren(parentId);
    const childrenIds = children.map((c) => c.id);

    if (childrenIds.length === 0) {
      const unreadNotifications = await prisma.notification.count({
        where: { userId: parentId, status: 'UNREAD' },
      });

      return {
        children: [],
        unreadNotifications,
        recentAnnouncements: [],
      };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allAttendances = await prisma.attendance.findMany({
      where: {
        studentId: { in: childrenIds },
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: 'desc' },
    });

    const pendingInvoices = await prisma.invoice.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: childrenIds },
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      },
      _count: { id: true },
    });

    const activePermits = await prisma.permit.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: childrenIds },
        status: { in: ['PENDING', 'APPROVED'] },
        endDate: { gte: new Date() },
      },
      _count: { id: true },
    });

    const lastTahfidzRecords = await prisma.tahfidzRecord.findMany({
      where: {
        studentId: { in: childrenIds },
      },
      distinct: ['studentId'],
      orderBy: [{ studentId: 'asc' }, { recordedAt: 'desc' }],
    });

    const unitIds = [...new Set(children.map((c) => c.unitId))];
    const activeYears = await prisma.academicYear.findMany({
      where: { isActive: true },
    });

    const roomAssignments = await prisma.roomAssignment.findMany({
      where: { studentId: { in: childrenIds }, isActive: true },
      select: { studentId: true, roomId: true },
    });

    const activeYearIds = activeYears.map((ay) => ay.id);
    const studentGradeScores = await prisma.grade.groupBy({
      by: ['studentId'],
      where: { studentId: { in: childrenIds }, academicYearId: { in: activeYearIds } },
      _avg: { percentage: true },
    });

    const studentViolationPoints = await prisma.violation.groupBy({
      by: ['studentId'],
      where: { studentId: { in: childrenIds } },
      _sum: { points: true },
    });

    const uniqueRoomIds = [...new Set(roomAssignments.map((ra) => ra.roomId))];
    const roomAnalyticsEntries = await Promise.all(
      uniqueRoomIds.map(async (roomId) => {
        const analytics = await DormitoryService.getRoomSocialAnalytics(roomId);
        return [roomId, analytics] as const;
      })
    );
    const roomAnalyticsMap = new Map(roomAnalyticsEntries);

    const summary = children.map((child) => {
      const recentAttendance = allAttendances.filter((a) => a.studentId === child.id).slice(0, 7);
      const pendingInvoiceCount =
        pendingInvoices.find((p) => p.studentId === child.id)?._count.id || 0;
      const activePermitCount = activePermits.find((p) => p.studentId === child.id)?._count.id || 0;
      const lastTahfidz = lastTahfidzRecords.find((t) => t.studentId === child.id);

      const gradeAvg = studentGradeScores.find((g) => g.studentId === child.id)?._avg.percentage;
      const violationPts = Number(
        studentViolationPoints.find((v) => v.studentId === child.id)?._sum.points || 0
      );
      const academicScore = gradeAvg != null ? Number(gradeAvg) : null;
      const behaviorScore = Math.max(0, 100 - violationPts);
      const maxJuz = lastTahfidz?.juz || 0;
      const tahfidzScore = maxJuz > 0 ? Math.min(100, (maxJuz / 30) * 100) : null;
      const holisticDims = [academicScore, tahfidzScore, behaviorScore].filter(
        (d): d is number => d !== null
      );
      const holisticScore =
        holisticDims.length > 0
          ? holisticDims.reduce((sum, d) => sum + d, 0) / holisticDims.length
          : null;

      const assignment = roomAssignments.find((ra) => ra.studentId === child.id);
      const boardingHarmony = assignment ? (roomAnalyticsMap.get(assignment.roomId) ?? null) : null;

      return {
        child,
        recentAttendance,
        pendingInvoices: pendingInvoiceCount,
        activePermits: activePermitCount,
        lastTahfidz: lastTahfidz || null,
        holisticScore: holisticScore !== null ? Math.round(holisticScore * 10) / 10 : null,
        holisticInterpretation: null,
        boardingHarmonyScore: boardingHarmony?.harmonyScore ?? null,
      };
    });

    const unreadNotifications = await prisma.notification.count({
      where: { userId: parentId, status: 'UNREAD' },
    });

    const recentAnnouncements = await prisma.announcement.findMany({
      where: {
        OR: [{ unitId: null }, { unitId: { in: unitIds } }],
        targetRoles: { has: 'PARENT' },
      },
      orderBy: { publishedAt: 'desc' },
      take: 5,
    });

    return {
      children: summary,
      unreadNotifications,
      recentAnnouncements,
    };
  }
}

export const parentService = new ParentService();
