import { z } from 'zod';
import { uploadedFileRefListSchema } from '@cipansor/shared';

// Daily Mood enum
export const DailyMoodEnum = z.enum(['HAPPY', 'NEUTRAL', 'SAD', 'SICK', 'TIRED', 'EXCITED']);

// Meal Consumption enum
export const MealConsumptionEnum = z.enum(['HABIS', 'SETENGAH', 'SEDIKIT', 'TIDAK_MAU']);

// ============================================
// Daily Report Query Schemas
// ============================================

export const listDailyReportsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  studentId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  date: z.string().datetime().optional(), // Single date filter
  mood: DailyMoodEnum.optional(),
  isConfirmedByParent: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

// ============================================
// Daily Report Create/Update Schemas
// ============================================

export const createDailyReportSchema = z.object({
  studentId: z.string().uuid(),
  unitId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  reportDate: z.string().datetime(),

  // Mood & Physical
  morningMood: DailyMoodEnum.optional().nullable(),
  afternoonMood: DailyMoodEnum.optional().nullable(),
  healthNotes: z.string().max(500).optional().nullable(),
  temperature: z.number().min(30).max(45).optional().nullable(),

  // Prayers (SD IT Specific)
  sholatDhuha: z.boolean().optional(),
  sholatDzuhur: z.boolean().optional(),
  sholatAshar: z.boolean().optional(),
  sholatJamaah: z.boolean().optional(),

  // Meals
  breakfastConsumption: MealConsumptionEnum.optional().nullable(),
  lunchConsumption: MealConsumptionEnum.optional().nullable(),
  snackConsumption: MealConsumptionEnum.optional().nullable(),

  // Sleep (for full-day/boarding PAUD)
  napDurationMinutes: z.number().int().min(0).max(240).optional().nullable(),
  napQuality: z.string().max(100).optional().nullable(),

  // Toileting (for potty training age)
  bathroomCount: z.number().int().min(0).max(20).optional().nullable(),
  toiletingNotes: z.string().max(200).optional().nullable(),

  // Activities & Learning
  activitiesSummary: z.string().max(1000).optional().nullable(),
  learningAchievements: z.string().max(500).optional().nullable(),
  specialMoments: z.string().max(500).optional().nullable(),

  // Ibadah (Islamic activities)
  ibadahNotes: z.string().max(500).optional().nullable(),
  doaPractice: z.string().max(200).optional().nullable(),
  surahPractice: z.string().max(200).optional().nullable(),

  // Social & Behavior
  socialInteraction: z.string().max(500).optional().nullable(),
  behaviorNotes: z.string().max(500).optional().nullable(),

  // Recommendations for parents
  parentNotes: z.string().max(500).optional().nullable(),
  homeworkSuggestion: z.string().max(500).optional().nullable(),

  // Structured Homework (SD IT Specific)
  homework: z
    .array(
      z.object({
        subjectName: z.string().min(1),
        description: z.string().min(1),
        dueDate: z.string().datetime().optional().nullable(),
      })
    )
    .optional(),

  // Photos of activities (URLs)
  photoUrls: uploadedFileRefListSchema.max(10).optional().default([]),
});

