import { z } from 'zod';
import {
  PAUDAspect,
  PAUDAchievementLevel,
  PAUDReportPeriod,
  uploadedFileRefSchema,
} from '@cipansor/shared';

// PAUD Aspect enum
export const PAUDAspectEnum = z.nativeEnum({
  NAM: 'NAM',
  FM: 'FM',
  KOG: 'KOG',
  BHS: 'BHS',
  SE: 'SE',
  SNI: 'SNI',
} as const);

// Achievement Level enum
export const PAUDAchievementLevelEnum = z.nativeEnum({
  BB: 'BB',
  MB: 'MB',
  BSH: 'BSH',
  BSB: 'BSB',
} as const);

// Report Period enum
export const PAUDReportPeriodEnum = z.nativeEnum({
  HARIAN: 'HARIAN',
  MINGGUAN: 'MINGGUAN',
  BULANAN: 'BULANAN',
  SEMESTER: 'SEMESTER',
} as const);

// ============================================
// PAUD Development Indicator Schemas
// ============================================

export const listIndicatorsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  aspect: PAUDAspectEnum.optional(),
  ageGroupMin: z.coerce.number().min(0).optional(),
  ageGroupMax: z.coerce.number().max(84).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export const createIndicatorSchema = z
  .object({
    unitId: z.string().uuid().optional().nullable(), // null = global indicator
    aspect: PAUDAspectEnum,
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(255),
    description: z.string().optional().nullable(),
    ageGroupMin: z.number().int().min(0).max(84), // Age in months
    ageGroupMax: z.number().int().min(0).max(84),
    orderNumber: z.number().int().min(1),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.ageGroupMax >= data.ageGroupMin, {
    message: 'ageGroupMax must be greater than or equal to ageGroupMin',
    path: ['ageGroupMax'],
  });

export const updateIndicatorSchema = z.object({
  aspect: PAUDAspectEnum.optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  ageGroupMin: z.number().int().min(0).max(84).optional(),
  ageGroupMax: z.number().int().min(0).max(84).optional(),
  orderNumber: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

// ============================================
// PAUD Development Assessment Schemas
// ============================================

export const listAssessmentsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  studentId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  semester: z.enum(['GANJIL', 'GENAP']).optional(),
  aspect: PAUDAspectEnum.optional(),
  periodType: PAUDReportPeriodEnum.optional(),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(),
  achievementLevel: PAUDAchievementLevelEnum.optional(),
});

export const createAssessmentSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  unitId: z.string().uuid('Invalid unit ID'),
  academicYearId: z.string().uuid('Invalid academic year ID'),
  semester: z.enum(['GANJIL', 'GENAP']),
  periodType: PAUDReportPeriodEnum,
  periodDate: z.coerce.date(),
  aspect: PAUDAspectEnum,
  indicatorId: z.string().uuid().optional().nullable(),
  achievementLevel: PAUDAchievementLevelEnum,
  narrativeText: z.string().max(5000).optional().nullable(),
  teacherNotes: z.string().max(2000).optional().nullable(),
  recommendations: z.string().max(2000).optional().nullable(),
});

export const updateAssessmentSchema = z.object({
  periodType: PAUDReportPeriodEnum.optional(),
  periodDate: z.coerce.date().optional(),
  aspect: PAUDAspectEnum.optional(),
  indicatorId: z.string().uuid().optional().nullable(),
  achievementLevel: PAUDAchievementLevelEnum.optional(),
  narrativeText: z.string().max(5000).optional().nullable(),
  teacherNotes: z.string().max(2000).optional().nullable(),
  recommendations: z.string().max(2000).optional().nullable(),
});

export const bulkCreateAssessmentSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  unitId: z.string().uuid('Invalid unit ID'),
  academicYearId: z.string().uuid('Invalid academic year ID'),
  semester: z.enum(['GANJIL', 'GENAP']),
  periodType: PAUDReportPeriodEnum,
  periodDate: z.coerce.date(),
  assessments: z
    .array(
      z.object({
        aspect: PAUDAspectEnum,
        indicatorId: z.string().uuid().optional().nullable(),
        achievementLevel: PAUDAchievementLevelEnum,
        narrativeText: z.string().max(5000).optional().nullable(),
        teacherNotes: z.string().max(2000).optional().nullable(),
        recommendations: z.string().max(2000).optional().nullable(),
      })
    )
    .min(1, 'At least one assessment is required'),
});

// NEW: Class Bulk Assessment Schema
export const bulkCreateClassAssessmentSchema = z.object({
  classId: z.string().uuid('Invalid class ID'),
  unitId: z.string().uuid('Invalid unit ID'),
  academicYearId: z.string().uuid('Invalid academic year ID'),
  semester: z.enum(['GANJIL', 'GENAP']),
  periodType: PAUDReportPeriodEnum,
  periodDate: z.coerce.date(),
  aspect: PAUDAspectEnum,
  indicatorId: z.string().uuid().optional().nullable(),
  assessments: z
    .array(
      z.object({
        studentId: z.string().uuid('Invalid student ID'),
        achievementLevel: PAUDAchievementLevelEnum,
        narrativeText: z.string().max(5000).optional().nullable(),
        teacherNotes: z.string().max(2000).optional().nullable(),
        recommendations: z.string().max(2000).optional().nullable(),
      })
    )
    .min(1, 'At least one student assessment is required'),
});

