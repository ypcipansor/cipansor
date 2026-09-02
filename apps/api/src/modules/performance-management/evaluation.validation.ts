import { z } from 'zod';
import {
  createEvaluationSchema,
  updateIndicatorRealizationSchema,
  updateBehaviorScoreSchema,
} from '@cipansor/shared';

export {
  createEvaluationSchema,
  updateIndicatorRealizationSchema,
  updateBehaviorScoreSchema,
};

export const createBehavioralValueSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  weight: z.number().min(0),
});

export const updateBehavioralValueSchema = createBehavioralValueSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

export const approveEvaluationSchema = z.object({
  feedback: z.string().optional(),
});
