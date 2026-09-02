import { z } from 'zod';

// ==================== BASE QUERY SCHEMAS ====================

export const unitQuerySchema = z.object({
  unitId: z.string().uuid('Invalid unit ID format').optional(),
});

export const dateRangeQuerySchema = z.object({
  unitId: z.string().uuid('Invalid unit ID format').optional(),
  startDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  endDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
});

export const academicYearQuerySchema = z.object({
  unitId: z.string().uuid('Invalid unit ID format').optional(),
  academicYearId: z.string().uuid('Invalid academic year ID format').optional(),
});

export const periodQuerySchema = z.object({
  unitId: z.string().uuid('Invalid unit ID format').optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly'),
  year: z.string().transform(Number).pipe(z.number().min(2000).max(2100)).optional(),
  month: z.string().transform(Number).pipe(z.number().min(1).max(12)).optional(),
});

// ==================== DASHBOARD STATS SCHEMAS ====================

export const dashboardStatsSchema = z.object({
  totalStudents: z.number().int(),
  totalTeachers: z.number().int(),
  totalClasses: z.number().int(),
  totalUnits: z.number().int(),
  attendanceRate: z.number().min(0).max(100),
  tahfidzProgress: z.number().min(0).max(100),
  financialHealth: z.object({
    totalRevenue: z.number(),
    totalExpense: z.number(),
    balance: z.number(),
    collectionRate: z.number().min(0).max(100),
  }),
  recentActivities: z.array(
    z.object({
      type: z.string(),
      description: z.string(),
      timestamp: z.string().datetime(),
    })
  ),
});

// ==================== STUDENT STATS SCHEMAS ====================

export const studentStatsSchema = z.object({
  total: z.number().int(),
  active: z.number().int(),
  inactive: z.number().int(),
  graduated: z.number().int(),
  byGender: z.object({
    male: z.number().int(),
    female: z.number().int(),
  }),
  byGrade: z.record(z.number().int()),
  byUnit: z.array(
    z.object({
      unitId: z.string(),
      unitName: z.string(),
      count: z.number().int(),
    })
  ),
  byStatus: z.record(z.number().int()),
  trend: z.array(
    z.object({
      period: z.string(),
      enrolled: z.number().int(),
      graduated: z.number().int(),
      dropout: z.number().int(),
    })
  ),
});

// ==================== TAHFIDZ STATS SCHEMAS ====================

export const tahfidzStatsSchema = z.object({
  totalStudents: z.number().int(),
  totalProgress: z.number().int(), // Total juz hafalan
  averageProgress: z.number(), // Rata-rata juz per siswa
  completedJuz: z.array(
    z.object({
      juz: z.number().int(),
      count: z.number().int(),
      percentage: z.number(),
    })
  ),
  topPerformers: z.array(
    z.object({
      studentId: z.string(),
      studentName: z.string(),
      totalJuz: z.number().int(),
      lastProgress: z.string().datetime().optional(),
    })
  ),
  progressByClass: z.array(
    z.object({
      classId: z.string(),
      className: z.string(),
      averageJuz: z.number(),
      totalStudents: z.number().int(),
    })
  ),
  weeklyProgress: z.array(
    z.object({
      week: z.string(),
      newMemorizations: z.number().int(),
      reviews: z.number().int(),
    })
  ),
});

// ==================== FINANCE STATS SCHEMAS ====================

export const financeStatsSchema = z.object({
  summary: z.object({
    totalRevenue: z.number(),
    totalExpense: z.number(),
    netIncome: z.number(),
    pendingPayments: z.number(),
    overduePayments: z.number(),
  }),
  revenueByCategory: z.array(
    z.object({
      category: z.string(),
      amount: z.number(),
      percentage: z.number(),
    })
  ),
  expenseByCategory: z.array(
    z.object({
      category: z.string(),
      amount: z.number(),
      percentage: z.number(),
    })
  ),
  paymentStatus: z.object({
    paid: z.number().int(),
    pending: z.number().int(),
    overdue: z.number().int(),
    cancelled: z.number().int(),
    collectionRate: z.number().min(0).max(100),
  }),
  trend: z.array(
    z.object({
      period: z.string(),
      revenue: z.number(),
      expense: z.number(),
    })
  ),
  topDebtors: z
    .array(
      z.object({
        studentId: z.string(),
        studentName: z.string(),
        totalDebt: z.number(),
        overdueMonths: z.number().int(),
      })
    )
    .optional(),
});