// ============================================
// PAUD Assessment Evidence Schemas
// ============================================

export const createEvidenceSchema = z.object({
  assessmentId: z.string().uuid('Invalid assessment ID'),
  fileUrl: uploadedFileRefSchema,
  fileType: z.enum(['image', 'video', 'document']),
  fileName: z.string().max(255).optional().nullable(),
  caption: z.string().max(500).optional().nullable(),
});

export const updateEvidenceSchema = z.object({
  caption: z.string().max(500).optional().nullable(),
});

// ============================================
// PAUD Narrative Report Schemas
// ============================================

export const listNarrativeReportsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  studentId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  semester: z.enum(['GANJIL', 'GENAP']).optional(),
  status: z.enum(['DRAFT', 'FINALIZED', 'PRINTED']).optional(),
});

export const createNarrativeReportSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  unitId: z.string().uuid('Invalid unit ID'),
  academicYearId: z.string().uuid('Invalid academic year ID'),
  semester: z.enum(['GANJIL', 'GENAP']),
  narrativeNAM: z.string().max(5000).optional().nullable(),
  narrativeFM: z.string().max(5000).optional().nullable(),
  narrativeKOG: z.string().max(5000).optional().nullable(),
  narrativeBHS: z.string().max(5000).optional().nullable(),
  narrativeSE: z.string().max(5000).optional().nullable(),
  narrativeSNI: z.string().max(5000).optional().nullable(),
  overallStrengths: z.string().max(5000).optional().nullable(),
  areasForDevelopment: z.string().max(5000).optional().nullable(),
  parentRecommendations: z.string().max(5000).optional().nullable(),
  totalDays: z.number().int().min(0).optional(),
  presentDays: z.number().int().min(0).optional(),
  sickDays: z.number().int().min(0).optional(),
  excusedDays: z.number().int().min(0).optional(),
});

export const updateNarrativeReportSchema = z.object({
  narrativeNAM: z.string().max(5000).optional().nullable(),
  narrativeFM: z.string().max(5000).optional().nullable(),
  narrativeKOG: z.string().max(5000).optional().nullable(),
  narrativeBHS: z.string().max(5000).optional().nullable(),
  narrativeSE: z.string().max(5000).optional().nullable(),
  narrativeSNI: z.string().max(5000).optional().nullable(),
  overallStrengths: z.string().max(5000).optional().nullable(),
  areasForDevelopment: z.string().max(5000).optional().nullable(),
  parentRecommendations: z.string().max(5000).optional().nullable(),
  teacherSignature: z.string().optional().nullable(),
  principalSignature: z.string().optional().nullable(),
  totalDays: z.number().int().min(0).optional(),
  presentDays: z.number().int().min(0).optional(),
  sickDays: z.number().int().min(0).optional(),
  excusedDays: z.number().int().min(0).optional(),
});

export const finalizeReportSchema = z.object({
  teacherSignature: z.string().optional(),
  principalSignature: z.string().optional(),
});

// ============================================
// Common Param Schemas
// ============================================

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID'),
});

export const studentIdParamSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
});

// ============================================
// Summary/Stats Schemas
// ============================================

export const assessmentSummaryQuerySchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  academicYearId: z.string().uuid().optional(),
  semester: z.enum(['GANJIL', 'GENAP']).optional(),
});

export const classSummaryQuerySchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  academicYearId: z.string().uuid().optional(),
  semester: z.enum(['GANJIL', 'GENAP']).optional(),
  aspect: PAUDAspectEnum.optional(),
});

// ============================================
// Type Exports
// ============================================

export type ListIndicatorsQuery = z.infer<typeof listIndicatorsQuerySchema>;
// export type CreateIndicatorInput = z.infer<typeof createIndicatorSchema>; // Use shared type
// export type UpdateIndicatorInput = z.infer<typeof updateIndicatorSchema>; // Use shared type

export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;
// export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>; // Use shared type
// export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>; // Use shared type
// export type BulkCreateAssessmentInput = z.infer<typeof bulkCreateAssessmentSchema>; // Use shared type
export type BulkCreateClassPAUDAssessmentInput = z.infer<typeof bulkCreateClassAssessmentSchema>;

// export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>; // Use shared type
// export type UpdateEvidenceInput = z.infer<typeof updateEvidenceSchema>; // Use shared type

export type ListNarrativeReportsQuery = z.infer<typeof listNarrativeReportsQuerySchema>;
// export type CreateNarrativeReportInput = z.infer<typeof createNarrativeReportSchema>; // Use shared type
// export type UpdateNarrativeReportInput = z.infer<typeof updateNarrativeReportSchema>; // Use shared type
// export type FinalizeReportInput = z.infer<typeof finalizeReportSchema>; // Use shared type

export type AssessmentSummaryQuery = z.infer<typeof assessmentSummaryQuerySchema>;
export type ClassSummaryQuery = z.infer<typeof classSummaryQuerySchema>;
