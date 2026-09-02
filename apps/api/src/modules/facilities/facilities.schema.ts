import { z } from 'zod';
import { BuildingCondition, LandOwnership } from '@prisma/client';

// ==================== COMMON SCHEMAS ====================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ==================== LAND SCHEMAS ====================

export const listLandsQuerySchema = paginationSchema.extend({
  unitId: z.string().uuid().optional(),
  ownership: z.nativeEnum(LandOwnership).optional(),
  search: z.string().optional(),
});

export const createLandSchema = z.object({
  unitId: z.string().uuid({ message: 'Unit ID harus valid' }),
  code: z.string().min(1, 'Kode tanah wajib diisi').max(50),
  address: z.string().min(5, 'Alamat minimal 5 karakter').max(500),
  area: z.coerce.number().positive('Luas harus lebih dari 0'),
  ownership: z.nativeEnum(LandOwnership, {
    errorMap: () => ({ message: 'Status kepemilikan tidak valid' }),
  }),
  certificateNo: z.string().max(100).optional().nullable(),
  certificateDate: z.coerce.date().optional().nullable(),
  acquisitionDate: z.coerce.date().optional().nullable(),
  acquisitionValue: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateLandSchema = createLandSchema.partial().omit({ unitId: true });

export const landIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Land ID tidak valid' }),
});

// ==================== BUILDING SCHEMAS ====================

export const listBuildingsQuerySchema = paginationSchema.extend({
  unitId: z.string().uuid().optional(),
  landId: z.string().uuid().optional(),
  condition: z.nativeEnum(BuildingCondition).optional(),
  search: z.string().optional(),
});

export const createBuildingSchema = z.object({
  unitId: z.string().uuid({ message: 'Unit ID harus valid' }),
  landId: z.string().uuid({ message: 'Land ID harus valid' }).optional().nullable(),
  code: z.string().min(1, 'Kode gedung wajib diisi').max(50),
  name: z.string().min(2, 'Nama gedung minimal 2 karakter').max(200),
  floors: z.coerce.number().int().positive('Jumlah lantai harus lebih dari 0'),
  buildingArea: z.coerce.number().positive('Luas bangunan harus lebih dari 0'),
  yearBuilt: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional().nullable(),
  condition: z.nativeEnum(BuildingCondition, {
    errorMap: () => ({ message: 'Kondisi gedung tidak valid' }),
  }),
  lastRenovation: z.coerce.date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateBuildingSchema = createBuildingSchema.partial().omit({ unitId: true });

export const buildingIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Building ID tidak valid' }),
});

// ==================== ROOM TYPE SCHEMAS ====================

export const createRoomTypeSchema = z.object({
  code: z.string().min(1, 'Kode tipe ruangan wajib diisi').max(20),
  name: z.string().min(2, 'Nama tipe ruangan minimal 2 karakter').max(100),
  description: z.string().max(500).optional().nullable(),
});

export const updateRoomTypeSchema = createRoomTypeSchema.partial();

export const roomTypeIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Room Type ID tidak valid' }),
});

// ==================== FACILITY ROOM SCHEMAS ====================

export const listRoomsQuerySchema = paginationSchema.extend({
  unitId: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional(),
  roomTypeId: z.string().uuid().optional(),
  condition: z.nativeEnum(BuildingCondition).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().optional(),
});

export const createRoomSchema = z.object({
  unitId: z.string().uuid({ message: 'Unit ID harus valid' }),
  buildingId: z.string().uuid({ message: 'Building ID harus valid' }).optional().nullable(),
  roomTypeId: z.string().uuid({ message: 'Room Type ID harus valid' }),
  code: z.string().min(1, 'Kode ruangan wajib diisi').max(50),
  name: z.string().min(2, 'Nama ruangan minimal 2 karakter').max(200),
  floor: z.coerce.number().int().nonnegative('Lantai tidak boleh negatif'),
  length: z.coerce.number().positive('Panjang harus lebih dari 0').optional().nullable(),
  width: z.coerce.number().positive('Lebar harus lebih dari 0').optional().nullable(),
  area: z.coerce.number().positive('Luas harus lebih dari 0').optional().nullable(),
  capacity: z.coerce
    .number()
    .int()
    .nonnegative('Kapasitas tidak boleh negatif')
    .optional()
    .nullable(),
  condition: z.nativeEnum(BuildingCondition, {
    errorMap: () => ({ message: 'Kondisi ruangan tidak valid' }),
  }),
  facilities: z.record(z.any()).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateRoomSchema = createRoomSchema.partial().omit({ unitId: true });

export const roomIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Room ID tidak valid' }),
});

// ==================== SUMMARY SCHEMA ====================

export const summaryQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
});

// ==================== TYPE EXPORTS ====================

export type ListLandsQuery = z.infer<typeof listLandsQuerySchema>;
export type CreateLandInput = z.infer<typeof createLandSchema>;
export type UpdateLandInput = z.infer<typeof updateLandSchema>;

export type ListBuildingsQuery = z.infer<typeof listBuildingsQuerySchema>;
export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;
export type UpdateBuildingInput = z.infer<typeof updateBuildingSchema>;

export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>;

export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
