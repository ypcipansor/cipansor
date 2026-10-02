import { z } from 'zod';

// =====================================
// WAVE STATUS ENUM (matching Prisma schema)
// =====================================

export const WaveStatusEnum = z.enum(['UPCOMING', 'OPEN', 'CLOSED', 'FULL']);

// =====================================
// ADMISSION WAVE SCHEMAS
// =====================================

export const listWaveQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  periodId: z.string().uuid().optional(),
  status: WaveStatusEnum.optional(),
});

// A wave's own fields are a contract with the portal's forms, so they live in
// @cipansor/shared.
export {
  createAdmissionWaveSchema as createWaveSchema,
  updateAdmissionWaveSchema as updateWaveSchema,
  type CreateAdmissionWaveInput as CreateWaveInput,
  type UpdateAdmissionWaveInput as UpdateWaveInput,
} from '@cipansor/shared';

// =====================================
// REGISTRANT WAVE SCHEMAS
// =====================================

export const assignWaveSchema = z.object({
  registrantId: z.string().uuid(),
  waveId: z.string().uuid(),
});

export const listRegistrantsByWaveSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  status: z.string().optional(),
});

// =====================================
// TYPE EXPORTS
// =====================================

export type ListWaveQuery = z.infer<typeof listWaveQuerySchema>;
export type AssignWaveInput = z.infer<typeof assignWaveSchema>;
export type ListRegistrantsByWaveQuery = z.infer<typeof listRegistrantsByWaveSchema>;
