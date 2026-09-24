import { z } from 'zod';
import { uploadedFileRefSchema } from '@cipansor/shared';

// ============================================
// QUERY SCHEMAS
// ============================================

export const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  studentId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  semester: z.enum(['GANJIL', 'GENAP']).optional(),
  classId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'FINALIZED', 'PRINTED']).optional(),
  search: z.string().optional(),
});
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;

// ============================================
// CREATE/UPDATE SCHEMAS
// ============================================

export const createReportSchema = z.object({
  studentId: z.string().uuid(),
  unitId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  semester: z.enum(['GANJIL', 'GENAP']),
  narrativeNAM: z.string().max(3000).optional(),
  narrativeFM: z.string().max(3000).optional(),
  narrativeKOG: z.string().max(3000).optional(),
  narrativeBHS: z.string().max(3000).optional(),
  narrativeSE: z.string().max(3000).optional(),
  narrativeSNI: z.string().max(3000).optional(),
  overallStrengths: z.string().max(2000).optional(),
  areasForDevelopment: z.string().max(2000).optional(),
  parentRecommendations: z.string().max(2000).optional(),
  totalDays: z.number().int().min(0).default(0),
  presentDays: z.number().int().min(0).default(0),
  sickDays: z.number().int().min(0).default(0),
  excusedDays: z.number().int().min(0).default(0),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const updateReportSchema = z.object({
  narrativeNAM: z.string().max(3000).optional(),
  narrativeFM: z.string().max(3000).optional(),
  narrativeKOG: z.string().max(3000).optional(),
  narrativeBHS: z.string().max(3000).optional(),
  narrativeSE: z.string().max(3000).optional(),
  narrativeSNI: z.string().max(3000).optional(),
  overallStrengths: z.string().max(2000).optional(),
  areasForDevelopment: z.string().max(2000).optional(),
  parentRecommendations: z.string().max(2000).optional(),
  totalDays: z.number().int().min(0).optional(),
  presentDays: z.number().int().min(0).optional(),
  sickDays: z.number().int().min(0).optional(),
  excusedDays: z.number().int().min(0).optional(),
});
export type UpdateReportInput = z.infer<typeof updateReportSchema>;

// ============================================
// GENERATE REPORT SCHEMA
// ============================================

export const generateReportSchema = z.object({
  studentId: z.string().uuid(),
  unitId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  semester: z.enum(['GANJIL', 'GENAP']),
  regenerate: z.boolean().default(false), // Force regenerate existing draft
});
export type GenerateReportInput = z.infer<typeof generateReportSchema>;

export const bulkGenerateReportSchema = z.object({
  classId: z.string().uuid(),
  unitId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  semester: z.enum(['GANJIL', 'GENAP']),
  regenerate: z.boolean().default(false),
});
export type BulkGenerateReportInput = z.infer<typeof bulkGenerateReportSchema>;

// ============================================
// FINALIZE SCHEMA
// ============================================

export const finalizeReportSchema = z.object({
  teacherSignature: z.string().optional(),
  principalSignature: z.string().optional(),
});
export type FinalizeReportInput = z.infer<typeof finalizeReportSchema>;

// ============================================
// PHOTO SCHEMAS
// ============================================

export const addPhotoSchema = z.object({
  photoUrl: uploadedFileRefSchema,
  caption: z.string().max(500).optional(),
  orderNumber: z.number().int().min(0).default(0),
});
export type AddPhotoInput = z.infer<typeof addPhotoSchema>;

export const updatePhotoSchema = z.object({
  caption: z.string().max(500).optional(),
  orderNumber: z.number().int().min(0).optional(),
});
export type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>;

// ============================================
// ID PARAM SCHEMAS
// ============================================

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
export type IdParam = z.infer<typeof idParamSchema>;

export const studentIdParamSchema = z.object({
  studentId: z.string().uuid(),
});
export type StudentIdParam = z.infer<typeof studentIdParamSchema>;

export const photoIdParamSchema = z.object({
  photoId: z.string().uuid(),
});
export type PhotoIdParam = z.infer<typeof photoIdParamSchema>;
