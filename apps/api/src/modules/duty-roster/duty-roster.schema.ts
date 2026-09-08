import { z } from 'zod';
import { partialUpdateSchema } from '@/lib/partial';

// Enums matching Prisma
export const DutyCategory = z.enum([
  'CLEANING',
  'SECURITY',
  'WORSHIP',
  'KITCHEN',
  'LIBRARY',
  'DORMITORY',
  'GARDEN',
  'OTHER',
]);

export const DutyStatus = z.enum(['PENDING', 'COMPLETED', 'ABSENT', 'SUBSTITUTED']);

export const DayOfWeek = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

// List duty types query
export const listDutyTypesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  unitId: z.string().uuid().optional(),
  category: DutyCategory.optional(),
  isActive: z.coerce.boolean().optional(),
});

export type ListDutyTypesQuery = z.infer<typeof listDutyTypesQuerySchema>;

// Create duty type
export const createDutyTypeSchema = z.object({
  unitId: z.string().uuid(),
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20).optional(),
  category: DutyCategory,
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().optional(), // e.g., "05:00"
  endTime: z.string().optional(), // e.g., "06:00"
  isActive: z.boolean().default(true),
});

export type CreateDutyTypeInput = z.infer<typeof createDutyTypeSchema>;

// Update duty type
export const updateDutyTypeSchema = partialUpdateSchema(createDutyTypeSchema);

export type UpdateDutyTypeInput = z.infer<typeof updateDutyTypeSchema>;

// List rosters query
export const listRostersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unitId: z.string().uuid().optional(),
  dutyTypeId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  status: DutyStatus.optional(),
  dayOfWeek: DayOfWeek.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ListRostersQuery = z.infer<typeof listRostersQuerySchema>;

// Create roster
export const createRosterSchema = z.object({
  dutyTypeId: z.string().uuid(),
  studentId: z.string().uuid(),
  date: z.string().datetime().or(z.date()),
  dayOfWeek: DayOfWeek,
  notes: z.string().optional(),
});

export type CreateRosterInput = z.infer<typeof createRosterSchema>;

// Bulk create rosters (for weekly schedule)
export const bulkCreateRostersSchema = z.object({
  dutyTypeId: z.string().uuid(),
  assignments: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        dayOfWeek: DayOfWeek,
      })
    )
    .min(1),
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().or(z.date()),
});

export type BulkCreateRostersInput = z.infer<typeof bulkCreateRostersSchema>;

// Update roster
export const updateRosterSchema = z.object({
  status: DutyStatus.optional(),
  substituteId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export type UpdateRosterInput = z.infer<typeof updateRosterSchema>;

// Mark duty completed
export const completeDutySchema = z.object({
  notes: z.string().optional(),
});

export type CompleteDutyInput = z.infer<typeof completeDutySchema>;

// Assign substitute
export const assignSubstituteSchema = z.object({
  substituteId: z.string().uuid(),
  reason: z.string().optional(),
});

export type AssignSubstituteInput = z.infer<typeof assignSubstituteSchema>;

// Verify duty
export const verifyDutySchema = z.object({
  notes: z.string().optional(),
});

export type VerifyDutyInput = z.infer<typeof verifyDutySchema>;

// Student duty history query
export const studentDutyHistorySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: DutyStatus.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type StudentDutyHistoryQuery = z.infer<typeof studentDutyHistorySchema>;
