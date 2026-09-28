import { z } from 'zod';
import {
  createDormitorySchema,
  createRoomAssignmentSchema,
  createRoomSchema,
  DORMITORY_GENDER_VALUES,
  updateDormitorySchema,
} from '@cipansor/shared';
import { partialUpdateSchema } from '@/lib/partial';

// The create and update contracts are in @cipansor/shared, which the web
// reads too; only the query and assignment-update schemas live here.
export {
  createDormitorySchema,
  updateDormitorySchema,
  createRoomSchema,
  createRoomAssignmentSchema,
};

/**
 * `z.coerce.boolean()` turns the string "false" into true, so `?isActive=false`
 * listed the active rows. A query flag is the literal "true" or "false" — or
 * the boolean it already became: validateQuery() parses the query and the
 * controller parses the result again.
 */
const queryFlag = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
  .optional();

export const queryDormitorySchema = z.object({
  unitId: z.string().uuid().optional(),
  gender: z.enum(DORMITORY_GENDER_VALUES).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// =====================================
// ROOM SCHEMAS
// =====================================

export const updateRoomSchema = partialUpdateSchema(createRoomSchema).omit({ dormitoryId: true });

export const queryRoomSchema = z.object({
  dormitoryId: z.string().uuid().optional(),
  floor: z.coerce.number().int().positive().optional(),
  isActive: queryFlag,
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// =====================================
// ROOM ASSIGNMENT SCHEMAS
// =====================================

/**
 * Only the note. Moving a santri is a new placement (`POST /assignments`),
 * which checks the asrama's gender, the unit and the kamar's capacity; this
 * route used to accept `roomId` and `isActive` and skipped all three.
 */
export const updateRoomAssignmentSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

export const queryRoomAssignmentSchema = z.object({
  roomId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  isActive: queryFlag,
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Type exports
export type CreateDormitoryDto = z.infer<typeof createDormitorySchema>;
export type UpdateDormitoryDto = z.infer<typeof updateDormitorySchema>;
export type QueryDormitoryDto = z.infer<typeof queryDormitorySchema>;

export type CreateRoomDto = z.infer<typeof createRoomSchema>;
export type UpdateRoomDto = z.infer<typeof updateRoomSchema>;
export type QueryRoomDto = z.infer<typeof queryRoomSchema>;

export type CreateRoomAssignmentDto = z.infer<typeof createRoomAssignmentSchema>;
export type UpdateRoomAssignmentDto = z.infer<typeof updateRoomAssignmentSchema>;
export type QueryRoomAssignmentDto = z.infer<typeof queryRoomAssignmentSchema>;
