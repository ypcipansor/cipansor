import { z } from 'zod';
import { BusinessUnitType } from '@prisma/client';

// Create schema — strict() rejects unknown fields (e.g. id, createdAt, isActive)
// from leaking into the service layer where they could override defaults.
export const CreateBusinessUnitSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(255),
    code: z.string().min(1, 'Code is required').max(50),
    type: z.nativeEnum(BusinessUnitType, {
      errorMap: () => ({ message: 'Invalid business unit type' }),
    }),
    description: z.string().optional(),
    managerId: z.string().uuid().optional(),
  })
  .strict();

// Update schema — all fields optional, unknown fields rejected.
export const UpdateBusinessUnitSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    code: z.string().min(1).max(50).optional(),
    type: z
      .nativeEnum(BusinessUnitType, {
        errorMap: () => ({ message: 'Invalid business unit type' }),
      })
      .optional(),
    description: z.string().optional(),
    managerId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type CreateBusinessUnitInput = z.infer<typeof CreateBusinessUnitSchema>;
export type UpdateBusinessUnitInput = z.infer<typeof UpdateBusinessUnitSchema>;
