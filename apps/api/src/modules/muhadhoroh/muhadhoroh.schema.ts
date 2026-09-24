import { z } from 'zod';
import { uploadedFileRefSchema } from '@cipansor/shared';

// =====================================
// MUHADHOROH (SPEECH PRACTICE) SCHEMAS
// =====================================

// Status enum
export const MuhadhorohStatusEnum = z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']);

// Language options for speech
export const LanguageEnum = z.enum(['Indonesian', 'Arabic', 'English']);

// =====================================
// QUERY SCHEMAS
// =====================================

export const listMuhadhorohQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unitId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  evaluatorId: z.string().uuid().optional(),
  status: MuhadhorohStatusEnum.optional(),
  language: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const upcomingQuerySchema = z.object({
  unitId: z.string().uuid('Unit ID is required'),
  limit: z.coerce.number().min(1).max(50).default(10),
});

export const studentHistoryQuerySchema = z.object({
  studentId: z.string().uuid('Student ID is required'),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const statisticsQuerySchema = z.object({
  unitId: z.string().uuid('Unit ID is required'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const topPerformersQuerySchema = z.object({
  unitId: z.string().uuid('Unit ID is required'),
  limit: z.coerce.number().min(1).max(50).default(10),
});

// =====================================
// CREATE/UPDATE SCHEMAS
// =====================================

export const createMuhadhorohSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  studentId: z.string().uuid('Invalid student ID'),
  scheduledAt: z.string().datetime('Invalid date format'),
  topic: z.string().min(1, 'Topic is required').max(255, 'Topic too long'),
  language: LanguageEnum.default('Indonesian'),
});

export const updateMuhadhorohSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(255, 'Topic too long').optional(),
  language: LanguageEnum.optional(),
  scheduledAt: z.string().datetime('Invalid date format').optional(),
  status: MuhadhorohStatusEnum.optional(),
});

// =====================================
// EVALUATION SCHEMA
// =====================================

export const evaluateMuhadhorohSchema = z.object({
  contentScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  deliveryScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  languageScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  feedback: z.string().max(2000, 'Feedback too long').optional(),
  videoUrl: uploadedFileRefSchema.optional().or(z.literal('')),
  duration: z.coerce.number().min(1).max(120).optional(), // Duration in minutes
});

// =====================================
// ID PARAM SCHEMA
// =====================================

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const studentIdParamSchema = z.object({
  studentId: z.string().uuid('Invalid student ID format'),
});

// =====================================
// TYPE EXPORTS
// =====================================

export type ListMuhadhorohQuery = z.infer<typeof listMuhadhorohQuerySchema>;
export type CreateMuhadhorohInput = z.infer<typeof createMuhadhorohSchema>;
export type UpdateMuhadhorohInput = z.infer<typeof updateMuhadhorohSchema>;
export type EvaluateMuhadhorohInput = z.infer<typeof evaluateMuhadhorohSchema>;
export type MuhadhorohStatus = z.infer<typeof MuhadhorohStatusEnum>;
export type Language = z.infer<typeof LanguageEnum>;
