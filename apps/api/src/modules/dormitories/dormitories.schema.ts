import { z } from 'zod';
import { Gender } from '@prisma/client';
import { partialUpdateSchema } from '@/lib/partial';

// =====================================
// DORMITORY SCHEMAS
// =====================================

export const createDormitorySchema = z.object({
  /**
   * Unit pengelola. Omitted or null means the asrama is run by the yayasan
   * across units, which is the normal case — see the Dormitory model.
   * The empty string is accepted because an unselected <Select> submits one.
   */
  unitId: z
    .union([z.string().uuid('Invalid unit ID'), z.literal('')])
    .nullish()
    .transform((v) => v || null),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  code: z.string().min(2, 'Code must be at least 2 characters'),
  gender: z.nativeEnum(Gender),
  capacity: z.number().int().positive('Capacity must be positive'),
  address: z.string().optional(),
  description: z.string().optional(),
});

export const updateDormitorySchema = createDormitorySchema.partial();

export const queryDormitorySchema = z.object({
  unitId: z.string().uuid().optional(),
  gender: z.nativeEnum(Gender).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// =====================================
// ROOM SCHEMAS
// =====================================

export const createRoomSchema = z.object({
  dormitoryId: z.string().uuid('Invalid dormitory ID'),
  name: z.string().min(1, 'Name is required'),
  floor: z.number().int().positive().default(1),
  capacity: z.number().int().positive('Capacity must be positive'),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const updateRoomSchema = partialUpdateSchema(createRoomSchema).omit({ dormitoryId: true });

export const queryRoomSchema = z.object({
  dormitoryId: z.string().uuid().optional(),
  floor: z.coerce.number().int().positive().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// =====================================
// ROOM ASSIGNMENT SCHEMAS
// =====================================

export const createRoomAssignmentSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  roomId: z.string().uuid('Invalid room ID'),
  notes: z.string().optional(),
});

export const updateRoomAssignmentSchema = z.object({
  roomId: z.string().uuid('Invalid room ID').optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
  endedAt: z.string().datetime().optional(),
});

export const queryRoomAssignmentSchema = z.object({
  roomId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
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