// ==================== ATTENDANCE STATS SCHEMAS ====================

export const attendanceStatsSchema = z.object({
  summary: z.object({
    totalDays: z.number().int(),
    averageAttendance: z.number().min(0).max(100),
    totalPresent: z.number().int(),
    totalAbsent: z.number().int(),
    totalLate: z.number().int(),
    totalPermitted: z.number().int(),
    totalSick: z.number().int(),
  }),
  byStatus: z.record(
    z.object({
      count: z.number().int(),
      percentage: z.number(),
    })
  ),
  byClass: z.array(
    z.object({
      classId: z.string(),
      className: z.string(),
      attendanceRate: z.number(),
      totalStudents: z.number().int(),
    })
  ),
  byDay: z.array(
    z.object({
      day: z.string(),
      attendanceRate: z.number(),
      totalPresent: z.number().int(),
      totalAbsent: z.number().int(),
    })
  ),
  latePatterns: z
    .array(
      z.object({
        hour: z.number().int(),
        count: z.number().int(),
      })
    )
    .optional(),
  lowAttendanceStudents: z
    .array(
      z.object({
        studentId: z.string(),
        studentName: z.string(),
        attendanceRate: z.number(),
        totalAbsences: z.number().int(),
      })
    )
    .optional(),
});

// ==================== ACADEMIC STATS SCHEMAS ====================

export const academicStatsSchema = z.object({
  summary: z.object({
    totalAssessments: z.number().int(),
    averageScore: z.number(),
    passRate: z.number().min(0).max(100),
    excellentRate: z.number().min(0).max(100), // Nilai A
  }),
  bySubject: z.array(
    z.object({
      subjectId: z.string(),
      subjectName: z.string(),
      averageScore: z.number(),
      passRate: z.number(),
      totalAssessments: z.number().int(),
    })
  ),
  byClass: z.array(
    z.object({
      classId: z.string(),
      className: z.string(),
      averageScore: z.number(),
      topStudent: z.string().optional(),
    })
  ),
  gradeDistribution: z.array(
    z.object({
      grade: z.string(),
      count: z.number().int(),
      percentage: z.number(),
    })
  ),
  trend: z.array(
    z.object({
      period: z.string(),
      averageScore: z.number(),
      passRate: z.number(),
    })
  ),
});

// ==================== LIBRARY STATS SCHEMAS ====================

export const libraryStatsSchema = z.object({
  collection: z.object({
    totalBooks: z.number().int(),
    totalTitles: z.number().int(),
    availableBooks: z.number().int(),
    borrowedBooks: z.number().int(),
    lostBooks: z.number().int(),
    damagedBooks: z.number().int(),
  }),
  byCategory: z.array(
    z.object({
      category: z.string(),
      count: z.number().int(),
      percentage: z.number(),
    })
  ),
  circulation: z.object({
    totalLoans: z.number().int(),
    activeLoans: z.number().int(),
    overdueLoans: z.number().int(),
    returnedOnTime: z.number().int(),
    averageLoanDays: z.number(),
  }),
  popularBooks: z.array(
    z.object({
      bookId: z.string(),
      title: z.string(),
      author: z.string().optional(),
      loanCount: z.number().int(),
    })
  ),
  activeReaders: z.array(
    z.object({
      userId: z.string(),
      userName: z.string(),
      loanCount: z.number().int(),
    })
  ),
  trend: z.array(
    z.object({
      period: z.string(),
      loans: z.number().int(),
      returns: z.number().int(),
    })
  ),
});

