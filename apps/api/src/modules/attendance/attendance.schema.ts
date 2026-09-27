import { z } from 'zod';
import { AttendanceStatus } from '@cipansor/shared';
// Query params
export const listAttendanceQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  classId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  date: z.string().optional(), // YYYY-MM-DD
  startDate: z.string().optional(), // YYYY-MM-DD
  endDate: z.string().optional(), // YYYY-MM-DD
  status: z.nativeEnum(AttendanceStatus).optional(),
});

// Create, bulk and update bodies are shared with the web: @cipansor/shared
// schemas/attendance.ts.

// ID param
export const attendanceIdParamSchema = z.object({
  id: z.string().uuid('Invalid attendance ID'),
});

// Summary query
/**
 * Summary filters.
 *
 * `startDate`/`endDate` used to be mandatory, which made two real callers 400:
 * the unit dashboards ask for a single day (`?date=…&unitId=…`) and the
 * student pages ask for one student with no range at all. Both are reasonable
 * questions, so `date` is accepted as a one-day shorthand and an omitted range
 * now means "no date filter" instead of an error. `unitId` lets a super admin
 * scope to one unit; everyone else is already scoped to their own.
 */
export const attendanceSummaryQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  date: z.string().optional(), // YYYY-MM-DD — single day
  startDate: z.string().optional(), // YYYY-MM-DD
  endDate: z.string().optional(), // YYYY-MM-DD
});

// Export inferred types (optional, but we use shared types in service)
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
export type AttendanceSummaryQuery = z.infer<typeof attendanceSummaryQuerySchema>;
