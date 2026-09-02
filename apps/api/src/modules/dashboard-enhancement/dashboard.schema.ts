import { z } from 'zod';

// ============================================
// Enums
// ============================================

export const MetricTypeEnum = z.enum([
  'STUDENT_COUNT',
  'TEACHER_COUNT',
  'ATTENDANCE_RATE',
  'TAHFIDZ_PROGRESS',
  'FINANCE_BALANCE',
  'ADMISSION_RATE',
  'GRADUATION_RATE',
  'VIOLATION_COUNT',
  'ACHIEVEMENT_COUNT',
  'PAUD_DEVELOPMENT',
  'MUROJAAH_COMPLETION',
  'SIMAAN_PASS_RATE',
]);

export const PeriodTypeEnum = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

export const ReportTypeEnum = z.enum([
  'ACADEMIC',
  'FINANCIAL',
  'ATTENDANCE',
  'TAHFIDZ',
  'ENROLLMENT',
  'HEALTH',
]);

// ============================================
// Query Schemas
// ============================================

export const dashboardOverviewQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});

export const metricsQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  metricType: MetricTypeEnum.optional(),
  periodType: PeriodTypeEnum.optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const unitComparisonQuerySchema = z.object({
  metricType: z.string(),
  academicYearId: z.string().uuid().optional(),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const trendQuerySchema = z.object({
  metricType: z.string(),
  periodType: z.string(),
  unitId: z.string().uuid().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// ============================================
// Create/Update Schemas
// ============================================

export const createMetricSnapshotSchema = z.object({
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  metricType: MetricTypeEnum,
  metricValue: z.number(),
  metricData: z.record(z.any()).optional(),
  periodType: PeriodTypeEnum,
  periodDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const generateReportSchema = z.object({
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  reportType: ReportTypeEnum,
  periodType: PeriodTypeEnum,
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ============================================
// Type Exports
// ============================================

export type DashboardOverviewQuery = z.infer<typeof dashboardOverviewQuerySchema>;
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
export type UnitComparisonQuery = z.infer<typeof unitComparisonQuerySchema>;
export type TrendQuery = z.infer<typeof trendQuerySchema>;
export type CreateMetricSnapshotInput = z.infer<typeof createMetricSnapshotSchema>;
export type GenerateReportInput = z.infer<typeof generateReportSchema>;