// ==================== PSB STATS SCHEMAS ====================

export const psbStatsSchema = z.object({
  summary: z.object({
    totalApplicants: z.number().int(),
    accepted: z.number().int(),
    rejected: z.number().int(),
    pending: z.number().int(),
    registered: z.number().int(),
    conversionRate: z.number().min(0).max(100),
  }),
  byUnit: z.array(
    z.object({
      unitId: z.string(),
      unitName: z.string(),
      quota: z.number().int(),
      applicants: z.number().int(),
      accepted: z.number().int(),
      fillRate: z.number(),
    })
  ),
  byWave: z.array(
    z.object({
      waveId: z.string(),
      waveName: z.string(),
      applicants: z.number().int(),
      accepted: z.number().int(),
    })
  ),
  byChannel: z.array(
    z.object({
      channel: z.string(), // Website, offline, referral, etc.
      count: z.number().int(),
      percentage: z.number(),
    })
  ),
  timeline: z.array(
    z.object({
      date: z.string(),
      applications: z.number().int(),
      registrations: z.number().int(),
    })
  ),
  demographics: z.object({
    byGender: z.record(z.number().int()),
    byOriginSchool: z.array(
      z.object({
        schoolName: z.string(),
        count: z.number().int(),
      })
    ),
    byRegion: z.array(
      z.object({
        region: z.string(),
        count: z.number().int(),
      })
    ),
  }),
});

// ==================== HEALTH STATS SCHEMAS ====================

export const healthStatsQuerySchema = dateRangeQuerySchema.extend({
  category: z.enum(['checkup', 'screening', 'incident', 'immunization']).optional(),
});

export const healthStatsSchema = z.object({
  summary: z.object({
    totalCheckups: z.number().int(),
    totalScreenings: z.number().int(),
    totalIncidents: z.number().int(),
    healthyRate: z.number().min(0).max(100),
  }),
  screeningResults: z.array(
    z.object({
      type: z.string(), // Vision, hearing, dental, BMI, etc.
      normal: z.number().int(),
      needsAttention: z.number().int(),
      referral: z.number().int(),
    })
  ),
  commonIssues: z.array(
    z.object({
      issue: z.string(),
      count: z.number().int(),
    })
  ),
  immunizationCoverage: z.array(
    z.object({
      vaccine: z.string(),
      covered: z.number().int(),
      total: z.number().int(),
      percentage: z.number(),
    })
  ),
});

// ==================== CUSTOM REPORT QUERY SCHEMA ====================

export const customReportQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
  startDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  metrics: z
    .array(
      z.enum([
        'students',
        'attendance',
        'tahfidz',
        'finance',
        'academic',
        'library',
        'health',
        'psb',
      ])
    )
    .min(1),
  groupBy: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
  format: z.enum(['json', 'excel', 'pdf']).default('json'),
});

// ==================== TYPE EXPORTS ====================

export type UnitQueryInput = z.infer<typeof unitQuerySchema>;
export type DateRangeQueryInput = z.infer<typeof dateRangeQuerySchema>;
export type AcademicYearQueryInput = z.infer<typeof academicYearQuerySchema>;
export type PeriodQueryInput = z.infer<typeof periodQuerySchema>;

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
export type StudentStats = z.infer<typeof studentStatsSchema>;
export type TahfidzStats = z.infer<typeof tahfidzStatsSchema>;
export type FinanceStats = z.infer<typeof financeStatsSchema>;
export type AttendanceStats = z.infer<typeof attendanceStatsSchema>;
export type AcademicStats = z.infer<typeof academicStatsSchema>;
export type LibraryStats = z.infer<typeof libraryStatsSchema>;
export type PSBStats = z.infer<typeof psbStatsSchema>;
export type HealthStats = z.infer<typeof healthStatsSchema>;

export type HealthStatsQueryInput = z.infer<typeof healthStatsQuerySchema>;
export type CustomReportQueryInput = z.infer<typeof customReportQuerySchema>;
