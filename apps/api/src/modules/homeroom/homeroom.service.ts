import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { UserRole, Prisma, ViolationType } from '@prisma/client';
import { seesAllUnits } from '@/utils/resolve-unit-id';

// User type from JwtPayload
interface AuthenticatedUser {
  sub: string;
  role: string;
  /**
   * RoleCode granular. Wajib ada agar scoping bisa memakai seesAllUnits():
   * `role` legacy memetakan setiap YAYASAN_* menjadi 'UNIT_ADMIN', sehingga
   * pemeriksaan yang ditulis atas `role` menggolongkan pengurus yayasan
   * sebagai admin unit — itulah yang menyembunyikan datanya.
   */
  roleCode?: string | null;
  unitId: string | null;
}

export class HomeroomService {
  /**
   * Get classes where user is homeroom teacher
   */
  async getMyClasses(currentUser: AuthenticatedUser) {
    const unitIdFilter = currentUser.role === UserRole.SUPER_ADMIN ? undefined : currentUser.unitId;

    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: currentUser.sub,
        deletedAt: null,
        ...(unitIdFilter ? { unitId: unitIdFilter } : {}),
      },
    });

    if (!teacher) {
      return [];
    }

    const classes = await prisma.class.findMany({
      where: {
        homeroomTeacherId: teacher.id,
        deletedAt: null,
      },
      include: {
        unit: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true, isActive: true } },
        _count: { select: { enrollments: { where: { status: 'active' } } } },
      },
      orderBy: [{ academicYear: { name: 'desc' } }, { name: 'asc' }],
    });

    return classes;
  }

  /**
   * Get class dashboard
   */
  async getClassDashboard(classId: string, currentUser: AuthenticatedUser) {
    const classForAccess = await prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
      select: { id: true, unitId: true },
    });

    if (!classForAccess) throw Errors.notFound('Class not found');
    if (currentUser.role !== UserRole.SUPER_ADMIN && classForAccess.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    const classData = await prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
      include: {
        unit: true,
        academicYear: true,
        homeroomTeacher: {
          include: { user: { select: { name: true, email: true } } },
        },
        enrollments: {
          where: { status: 'active' },
          include: {
            student: {
              include: {
                user: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!classData) {
      throw Errors.notFound('Class not found');
    }

    const studentIds = classData.enrollments.map((e) => e.studentId);

    // 1. Attendance Summary (Current Month)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const attendanceSummary = await prisma.attendance.groupBy({
      by: ['status'],
      where: {
        classId,
        date: { gte: monthStart, lte: monthEnd },
      },
      _count: { status: true },
    });

    const totalAttendance = attendanceSummary.reduce((acc, curr) => acc + curr._count.status, 0);
    const presentCount = attendanceSummary.find((s) => s.status === 'PRESENT')?._count.status || 0;
    const averageAttendance =
      totalAttendance > 0 ? Number(((presentCount / totalAttendance) * 100).toFixed(1)) : 0;

    // 2. Academic Score Average (Current Academic Year)
    const grades = await prisma.grade.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId: classData.academicYearId,
      },
      select: { score: true },
    });

    const totalScore = grades.reduce((acc, curr) => acc + Number(curr.score), 0);
    const averageAcademicScore =
      grades.length > 0 ? Number((totalScore / grades.length).toFixed(1)) : 0;

    // 3. Recent Violations & Pending Notes
    const recentViolations = await prisma.violation.findMany({
      where: { studentId: { in: studentIds } },
      include: {
        student: { include: { user: { select: { name: true } } } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 5,
    });

    const pendingBehaviorNotes = await prisma.violation.count({
      where: {
        studentId: { in: studentIds },
        OR: [{ action: null }, { action: '' }],
      },
    });

    // 4. Recent Achievements (Rewards + Tahfidz Assessment)
    const recentRewards = await prisma.reward.findMany({
      where: { studentId: { in: studentIds } },
      include: {
        student: { include: { user: { select: { name: true } } } },
      },
      orderBy: { givenAt: 'desc' },
      take: 5,
    });

    const recentTahfidz = await prisma.tahfidzRecord.findMany({
      where: {
        studentId: { in: studentIds },
        activityType: 'ASSESSMENT', // Only milestones
      },
      include: {
        student: { include: { user: { select: { name: true } } } },
      },
      orderBy: { recordedAt: 'desc' },
      take: 5,
    });

    // Combine and sort achievements
    const recentAchievements = [
      ...recentRewards.map((r) => ({
        id: r.id,
        type: 'REWARD',
        student: r.student,
        category: r.category,
        description: r.description,
        date: r.givenAt,
        points: r.points,
      })),
      ...recentTahfidz.map((t) => ({
        id: t.id,
        type: 'TAHFIDZ',
        student: t.student,
        category: 'Tahfidz',
        description: `Hafalan Surat ${t.surahName} (Juz ${t.juz})`,
        date: t.recordedAt,
        points: t.score, // Use score as points for display
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5);

    // 5. Upcoming Birthdays (Next 30 days)
    // Fetch all students birthdates and filter in memory
    const studentsWithBirthdays = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        birthDate: { not: undefined }, // Ensure birthDate exists
      },
      select: {
        id: true,
        nisn: true, nik: true,
        birthDate: true,
        user: { select: { name: true } },
      },
    });

    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const upcomingBirthdays = studentsWithBirthdays
      .map((student) => {
        const dob = new Date(student.birthDate);
        // Set current year to check upcoming
        const nextBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());

        // If birthday has passed this year, check next year (though usually we only care about 'soon')
        // For simple "upcoming in next 30 days", we handle year wrap around
        if (nextBirthday < today) {
          nextBirthday.setFullYear(today.getFullYear() + 1);
        }

        const diffTime = nextBirthday.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return {
          student: {
            id: student.id,
            name: student.user.name,
            nisn: student.nisn || student.nik || "-",
          },
          date: dob,
          daysUntil: diffDays,
        };
      })
      .filter((item) => item.daysUntil >= 0 && item.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    return {
      class: classData,
      studentCount: classData.enrollments.length,
      students: classData.enrollments.map((e) => e.student),
      attendanceSummary: attendanceSummary.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
      dashboardSummary: {
        averageAttendance,
        averageAcademicScore,
        pendingBehaviorNotes,
        recentViolations,
        recentAchievements,
        upcomingBirthdays,
      },
    };
  }

  /**
   * Get students in homeroom class
   */
  async getHomeroomStudents(classId: string, currentUser: AuthenticatedUser) {
    const classData = await prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
    });

    if (!classData) {
      throw Errors.notFound('Class not found');
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN && classData.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId, status: 'active' },
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
      orderBy: { student: { user: { name: 'asc' } } },
    });

    return enrollments.map((e: { student: unknown }) => e.student);
  }

  /**
   * Get attendance summary for class
   */
  async getAttendanceSummary(
    classId: string,
    startDate: string,
    endDate: string,
    currentUser: AuthenticatedUser
  ) {
    const classData = await prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
    });

    if (!classData) {
      throw Errors.notFound('Class not found');
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN && classData.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    const summary = await prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        classId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      _count: { status: true },
    });

    return summary;
  }

  /**
   * Get academic monitoring
   */
  async getAcademicMonitoring(classId: string, currentUser: AuthenticatedUser) {
    const classForAccess = await prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
      select: { id: true, unitId: true },
    });

    if (!classForAccess) throw Errors.notFound('Class not found');
    if (currentUser.role !== UserRole.SUPER_ADMIN && classForAccess.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    const classData = await prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
      include: {
        enrollments: {
          where: { status: 'active' },
          include: {
            student: {
              include: {
                user: { select: { name: true } },
                tahfidzRecords: {
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!classData) {
      throw Errors.notFound('Class not found');
    }

    return {
      classId,
      students: classData.enrollments.map((e) => ({
        id: e.student.id,
        name: e.student.user.name,
        latestTahfidz: e.student.tahfidzRecords[0] || null,
      })),
    };
  }

  /**
   * Get student detail
   */
  async getStudentDetail(studentId: string, currentUser: AuthenticatedUser) {
    const studentForAccess = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, unitId: true },
    });

    if (!studentForAccess) throw Errors.notFound('Student not found');
    if (
      currentUser.role !== UserRole.SUPER_ADMIN &&
      studentForAccess.unitId !== currentUser.unitId
    ) {
      throw Errors.forbidden('Access denied');
    }

    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      include: {
        user: true,
        unit: { select: { id: true, name: true } },
        enrollments: {
          where: { status: 'active' },
          include: { class: { select: { id: true, name: true } } },
        },
        tahfidzRecords: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        attendances: {
          take: 30,
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!student) {
      throw Errors.notFound('Student not found');
    }

    return student;
  }

  /**
   * Get student notes - using violations/rewards as notes system
   */
  async getStudentNotes(studentId: string, currentUser: AuthenticatedUser) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });

    if (!student) {
      throw Errors.notFound('Student not found');
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN && student.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    // Use violations as behavior notes
    const violations = await prisma.violation.findMany({
      where: { studentId },
      orderBy: { occurredAt: 'desc' },
      take: 20,
    });

    const rewards = await prisma.reward.findMany({
      where: { studentId },
      orderBy: { givenAt: 'desc' },
      take: 20,
    });

    return {
      violations,
      rewards,
    };
  }

  /**
   * Create student note - using violation/reward system
   */
  async createStudentNote(
    input: {
      studentId: string;
      type: 'POSITIVE' | 'NEGATIVE';
      title: string;
      description?: string;
      category?: string;
    },
    currentUser: AuthenticatedUser
  ) {
    const student = await prisma.student.findFirst({
      where: { id: input.studentId, deletedAt: null },
    });

    if (!student) {
      throw Errors.notFound('Student not found');
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN && student.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    if (input.type === 'POSITIVE') {
      const reward = await prisma.reward.create({
        data: {
          studentId: input.studentId,
          category: input.category || 'general',
          description: input.description || input.title,
          points: 0,
          givenById: currentUser.sub,
          givenAt: new Date(),
        },
      });
      return { type: 'reward', data: reward };
    } else {
      const violation = await prisma.violation.create({
        data: {
          studentId: input.studentId,
          type: ViolationType.MINOR,
          category: input.category || 'general',
          description: input.description || input.title,
          points: 0,
          reportedById: currentUser.sub,
          occurredAt: new Date(),
        },
      });
      return { type: 'violation', data: violation };
    }
  }

  /**
   * Update student note
   */
  async updateStudentNote(
    noteId: string,
    input: { description?: string; category?: string },
    noteType: 'violation' | 'reward',
    currentUser: AuthenticatedUser
  ) {
    if (noteType === 'violation') {
      const violation = await prisma.violation.findUnique({
        where: { id: noteId },
        include: { student: true },
      });

      if (!violation) {
        throw Errors.notFound('Note not found');
      }

      if (
        currentUser.role !== UserRole.SUPER_ADMIN &&
        violation.student.unitId !== currentUser.unitId
      ) {
        throw Errors.forbidden('Access denied');
      }

      const updateData: { description?: string; category?: string } = {};
      if (input.description) updateData.description = input.description;
      if (input.category) updateData.category = input.category;

      return prisma.violation.update({
        where: { id: noteId },
        data: updateData,
      });
    } else {
      const reward = await prisma.reward.findUnique({
        where: { id: noteId },
        include: { student: true },
      });

      if (!reward) {
        throw Errors.notFound('Note not found');
      }

      if (
        currentUser.role !== UserRole.SUPER_ADMIN &&
        reward.student.unitId !== currentUser.unitId
      ) {
        throw Errors.forbidden('Access denied');
      }

      const rewardUpdateData: { description?: string; category?: string } = {};
      if (input.description) rewardUpdateData.description = input.description;
      if (input.category) rewardUpdateData.category = input.category;

      return prisma.reward.update({
        where: { id: noteId },
        data: rewardUpdateData,
      });
    }
  }

  /**
   * Delete student note
   */
  async deleteStudentNote(
    noteId: string,
    noteType: 'violation' | 'reward',
    currentUser: AuthenticatedUser
  ) {
    if (noteType === 'violation') {
      const violation = await prisma.violation.findUnique({
        where: { id: noteId },
        include: { student: { select: { unitId: true } } },
      });

      if (!violation) throw Errors.notFound('Note not found');
      if (
        currentUser.role !== UserRole.SUPER_ADMIN &&
        violation.student.unitId !== currentUser.unitId
      ) {
        throw Errors.forbidden('Access denied');
      }

      await prisma.violation.delete({ where: { id: noteId } });
    } else {
      const reward = await prisma.reward.findUnique({
        where: { id: noteId },
        include: { student: { select: { unitId: true } } },
      });

      if (!reward) throw Errors.notFound('Note not found');
      if (
        currentUser.role !== UserRole.SUPER_ADMIN &&
        reward.student.unitId !== currentUser.unitId
      ) {
        throw Errors.forbidden('Access denied');
      }

      await prisma.reward.delete({ where: { id: noteId } });
    }
    return { success: true };
  }

  /**
   * Get behavior records
   */
  async getBehaviorRecords(classId: string, currentUser: AuthenticatedUser) {
    const classData = await prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
    });

    if (!classData) {
      throw Errors.notFound('Class not found');
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN && classData.unitId !== currentUser.unitId) {
      throw Errors.forbidden('Access denied');
    }

    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId, status: 'active' },
      select: { studentId: true },
    });

    const studentIds = enrollments.map((e: { studentId: string }) => e.studentId);

    const [violations, rewards] = await Promise.all([
      prisma.violation.findMany({
        where: { studentId: { in: studentIds } },
        include: { student: { include: { user: { select: { name: true } } } } },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
      prisma.reward.findMany({
        where: { studentId: { in: studentIds } },
        include: { student: { include: { user: { select: { name: true } } } } },
        orderBy: { givenAt: 'desc' },
        take: 50,
      }),
    ]);

    return { violations, rewards };
  }

  /**
   * Record behavior
   */
  /**
   * Cross-class homeroom (wali kelas) performance overview.
   * Composite of measurable signals only: attendance quality + recording
   * discipline (30d), academic average (90d), tahfidz activity (30d) and
   * behavior balance. Unit-scoped for non-super-admins.
   */
  async getPerformanceOverview(currentUser: AuthenticatedUser, unitId?: string) {
    const effectiveUnitId = seesAllUnits(currentUser)
      ? unitId
      : (currentUser.unitId ?? 'none');

    const classes = await prisma.class.findMany({
      where: {
        deletedAt: null,
        homeroomTeacherId: { not: null },
        academicYear: { isActive: true },
        ...(effectiveUnitId ? { unitId: effectiveUnitId } : {}),
      },
      select: {
        id: true,
        name: true,
        unit: { select: { name: true } },
        homeroomTeacher: {
          select: { id: true, user: { select: { name: true } } },
        },
        enrollments: {
          where: { status: 'active' },
          select: { studentId: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (classes.length === 0) return { items: [], averageScore: 0 };

    const classIds = classes.map((c) => c.id);
    const studentToClass = new Map<string, string>();
    for (const cls of classes) {
      for (const enrollment of cls.enrollments) {
        studentToClass.set(enrollment.studentId, cls.id);
      }
    }
    const studentIds = [...studentToClass.keys()];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [attendanceByStatus, attendanceDays, gradeByStudent, tahfidzByStudent, violationByStudent, rewardByStudent] =
      await Promise.all([
        prisma.attendance.groupBy({
          by: ['classId', 'status'],
          where: { classId: { in: classIds }, date: { gte: thirtyDaysAgo } },
          _count: { id: true },
        }),
        prisma.attendance.groupBy({
          by: ['classId', 'date'],
          where: { classId: { in: classIds }, date: { gte: thirtyDaysAgo } },
          _count: { id: true },
        }),
        prisma.grade.groupBy({
          by: ['studentId'],
          where: { studentId: { in: studentIds }, gradedAt: { gte: ninetyDaysAgo } },
          _avg: { percentage: true },
        }),
        prisma.tahfidzRecord.groupBy({
          by: ['studentId'],
          where: { studentId: { in: studentIds }, recordedAt: { gte: thirtyDaysAgo } },
          _count: { id: true },
        }),
        prisma.violation.groupBy({
          by: ['studentId'],
          where: { studentId: { in: studentIds }, occurredAt: { gte: thirtyDaysAgo } },
          _count: { id: true },
        }),
        prisma.reward.groupBy({
          by: ['studentId'],
          where: { studentId: { in: studentIds }, givenAt: { gte: thirtyDaysAgo } },
          _count: { id: true },
        }),
      ]);

    // Weekdays in the last 30 days = expected school days for recording discipline
    let weekdays = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = d.getDay();
      if (day !== 0 && day !== 6) weekdays++;
    }

    const perClass = new Map<
      string,
      {
        present: number;
        totalAttendance: number;
        recordedDays: number;
        gradeSum: number;
        gradeCount: number;
        tahfidzCount: number;
        violations: number;
        rewards: number;
      }
    >();
    const bucket = (classId: string) => {
      let entry = perClass.get(classId);
      if (!entry) {
        entry = {
          present: 0,
          totalAttendance: 0,
          recordedDays: 0,
          gradeSum: 0,
          gradeCount: 0,
          tahfidzCount: 0,
          violations: 0,
          rewards: 0,
        };
        perClass.set(classId, entry);
      }
      return entry;
    };

    for (const row of attendanceByStatus) {
      const entry = bucket(row.classId);
      entry.totalAttendance += row._count.id;
      if (row.status === 'PRESENT') entry.present += row._count.id;
    }
    for (const row of attendanceDays) {
      bucket(row.classId).recordedDays++;
    }
    for (const row of gradeByStudent) {
      const classId = studentToClass.get(row.studentId);
      if (!classId || row._avg.percentage === null) continue;
      const entry = bucket(classId);
      entry.gradeSum += Number(row._avg.percentage);
      entry.gradeCount++;
    }
    for (const row of tahfidzByStudent) {
      const classId = studentToClass.get(row.studentId);
      if (classId) bucket(classId).tahfidzCount += row._count.id;
    }
    for (const row of violationByStudent) {
      const classId = studentToClass.get(row.studentId);
      if (classId) bucket(classId).violations += row._count.id;
    }
    for (const row of rewardByStudent) {
      const classId = studentToClass.get(row.studentId);
      if (classId) bucket(classId).rewards += row._count.id;
    }

    const round1 = (v: number) => Math.round(v * 10) / 10;
    const items = classes.map((cls) => {
      const stats = perClass.get(cls.id);
      const studentCount = cls.enrollments.length;

      const attendanceRate =
        stats && stats.totalAttendance > 0 ? (stats.present / stats.totalAttendance) * 100 : 0;
      const recordingDiscipline =
        stats && weekdays > 0 ? Math.min((stats.recordedDays / weekdays) * 100, 100) : 0;
      const academicAverage =
        stats && stats.gradeCount > 0 ? stats.gradeSum / stats.gradeCount : 0;
      const tahfidzActivityPerStudent =
        stats && studentCount > 0 ? stats.tahfidzCount / studentCount : 0;
      const behaviorBalance = stats ? stats.rewards - stats.violations : 0;

      // Tahfidz component: ~20 records/student/month counts as full marks
      const tahfidzScore = Math.min(tahfidzActivityPerStudent / 20, 1) * 100;
      const overallScore = round1(
        attendanceRate * 0.35 +
          recordingDiscipline * 0.15 +
          academicAverage * 0.3 +
          tahfidzScore * 0.2
      );

      return {
        classId: cls.id,
        className: cls.name,
        unitName: cls.unit.name,
        teacherId: cls.homeroomTeacher!.id,
        teacherName: cls.homeroomTeacher!.user.name,
        studentCount,
        metrics: {
          attendanceRate: round1(attendanceRate),
          recordingDiscipline: round1(recordingDiscipline),
          academicAverage: round1(academicAverage),
          tahfidzActivityPerStudent: round1(tahfidzActivityPerStudent),
          behaviorBalance,
        },
        overallScore,
      };
    });

    const averageScore =
      items.length > 0
        ? round1(items.reduce((sum, item) => sum + item.overallScore, 0) / items.length)
        : 0;

    return { items, averageScore };
  }

  async recordBehavior(
    input: {
      studentId: string;
      type: 'POSITIVE' | 'NEGATIVE';
      title: string;
      description?: string;
      category?: string;
      points?: number;
    },
    currentUser: AuthenticatedUser
  ) {
    return this.createStudentNote(
      {
        studentId: input.studentId,
        type: input.type,
        title: input.title,
        description: input.description,
        category: input.category,
      },
      currentUser
    );
  }
}

export const homeroomService = new HomeroomService();
