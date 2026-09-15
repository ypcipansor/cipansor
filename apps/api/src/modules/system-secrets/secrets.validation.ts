import { z } from 'zod';

export const createSecretSchema = z.object({
  key: z
    .string()
    .min(1, 'Key is required')
    .regex(/^[A-Z0-9_]+$/, 'Key must be uppercase alphanumeric with underscores'),
  value: z.string().min(1, 'Value is required'),
  description: z.string().optional(),
  unitId: z.string().uuid().optional().nullable(),
});

export const updateSecretSchema = z.object({
  value: z.string().min(1, 'Value is required'),
  description: z.string().optional(),
});
