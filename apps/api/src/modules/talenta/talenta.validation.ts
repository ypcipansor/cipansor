import { z } from 'zod';

export const createTalentProfileSchema = z.object({
  userId: z.string().uuid(),
  currentRole: z.string().min(1),
  category: z
    .enum(['HIGH_POTENTIAL', 'KEY_TALENT', 'EMERGING', 'SOLID_PERFORMER', 'NEEDS_DEVELOPMENT'])
    .optional(),
  potentialRole: z.string().optional(),
  readinessLevel: z.string().optional(),
  strengths: z.string().optional(),
  developmentAreas: z.string().optional(),
  careerAspiration: z.string().optional(),
  unitId: z.string().uuid().optional(),
});

export const updateTalentProfileSchema = z.object({
  currentRole: z.string().optional(),
  category: z
    .enum(['HIGH_POTENTIAL', 'KEY_TALENT', 'EMERGING', 'SOLID_PERFORMER', 'NEEDS_DEVELOPMENT'])
    .optional(),
  potentialRole: z.string().nullable().optional(),
  readinessLevel: z.string().nullable().optional(),
  strengths: z.string().optional(),
  developmentAreas: z.string().optional(),
  careerAspiration: z.string().optional(),
});

export const createAssessmentSchema = z.object({
  talentId: z.string().uuid(),
  period: z.string().min(1),
  performanceRating: z.enum(['OUTSTANDING', 'EXCEEDS', 'MEETS', 'BELOW', 'UNSATISFACTORY']),
  potentialRating: z.enum(['OUTSTANDING', 'EXCEEDS', 'MEETS', 'BELOW', 'UNSATISFACTORY']),
  overallScore: z.number().min(0).max(100),
  competencies: z.any().optional(),
  feedback: z.string().optional(),
  developmentPlan: z.string().optional(),
  assessedAt: z.string().datetime(),
});

export const createTrainingSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  category: z.string().min(1),
  trainer: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  maxParticipants: z.number().int().positive().optional(),
  budget: z.number().positive().optional(),
  location: z.string().optional(),
  unitId: z.string().uuid().optional(),
});

export const updateTrainingSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  trainer: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  maxParticipants: z.number().int().positive().optional(),
  budget: z.number().positive().optional(),
  status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
  location: z.string().optional(),
});

export const enrollTrainingSchema = z.object({
  programId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const createSuccessionSchema = z.object({
  positionTitle: z.string().min(1),
  // Nullable to match the create dialog, which sends null when no current
  // holder / successor candidate is selected (same semantics as update).
  currentHolderId: z.string().uuid().nullable().optional(),
  successorId: z.string().uuid().nullable().optional(),
  readinessLevel: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  notes: z.string().optional(),
  targetDate: z.string().datetime().optional(),
  unitId: z.string().uuid().optional(),
});

export const updateSuccessionSchema = z.object({
  positionTitle: z.string().min(1).optional(),
  currentHolderId: z.string().uuid().nullable().optional(),
  successorId: z.string().uuid().nullable().optional(),
  readinessLevel: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  notes: z.string().optional(),
  targetDate: z.string().datetime().nullable().optional(),
});