export const updateDailyReportSchema = z.object({
  morningMood: DailyMoodEnum.optional().nullable(),
  afternoonMood: DailyMoodEnum.optional().nullable(),
  healthNotes: z.string().max(500).optional().nullable(),
  temperature: z.number().min(30).max(45).optional().nullable(),

  // Prayers
  sholatDhuha: z.boolean().optional(),
  sholatDzuhur: z.boolean().optional(),
  sholatAshar: z.boolean().optional(),
  sholatJamaah: z.boolean().optional(),

  breakfastConsumption: MealConsumptionEnum.optional().nullable(),
  lunchConsumption: MealConsumptionEnum.optional().nullable(),
  snackConsumption: MealConsumptionEnum.optional().nullable(),
  napDurationMinutes: z.number().int().min(0).max(240).optional().nullable(),
  napQuality: z.string().max(100).optional().nullable(),
  bathroomCount: z.number().int().min(0).max(20).optional().nullable(),
  toiletingNotes: z.string().max(200).optional().nullable(),
  activitiesSummary: z.string().max(1000).optional().nullable(),
  learningAchievements: z.string().max(500).optional().nullable(),
  specialMoments: z.string().max(500).optional().nullable(),
  ibadahNotes: z.string().max(500).optional().nullable(),
  doaPractice: z.string().max(200).optional().nullable(),
  surahPractice: z.string().max(200).optional().nullable(),
  socialInteraction: z.string().max(500).optional().nullable(),
  behaviorNotes: z.string().max(500).optional().nullable(),
  parentNotes: z.string().max(500).optional().nullable(),
  homeworkSuggestion: z.string().max(500).optional().nullable(),

  // Structured Homework
  homework: z
    .array(
      z.object({
        subjectName: z.string().min(1),
        description: z.string().min(1),
        dueDate: z.string().datetime().optional().nullable(),
      })
    )
    .optional(),

  photoUrls: uploadedFileRefListSchema.max(10).optional(),
});

// ============================================
// Parent Confirmation Schema
// ============================================

export const confirmReportSchema = z.object({
  parentFeedback: z.string().max(500).optional().nullable(),
});

// ============================================
// Bulk Create Schema (for batch entry)
// ============================================

export const bulkCreateDailyReportsSchema = z.object({
  unitId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  reportDate: z.string().datetime(),
  reports: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        arrivalTime: z.string().optional().nullable(),
        morningMood: DailyMoodEnum.optional().nullable(),
        afternoonMood: DailyMoodEnum.optional().nullable(),
        healthNotes: z.string().max(500).optional().nullable(),
        breakfastConsumption: MealConsumptionEnum.optional().nullable(),
        lunchConsumption: MealConsumptionEnum.optional().nullable(),
        activitiesSummary: z.string().max(1000).optional().nullable(),
        ibadahNotes: z.string().max(500).optional().nullable(),
        parentNotes: z.string().max(500).optional().nullable(),
        sholatDhuha: z.boolean().optional(),
        sholatDzuhur: z.boolean().optional(),
        sholatAshar: z.boolean().optional(),
        sholatJamaah: z.boolean().optional(),
        readingProgress: z
          .object({
            bookId: z.string().uuid(),
            page: z.number().int().min(1),
          })
          .optional(),
        tahfidzProgress: z
          .object({
            surahName: z.string(),
            surahNumber: z.number().int().min(1).max(114),
            ayahStart: z.number().int().min(1),
            ayahEnd: z.number().int().min(1),
          })
          .refine((data) => data.ayahEnd >= data.ayahStart, {
            message: 'ayahEnd must be greater than or equal to ayahStart',
          })
          .optional(),
      })
    )
    .min(1)
    .max(50),
});

// ============================================
// Summary Query Schemas
// ============================================

export const studentDailySummarySchema = z.object({
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

export const classDailySummarySchema = z.object({
  unitId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  academicYearId: z.string().uuid(),
  date: z.string().datetime().optional(),
});

// ============================================
// Type Exports
// ============================================

export type ListDailyReportsQuery = z.infer<typeof listDailyReportsQuerySchema>;
export type CreateDailyReportInput = z.infer<typeof createDailyReportSchema>;
export type UpdateDailyReportInput = z.infer<typeof updateDailyReportSchema>;
export type ConfirmReportInput = z.infer<typeof confirmReportSchema>;
export type BulkCreateDailyReportsInput = z.infer<typeof bulkCreateDailyReportsSchema>;
export type StudentDailySummaryQuery = z.infer<typeof studentDailySummarySchema>;
export type ClassDailySummaryQuery = z.infer<typeof classDailySummarySchema>;
