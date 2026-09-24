import { z } from 'zod';
import { uploadedFileRefSchema } from '@cipansor/shared';

// =====================================
// MUHADATSAH (CONVERSATION PRACTICE) SCHEMAS
// =====================================

// Status enum
export const MuhadatsahStatusEnum = z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']);

// Language options for conversation
export const ConversationLanguageEnum = z.enum(['Arabic', 'English']);

// =====================================
// QUERY SCHEMAS
// =====================================

export const listMuhadatsahQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unitId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  evaluatorId: z.string().uuid().optional(),
  status: MuhadatsahStatusEnum.optional(),
  language: ConversationLanguageEnum.optional(),
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

export const matchPartnersQuerySchema = z.object({
  unitId: z.string().uuid('Unit ID is required'),
  language: ConversationLanguageEnum,
  excludeStudentId: z.string().uuid().optional(),
});

// =====================================
// CREATE/UPDATE SCHEMAS
// =====================================

export const createMuhadatsahSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  studentId: z.string().uuid('Invalid student ID'),
  scheduledAt: z.string().datetime('Invalid date format'),
  language: ConversationLanguageEnum,
  partnerId: z.string().uuid('Invalid partner ID').optional(),
  topic: z.string().min(1, 'Topic is required').max(255, 'Topic too long').optional(),
  duration: z.coerce.number().min(5).max(60).optional(), // Duration in minutes
});

export const updateMuhadatsahSchema = z.object({
  language: ConversationLanguageEnum.optional(),
  scheduledAt: z.string().datetime('Invalid date format').optional(),
  partnerId: z.string().uuid('Invalid partner ID').optional().nullable(),
  topic: z.string().min(1).max(255).optional(),
  duration: z.coerce.number().min(5).max(60).optional(),
  status: MuhadatsahStatusEnum.optional(),
});

// =====================================
// EVALUATION SCHEMA
// =====================================

export const evaluateMuhadatsahSchema = z.object({
  fluencyScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  grammarScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  vocabularyScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  pronunciationScore: z.coerce
    .number()
    .min(0, 'Score must be at least 0')
    .max(100, 'Score must be at most 100'),
  feedback: z.string().max(2000, 'Feedback too long').optional(),
  recordingUrl: uploadedFileRefSchema.optional().or(z.literal('')),
  duration: z.coerce.number().min(1).max(60).optional(), // Actual duration in minutes
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

export type ListMuhadatsahQuery = z.infer<typeof listMuhadatsahQuerySchema>;
export type CreateMuhadatsahInput = z.infer<typeof createMuhadatsahSchema>;
export type UpdateMuhadatsahInput = z.infer<typeof updateMuhadatsahSchema>;
export type EvaluateMuhadatsahInput = z.infer<typeof evaluateMuhadatsahSchema>;
export type MuhadatsahStatus = z.infer<typeof MuhadatsahStatusEnum>;
export type ConversationLanguage = z.infer<typeof ConversationLanguageEnum>;
