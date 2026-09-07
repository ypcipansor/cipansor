import { prisma } from '@/lib/prisma';
import { Prisma, DailyMood, MealConsumption, UnitType, TahfidzActivityType } from '@prisma/client';
import { whatsAppService } from '../notifications';
import { logger } from '@/lib/logger';
import type {
  ListDailyReportsQuery,
  StudentDailySummaryQuery,
  ClassDailySummaryQuery,
} from './daily-report.schema';
import type {
  CreateDailyReportInput,
  UpdateDailyReportInput,
  BulkCreateDailyReportsInput,
} from '@cipansor/shared';

// Helper interface for validation since schema types might not be exported from shared yet or match perfectly
interface ConfirmReportInput {
  isConfirmed: boolean;
  parentFeedback?: string;
}

interface AuthContext {
  role: string;
  unitId?: string | null;
}

// ============================================
// Daily Report Service
// Using DailyStudentReport model
// ============================================

export const dailyReportService = {
  // ============================================
  // LIST & READ
  // ============================================

  async findAll(query: Partial<ListDailyReportsQuery>, context: AuthContext) {
    const {
      page = 1,
      limit = 20,
      studentId,
      unitId,
      academicYearId,
      dateFrom,
      dateTo,
      date,
      mood,
      isConfirmedByParent,
      search,
    } = query;

    const where: Prisma.DailyStudentReportWhereInput = {};

    // Filter by student
    if (studentId) where.studentId = studentId;

    // Filter by unit (use context if not admin)
    if (context.role !== 'SUPERADMIN' && context.role !== 'ADMIN' && context.unitId) {
      where.unitId = context.unitId;
    } else if (unitId) {
      where.unitId = unitId;
    }

    // Filter by academic year
    if (academicYearId) where.academicYearId = academicYearId;

    // Date filters
    if (date) {
      const reportDate = new Date(date);
      reportDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(reportDate);
      nextDay.setDate(nextDay.getDate() + 1);
      where.reportDate = { gte: reportDate, lt: nextDay };
    } else if (dateFrom || dateTo) {
      where.reportDate = {};
      if (dateFrom) where.reportDate.gte = new Date(dateFrom);
      if (dateTo) where.reportDate.lte = new Date(dateTo);
    }

    // Filter by mood
    if (mood) {
      where.mood = mood as DailyMood;
    }

    // Filter by parent read status (as confirmation)
    if (isConfirmedByParent !== undefined) {
      where.parentReadAt = isConfirmedByParent ? { not: null } : null;
    }

    // Search in notes
    if (search) {
      where.OR = [
        { activitiesSummary: { contains: search, mode: 'insensitive' } },
        { healthStatus: { contains: search, mode: 'insensitive' } },
        { teacherNotes: { contains: search, mode: 'insensitive' } },
        { student: { user: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [reports, total] = await Promise.all([
      prisma.dailyStudentReport.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              nisn: true,
              nik: true,
              user: { select: { id: true, name: true } },
            },
          },
          unit: { select: { id: true, name: true } },
          academicYear: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          photos: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.dailyStudentReport.count({ where }),
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
  },

  async findById(id: string) {
    const report = await prisma.dailyStudentReport.findUniqueOrThrow({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            nisn: true,
              nik: true,
            birthDate: true,
            user: { select: { id: true, name: true } },
            enrollments: {
              where: { status: 'active' },
              select: { classId: true },
              take: 1,
            },
          },
        },
        unit: { select: { id: true, name: true, type: true } },
        academicYear: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        photos: true,
        homework: true,
      },
    });

    return {
      ...report,
      student: {
        ...report.student,
        classId: report.student.enrollments[0]?.classId,
      },
    };
  },

  async findByStudentAndDate(studentId: string, date: Date) {
    const reportDate = new Date(date);
    reportDate.setHours(0, 0, 0, 0);

    return prisma.dailyStudentReport.findUnique({
      where: {
        studentId_reportDate: {
          studentId,
          reportDate,
        },
      },
    });
  },

  // ============================================
  // CREATE
  // ============================================

  async create(data: CreateDailyReportInput, userId: string) {
    // Get unit to determine unit type
    const unit = await prisma.unit.findUniqueOrThrow({
      where: { id: data.unitId },
      select: { type: true },
    });

    const reportDate = new Date(data.reportDate);
    reportDate.setHours(0, 0, 0, 0);

    // Check for existing report on same date
    const existingReport = await this.findByStudentAndDate(data.studentId, reportDate);
    if (existingReport) {
      throw new Error('Daily report already exists for this student on this date');
    }

    const report = await prisma.dailyStudentReport.create({
      data: {
        studentId: data.studentId,
        unitId: data.unitId,
        academicYearId: data.academicYearId,
        reportDate,
        unitType: unit.type as UnitType,
        mood: data.morningMood as DailyMood | undefined,
        healthStatus: data.healthNotes,
        temperature: data.temperature,
        hadBreakfast:
          data.breakfastConsumption === 'HABIS' || data.breakfastConsumption === 'SETENGAH',
        mealStatus: data.lunchConsumption as MealConsumption | undefined,
        snackStatus: data.snackConsumption as MealConsumption | undefined,
        napDuration: data.napDurationMinutes,
        toiletNotes: data.toiletingNotes,
        sholatDhuha: data.sholatDhuha,
        sholatDzuhur: data.sholatDzuhur,
        sholatAshar: data.sholatAshar,
        sholatJamaah: data.sholatJamaah,
        activitiesSummary: data.activitiesSummary,
        achievements: data.learningAchievements,
        tahfidzActivity: data.surahPractice,
        behaviorNotes: data.behaviorNotes,
        teacherNotes: data.parentNotes,
        homeActivity: data.homeworkSuggestion,
        createdById: userId,
        photos:
          data.photoUrls && data.photoUrls.length > 0
            ? {
                create: data.photoUrls.map((url) => ({
                  photoUrl: url,
                  caption: '',
                })),
              }
            : undefined,
        homework:
          data.homework && data.homework.length > 0
            ? {
                create: data.homework.map((hw) => ({
                  subjectName: hw.subjectName,
                  description: hw.description,
                  dueDate: hw.dueDate ? new Date(hw.dueDate) : null,
                })),
              }
            : undefined,
      },
      include: {
        student: { select: { id: true, user: { select: { name: true } } } },
        unit: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        photos: true,
      },
    });

    // Send WhatsApp notification
    try {
      const studentData = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: { parentName: true, parentPhone: true },
      });

      if (studentData?.parentPhone) {
        whatsAppService
          .sendDailyReportNotification({
            parentPhone: studentData.parentPhone,
            parentName: studentData.parentName || 'Orang Tua',
            studentName: report.student.user.name,
            date: reportDate,
            mood: data.morningMood,
            healthStatus: data.healthNotes,
          })
          .catch((err) => logger.error(`Failed to send WA notification: ${err}`));
      }
    } catch (err) {
      logger.error(`Error in daily report notification trigger: ${err}`);
    }

    return report;
  },

  async bulkCreate(data: BulkCreateDailyReportsInput, userId: string) {
    const reportDate = new Date(data.reportDate);
    reportDate.setHours(0, 0, 0, 0);

    // Get unit type
    const unit = await prisma.unit.findUniqueOrThrow({
      where: { id: data.unitId },
      select: { type: true },
    });

    // Get teacher record for KitabProgress (userId is User.id, need Teacher.id)
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
      select: { id: true },
    });

    const studentIds = data.reports.map((r) => r.studentId);

    // 1. Batch fetch existing reports to identify duplicates
    const existingReports = await prisma.dailyStudentReport.findMany({
      where: {
        studentId: { in: studentIds },
        reportDate: reportDate,
      },
      select: { studentId: true },
    });
    const existingStudentIds = new Set(existingReports.map((r) => r.studentId));

    // 2. Batch fetch parent info for notifications
    const studentsInfo = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        parentName: true,
        parentPhone: true,
        user: { select: { name: true } },
      },
    });
    const studentInfoMap = new Map(studentsInfo.map((s) => [s.id, s]));

    const results: { success: string[]; failed: { studentId: string; error: string }[] } = {
      success: [],
      failed: [],
    };

    // 3. Separate valid and invalid reports
    const validReports: typeof data.reports = [];

    for (const report of data.reports) {
      if (existingStudentIds.has(report.studentId)) {
        results.failed.push({
          studentId: report.studentId,
          error: 'Report already exists for this date',
        });
        continue;
      }

      if (!studentInfoMap.has(report.studentId)) {
        results.failed.push({
          studentId: report.studentId,
          error: 'Student not found',
        });
        continue;
      }

      validReports.push(report);
    }

    // Check if reading progress is present but user is not a teacher
    const hasReadingProgress = validReports.some((r) => r.readingProgress);
    if (hasReadingProgress && !teacher) {
      throw new Error(
        'Cannot record reading progress: User is not a registered Teacher. Please contact administrator.'
      );
    }

    if (validReports.length > 0) {
      try {
        await prisma.dailyStudentReport.createMany({
          data: validReports.map((report) => ({
            studentId: report.studentId,
            unitId: data.unitId,
            academicYearId: data.academicYearId,
            reportDate,
            unitType: unit.type as UnitType,
            arrivalTime: report.arrivalTime,
            mood: report.morningMood as DailyMood | undefined,
            healthStatus: report.healthNotes,
            hadBreakfast:
              report.breakfastConsumption === 'HABIS' || report.breakfastConsumption === 'SETENGAH',
            mealStatus: report.lunchConsumption as MealConsumption | undefined,
            activitiesSummary: report.activitiesSummary,
            tahfidzActivity: report.ibadahNotes,
            teacherNotes: report.parentNotes,
            sholatDhuha: report.sholatDhuha,
            sholatDzuhur: report.sholatDzuhur,
            sholatAshar: report.sholatAshar,
            sholatJamaah: report.sholatJamaah,
            createdById: userId,
          })),
        });

        // Process related data (Kitab & Tahfidz)
        await Promise.all(
          validReports.map(async (report) => {
            // Update Reading Progress (Iqra/Kitab)
            if (report.readingProgress) {
              if (teacher) {
                try {
                  await prisma.kitabProgress.upsert({
                    where: {
                      kitabId_studentId_academicYearId: {
                        kitabId: report.readingProgress.bookId,
                        studentId: report.studentId,
                        academicYearId: data.academicYearId,
                      },
                    },
                    update: {
                      currentPage: report.readingProgress.page,
                      teacherId: teacher.id,
                    },
                    create: {
                      kitabId: report.readingProgress.bookId,
                      studentId: report.studentId,
                      academicYearId: data.academicYearId,
                      teacherId: teacher.id,
                      currentPage: report.readingProgress.page,
                    },
                  });
                } catch (err) {
                  logger.error(`Failed to update Reading Progress for ${report.studentId}: ${err}`);
                }
              } else {
                logger.warn(
                  `Skipped Reading Progress for ${report.studentId}: User ${userId} is not a Teacher`
                );
              }
            }

            // Create Tahfidz Record
            if (report.tahfidzProgress) {
              try {
                await prisma.tahfidzRecord.create({
                  data: {
                    studentId: report.studentId,
                    activityType: TahfidzActivityType.ZIYADAH,
                    surahNumber: report.tahfidzProgress.surahNumber,
                    surahName: report.tahfidzProgress.surahName,
                    ayahStart: report.tahfidzProgress.ayahStart,
                    ayahEnd: report.tahfidzProgress.ayahEnd,
                    juz: 30, // Default to 30 for TK, or calculate
                    totalAyah:
                      report.tahfidzProgress.ayahEnd - report.tahfidzProgress.ayahStart + 1,
                    recordedById: userId,
                    recordedAt: reportDate,
                  },
                });
              } catch (err) {
                logger.error(`Failed to create Tahfidz Record for ${report.studentId}: ${err}`);
              }
            }

            results.success.push(report.studentId);

            // Notifications
            const studentInfo = studentInfoMap.get(report.studentId);
            if (studentInfo?.parentPhone) {
              try {
                await whatsAppService.sendDailyReportNotification({
                  parentPhone: studentInfo.parentPhone,
                  parentName: studentInfo.parentName || 'Orang Tua',
                  studentName: studentInfo.user.name,
                  date: reportDate,
                  mood: report.morningMood,
                  healthStatus: report.healthNotes,
                });
              } catch (err) {
                logger.error(
                  `Failed to send WA notification in bulk for ${report.studentId}: ${err}`
                );
              }
            }
          })
        );
      } catch (error) {
        // If createMany fails, all validReports failed
        for (const report of validReports) {
          results.failed.push({
            studentId: report.studentId,
            error: error instanceof Error ? error.message : 'Batch creation failed',
          });
        }
      }
    }

    return {
      created: results.success.length,
      failed: results.failed.length,
      details: results,
    };
  },

  // ============================================
  // UPDATE
  // ============================================

  async update(id: string, data: UpdateDailyReportInput) {
    const report = await prisma.dailyStudentReport.update({
      where: { id },
      data: {
        mood: data.morningMood as DailyMood | undefined,
        healthStatus: data.healthNotes,
        temperature: data.temperature,
        hadBreakfast: data.breakfastConsumption
          ? data.breakfastConsumption === 'HABIS' || data.breakfastConsumption === 'SETENGAH'
          : undefined,
        mealStatus: data.lunchConsumption as MealConsumption | undefined,
        snackStatus: data.snackConsumption as MealConsumption | undefined,
        napDuration: data.napDurationMinutes,
        toiletNotes: data.toiletingNotes,
        sholatDhuha: data.sholatDhuha,
        sholatDzuhur: data.sholatDzuhur,
        sholatAshar: data.sholatAshar,
        sholatJamaah: data.sholatJamaah,
        activitiesSummary: data.activitiesSummary,
        achievements: data.learningAchievements,
        tahfidzActivity: data.surahPractice,
        behaviorNotes: data.behaviorNotes,
        teacherNotes: data.parentNotes,
        homeActivity: data.homeworkSuggestion,
      },
      include: {
        student: { select: { id: true, user: { select: { name: true } } } },
        photos: true,
        homework: true,
      },
    });

    // Handle photo updates if provided
    if (data.photoUrls !== undefined) {
      // Delete existing photos
      await prisma.dailyReportPhoto.deleteMany({ where: { reportId: id } });

      // Create new photos
      if (data.photoUrls.length > 0) {
        await prisma.dailyReportPhoto.createMany({
          data: data.photoUrls.map((url) => ({
            reportId: id,
            photoUrl: url,
            caption: '',
          })),
        });
      }
    }

    // Handle homework updates
    if (data.homework !== undefined) {
      // Delete existing homework
      await prisma.dailyHomework.deleteMany({ where: { reportId: id } });

      // Create new homework
      if (data.homework.length > 0) {
        await prisma.dailyHomework.createMany({
          data: data.homework.map((hw) => ({
            reportId: id,
            subjectName: hw.subjectName,
            description: hw.description,
            dueDate: hw.dueDate ? new Date(hw.dueDate) : null,
          })),
        });
      }
    }

    return report;
  },

  // ============================================
  // DELETE
  // ============================================

  async delete(id: string) {
    // Check if report exists
    await prisma.dailyStudentReport.findUniqueOrThrow({ where: { id } });

    // Delete photos first
    await prisma.dailyReportPhoto.deleteMany({ where: { reportId: id } });

    await prisma.dailyStudentReport.delete({ where: { id } });

    return { message: 'Daily report deleted successfully' };
  },

  // ============================================
  // PARENT CONFIRMATION (Read notification)
  // ============================================

  async confirmByParent(id: string, data: ConfirmReportInput, _userId: string) {
    const existing = await prisma.dailyStudentReport.findUnique({
      where: { id },
      select: { homeActivity: true },
    });

    const feedback = data.parentFeedback;
    let newHomeActivity = existing?.homeActivity;

    if (feedback) {
      if (newHomeActivity) {
        newHomeActivity = `${newHomeActivity}\n\n[Tanggapan Orang Tua]: ${feedback}`;
      } else {
        newHomeActivity = `[Tanggapan Orang Tua]: ${feedback}`;
      }
    }

    const report = await prisma.dailyStudentReport.update({
      where: { id },
      data: {
        parentReadAt: new Date(),
        homeActivity: newHomeActivity,
      },
      include: {
        student: { select: { id: true, user: { select: { name: true } } } },
      },
    });

    return report;
  },

  // ============================================
  // SUMMARIES & STATISTICS
  // ============================================

  async getStudentMonthlySummary(query: StudentDailySummaryQuery) {
    const { studentId, academicYearId, month, year } = query;

    // Build date range
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || now.getMonth() + 1;

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const reports = await prisma.dailyStudentReport.findMany({
      where: {
        studentId,
        academicYearId,
        reportDate: { gte: startDate, lte: endDate },
      },
      include: {
        photos: true,
      },
      orderBy: { reportDate: 'asc' },
    });

    // Calculate mood distribution
    const moodDistribution: Record<string, number> = {
      HAPPY: 0,
      NEUTRAL: 0,
      SAD: 0,
      SICK: 0,
      TIRED: 0,
    };

    // Calculate meal statistics
    const mealStats: Record<string, Record<string, number>> = {
      meal: { HABIS: 0, SETENGAH: 0, SEDIKIT: 0, TIDAK_MAU: 0 },
      snack: { HABIS: 0, SETENGAH: 0, SEDIKIT: 0, TIDAK_MAU: 0 },
    };

    // Calculate attendance and confirmation
    let totalNapMinutes = 0;
    let napCount = 0;
    let confirmedCount = 0;

    reports.forEach((report) => {
      if (report.mood) moodDistribution[report.mood]++;
      if (report.mealStatus) mealStats.meal[report.mealStatus]++;
      if (report.snackStatus) mealStats.snack[report.snackStatus]++;
      if (report.napDuration) {
        totalNapMinutes += report.napDuration;
        napCount++;
      }
      if (report.parentReadAt) confirmedCount++;
    });

    return {
      student: await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, nisn: true, user: { select: { name: true } } },
      }),
      period: {
        month: targetMonth,
        year: targetYear,
        startDate,
        endDate,
      },
      statistics: {
        totalReports: reports.length,
        confirmedByParent: confirmedCount,
        moodDistribution,
        mealStats,
        averageNapDuration: napCount > 0 ? Math.round(totalNapMinutes / napCount) : null,
      },
      reports,
    };
  },

  async getClassDailySummary(query: ClassDailySummaryQuery) {
    const { unitId, classId, academicYearId, date } = query;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get students in unit or class
    const studentsWhere: Prisma.StudentWhereInput = {
      unitId,
      status: 'ACTIVE',
    };

    if (classId) {
      studentsWhere.enrollments = {
        some: {
          classId,
          status: 'active',
        },
      };
    }

    // Filter reports by students found (which respects classId)
    // We fetch students first to know who SHOULD have a report
    const students = await prisma.student.findMany({
      where: studentsWhere,
      select: { id: true, nisn: true, user: { select: { name: true } } },
    });

    const studentIds = students.map((s) => s.id);

    const reports = await prisma.dailyStudentReport.findMany({
      where: {
        unitId,
        academicYearId,
        studentId: { in: studentIds },
        reportDate: { gte: targetDate, lt: nextDay },
      },
      include: {
        student: { select: { id: true, nisn: true, user: { select: { name: true } } } },
      },
    });

    // Map reports by student
    const reportMap = new Map(reports.map((r) => [r.studentId, r]));

    // Build summary
    const summary = {
      date: targetDate.toISOString().split('T')[0],
      totalStudents: students.length,
      reportsSubmitted: reports.length,
      pendingReports: students.length - reports.length,
      confirmedByParents: reports.filter((r) => r.parentReadAt).length,
      moodOverview: {
        happy: reports.filter((r) => r.mood === 'HAPPY').length,
        sick: reports.filter((r) => r.mood === 'SICK').length,
      },
      studentsWithReports: reports.map((r) => ({
        studentId: r.studentId,
        studentName: r.student.user.name,
        mood: r.mood,
        isConfirmed: !!r.parentReadAt,
      })),
      studentsWithoutReports: students
        .filter((s) => !reportMap.has(s.id))
        .map((s) => ({ studentId: s.id, studentName: s.user.name })),
    };

    return summary;
  },
};
