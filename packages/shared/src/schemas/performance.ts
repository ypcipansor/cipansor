import { z } from 'zod';

export const createPKSchema = z
  .object({
    strategicPlanId: z.string().uuid().optional(),
    supervisorId: z.string().uuid().optional(),
    supervisorPkId: z.string().uuid().optional(),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    notes: z.string().optional(),
  })
  .refine((data) => new Date(data.periodEnd) >= new Date(data.periodStart), {
    message: 'periodEnd must be on or after periodStart',
    path: ['periodEnd'],
  });

export const createEvaluationSchema = z.object({
  pkId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  feedback: z.string().optional(),
  notes: z.string().optional(),
});

export const updateIndicatorRealizationSchema = z.object({
  indicatorId: z.string().uuid(),
  realization: z.number(),
  activities: z.string().optional(),
});

export const updateBehaviorScoreSchema = z.object({
  behaviorValueId: z.string().uuid(),
  score: z.number().min(0).max(100),
  notes: z.string().optional(),
});

export const getConsolidatedReportQuerySchema = z.object({
  month: z
    .preprocess(
      (val) => (typeof val === 'number' ? String(val) : val),
      z
        .string()
        .optional()
        .refine((val) => val === undefined || /^\d+$/.test(val.trim()), {
          message: 'Invalid month parameter. Must be an integer between 1 and 12',
        })
        .transform((val) => (val !== undefined ? parseInt(val.trim(), 10) : undefined))
        .refine((val) => val === undefined || (val >= 1 && val <= 12), {
          message: 'Invalid month parameter. Must be between 1 and 12',
        })
    ),
  year: z
    .preprocess(
      (val) => (typeof val === 'number' ? String(val) : val),
      z
        .string()
        .optional()
        .refine((val) => val === undefined || /^\d+$/.test(val.trim()), {
          message: 'Invalid year parameter. Must be a valid integer year',
        })
        .transform((val) => (val !== undefined ? parseInt(val.trim(), 10) : new Date().getFullYear()))
        .refine((val) => val >= 2000 && val <= 2100, {
          message: 'Invalid year parameter',
        })
    ),
});
