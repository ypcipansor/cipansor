import { z } from 'zod';
import { UnitType } from '@prisma/client';
import { NPSN_MESSAGE, NPSN_PATTERN, unitOfficialIdentityFields } from '@cipansor/shared';

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
  logoUrl: z.string().url().optional(),
});

// Update unit — PATCH, so every field is optional; `null` clears an optional one.
export const updateUnitSchema = z.object({
  name: z.string().trim().min(3, 'Nama unit minimal 3 karakter').optional(),
  // Only the Super Admin may change it (unit.service): the type decides which
  // page of the public site the unit belongs to.
  type: unitTypeSchema.optional(),
  address: z.string().trim().min(5, 'Alamat minimal 5 karakter').optional(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email('Email tidak valid').optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  npsn: z.string().trim().regex(NPSN_PATTERN, NPSN_MESSAGE).optional().nullable(),
  // What documents print (`unitDocumentName`); the unit's admin keeps them,
  // like the NPSN.
  officialName: unitOfficialIdentityFields.officialName.optional().nullable(),
  operatingPermitNumber: unitOfficialIdentityFields.operatingPermitNumber.optional().nullable(),
  operatingPermitDate: unitOfficialIdentityFields.operatingPermitDate.optional().nullable(),
});

// ID param
export const unitIdParamSchema = z.object({
  id: z.string().uuid('Invalid unit ID'),
});

/** A public certificate link; a malformed id is simply not a certificate. */
export const accreditationIdParamSchema = z.object({
  accreditationId: z.string().uuid('ID sertifikat tidak sah'),
});

// Types
export type ListUnitsQuery = z.infer<typeof listUnitsQuerySchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
