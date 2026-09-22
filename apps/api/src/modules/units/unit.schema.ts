import { z } from 'zod';
import { uploadedFileRefSchema } from '@cipansor/shared';

import { UnitType } from '@prisma/client';

/**
 * Derived from the Prisma enum rather than hand-listed.
 *
 * The literal list was repeated three times below and had fallen behind the
 * schema: it was missing UNIT_USAHA, so a business unit existed in the
 * database but could not be edited through the API — the update would fail
 * validation on a value the row already held. Deriving it means adding a
 * UnitType to schema.prisma is the only change ever needed.
 */
const unitTypeSchema = z.nativeEnum(UnitType);

// Query params
export const listUnitsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  type: unitTypeSchema.optional(),
});

// Create unit
export const createUnitSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  type: unitTypeSchema,
  address: z.string().min(5, 'Address must be at least 5 characters'),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  logoUrl: uploadedFileRefSchema.optional(),
});

// Update unit
export const updateUnitSchema = z.object({
  name: z.string().min(3).optional(),
  type: unitTypeSchema.optional(),
  address: z.string().min(5).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  logoUrl: uploadedFileRefSchema.optional().nullable(),
});

// ID param
export const unitIdParamSchema = z.object({
  id: z.string().uuid('Invalid unit ID'),
});

// Types
export type ListUnitsQuery = z.infer<typeof listUnitsQuerySchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
