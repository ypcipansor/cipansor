import { z } from "zod";

export const PracticumStatusSchema = z.enum([
  "DRAFT",
  "PENDING_REVIEW",
  "REVISION_REQUIRED",
  "APPROVED",
  "COMPLETED",
]);

export type PracticumStatus = z.infer<typeof PracticumStatusSchema>;

export const PracticumLessonPlanSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  subject: z.string(),
  topic: z.string(),
  method: z.string(),
  materials: z.string(),
  objectives: z.string(),
  steps: z.any(), // JSON
  status: PracticumStatusSchema,
  reviewedById: z.string().uuid().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  reviewNotes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PracticumLessonPlan = z.infer<typeof PracticumLessonPlanSchema>;

export const CreatePracticumLessonPlanSchema = PracticumLessonPlanSchema.omit({
  id: true,
  status: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNotes: true,
  createdAt: true,
  updatedAt: true,
});

export type CreatePracticumLessonPlan = z.infer<
  typeof CreatePracticumLessonPlanSchema
>;

export const PracticumScheduleSchema = z.object({
  id: z.string().uuid(),
  lessonPlanId: z.string().uuid(),
  targetClassId: z.string().uuid(),
  date: z.string().datetime(),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string().nullable(),
});

export type PracticumSchedule = z.infer<typeof PracticumScheduleSchema>;

export const PracticumEvaluationSchema = z.object({
  id: z.string().uuid(),
  lessonPlanId: z.string().uuid(),
  evaluatorId: z.string().uuid(),
  isPeer: z.boolean(),
  methodScore: z.number(),
  contentScore: z.number(),
  languageScore: z.number(),
  performanceScore: z.number(),
  totalScore: z.number(),
  feedback: z.string(),
  createdAt: z.string().datetime(),
});

export type PracticumEvaluation = z.infer<typeof PracticumEvaluationSchema>;
