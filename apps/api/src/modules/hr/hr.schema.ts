import { z } from 'zod';
import { normalizeEmail } from '@/utils/email';
import {
  LeaveType,
  LeaveStatus,
  StaffAttendanceStatus,
  UserRole,
  Gender,
  EmploymentStatus,
} from '@prisma/client';

// Staff Attendance schemas
export const createStaffAttendanceSchema = z
  .object({
    staffId: z.string().uuid().optional(),
    teacherId: z.string().uuid().optional(),
    date: z.string().datetime(),
    status: z.nativeEnum(StaffAttendanceStatus).default(StaffAttendanceStatus.PRESENT),
    checkIn: z.string().datetime().optional(),
    checkOut: z.string().datetime().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.staffId || data.teacherId, {
    message: 'Either staffId or teacherId must be provided',
  });

export const updateStaffAttendanceSchema = z.object({
  status: z.nativeEnum(StaffAttendanceStatus).optional(),
  checkIn: z.string().datetime().optional(),
  checkOut: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const bulkAttendanceSchema = z.object({
  date: z.string().datetime(),
  records: z
    .array(
      z.object({
        staffId: z.string().uuid().optional(),
        teacherId: z.string().uuid().optional(),
        status: z.nativeEnum(StaffAttendanceStatus),
        checkIn: z.string().datetime().optional(),
        checkOut: z.string().datetime().optional(),
        notes: z.string().optional(),
      })
    )
    .refine((records) => records.every((r) => r.staffId || r.teacherId), {
      message: 'Each record must have either staffId or teacherId',
    }),
});

export const queryStaffAttendanceSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  staffId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  status: z.nativeEnum(StaffAttendanceStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Leave schemas
export const createLeaveSchema = z.object({
  staffId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  type: z.nativeEnum(LeaveType),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().min(5),
});

export const updateLeaveSchema = z.object({
  type: z.nativeEnum(LeaveType).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  reason: z.string().min(5).optional(),
});

export const approveLeaveSchema = z.object({
  status: z.enum([LeaveStatus.APPROVED, LeaveStatus.REJECTED]),
  rejectedNote: z.string().optional(),
});

export const queryLeaveSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  staffId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  type: z.nativeEnum(LeaveType).optional(),
  status: z.nativeEnum(LeaveStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  mine: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

// Staff/Employee Management Schemas
export const createEmployeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform((v) => normalizeEmail(v)),
  password: z.string().min(6).optional(), // Defaults to 'password123' if empty
  role: z.enum([UserRole.TEACHER, UserRole.STAFF]),
  unitId: z.string().uuid(),
  phone: z.string().optional(),

  // Teacher specific
  nip: z.string().optional(), // Shared with Staff but optional
  nuptk: z.string().optional(),
  gender: z.nativeEnum(Gender).optional(),
  birthPlace: z.string().optional(),
  birthDate: z.string().datetime().optional(),
  address: z.string().optional(),
  nik: z.string().optional(),
  noKK: z.string().optional(),
  religion: z.string().optional(),
  joinDate: z.string().datetime().optional(),
  employmentStatus: z.nativeEnum(EmploymentStatus).optional(),
  specialization: z.string().optional(),
  certificationNumber: z.string().optional(),

  // Staff specific
  position: z.string().optional(), // Required if role is STAFF
  department: z.string().optional(),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().transform((v) => normalizeEmail(v)).optional(),
  unitId: z.string().uuid().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),

  // Profile fields
  nip: z.string().optional(),
  nuptk: z.string().optional(),
  gender: z.nativeEnum(Gender).optional(),
  birthPlace: z.string().optional(),
  birthDate: z.string().datetime().optional(),
  address: z.string().optional(),
  nik: z.string().optional(),
  noKK: z.string().optional(),
  religion: z.string().optional(),
  joinDate: z.string().datetime().optional(),
  employmentStatus: z.nativeEnum(EmploymentStatus).optional(),
  specialization: z.string().optional(),
  certificationNumber: z.string().optional(),

  position: z.string().optional(),
  department: z.string().optional(),
});

/**
 * Query for `GET /hr/employees` — the flat employee directory.
 *
 * The web declares `status` as the full lifecycle union, but the database only
 * distinguishes active from inactive, so only those two are accepted here: a
 * caller asking for RESIGNED would be answered with a filtered-empty lie
 * otherwise, and a 400 is the honest reply.
 */
export const queryEmployeesSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unitId: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().uuid().optional()
  ),
  role: z.enum([UserRole.TEACHER, UserRole.STAFF]).optional(),
  status: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['ACTIVE', 'INACTIVE']).optional()
  ),
  search: z.string().optional(),
});

export type QueryEmployeesInput = z.infer<typeof queryEmployeesSchema>;

export const queryStaffSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unitId: z.string().uuid().optional(),
  department: z.string().optional(),
  search: z.string().optional(),
});

export const queryTeachersSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  // Some callers send an empty string while their unit filter hydrates
  unitId: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().uuid().optional()
  ),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).optional(),
  search: z.string().optional(),
});

export type QueryTeachersInput = z.infer<typeof queryTeachersSchema>;

export type CreateStaffAttendanceInput = z.infer<typeof createStaffAttendanceSchema>;
export type UpdateStaffAttendanceInput = z.infer<typeof updateStaffAttendanceSchema>;
export type BulkAttendanceInput = z.infer<typeof bulkAttendanceSchema>;
export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;
export type UpdateLeaveInput = z.infer<typeof updateLeaveSchema>;
export type ApproveLeaveInput = z.infer<typeof approveLeaveSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
