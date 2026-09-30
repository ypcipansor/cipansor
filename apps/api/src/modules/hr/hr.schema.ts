import { z } from 'zod';
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

// Self check-in / check-out. Coordinates and a selfie are captured on the
// device; the server decides whether they are required from the policy.
export const selfAttendanceSchema = z.object({
  staffId: z.string().uuid().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  accuracyMeters: z.coerce.number().min(0).optional(),
  photoUrl: z.string().min(1).optional(),
  deviceInfo: z.string().max(500).optional(),
});

// ==================== ATTENDANCE SETTINGS ====================

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:mm');

export const attendanceSiteSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  label: z.string().min(2),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(10).max(5000).default(200),
  isActive: z.boolean().default(true),
});

export const workShiftSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  name: z.string().min(2),
  startTime: timeString,
  endTime: timeString,
  graceMinutes: z.coerce.number().int().min(0).max(180).default(15),
  crossesMidnight: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const shiftAssignmentSchema = z.object({
  staffId: z.string().uuid(),
  shiftId: z.string().uuid(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional(),
  daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).default([]),
});

export const shiftRotationSchema = z.object({
  shiftId: z.string().uuid(),
  name: z.string().min(2),
  memberIds: z.array(z.string().uuid()).min(1),
  startDate: z.string(),
  endDate: z.string().optional(),
  cycleDays: z.coerce.number().int().min(1).max(90).default(7),
  isActive: z.boolean().default(true),
});

export const workWeekConfigSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  workDays: z.array(z.coerce.number().int().min(0).max(6)).min(1),
  hoursPerDay: z.coerce.number().int().min(1).max(12).default(7),
  fridayEndTime: timeString.optional(),
  isActive: z.boolean().default(true),
});

export const attendancePolicySchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  graceMinutes: z.coerce.number().int().min(0).max(180).default(15),
  requireSelfie: z.boolean().default(true),
  requireLocation: z.boolean().default(true),
  outsideRadiusAction: z.enum(['FLAG', 'REJECT']).default('FLAG'),
  photoRetentionDays: z.coerce.number().int().min(1).max(3650).default(365),
  recordRetentionDays: z.coerce.number().int().min(30).max(36500).default(3650),
  isActive: z.boolean().default(true),
});

export const attendanceExemptionSchema = z
  .object({
    roleCode: z.string().optional(),
    staffId: z.string().uuid().optional(),
    reason: z.string().max(500).optional(),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.roleCode || d.staffId, {
    message: 'roleCode atau staffId wajib diisi',
  });

// ==================== PAYROLL POLICY ====================

export const payrollComponentSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2),
  classification: z.enum(['POKOK', 'TETAP', 'TIDAK_TETAP']).default('TIDAK_TETAP'),
  kind: z.enum(['EARNING', 'DEDUCTION']).default('EARNING'),
  taxable: z.boolean().default(true),
  bpjsBase: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const payrollPolicyRuleSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  code: z.string().min(2).max(60),
  kind: z.enum(['EARNING', 'DEDUCTION']).default('DEDUCTION'),
  trigger: z.enum(['LATE', 'ABSENT', 'EARLY_LEAVE', 'PRESENT', 'OVERTIME']),
  basis: z.string().min(2),
  mode: z.enum(['NOMINAL', 'PERSENTASE', 'PRORATA', 'PENGALI', 'BERTINGKAT', 'FORMULA', 'MANUAL']),
  rate: z.coerce.number().optional(),
  unit: z.enum(['PER_MENIT', 'PER_HARI', 'PER_KEJADIAN', 'PER_BULAN']).default('PER_KEJADIAN'),
  tiersJson: z.record(z.string(), z.unknown()).optional(),
  formulaExpr: z.string().max(500).optional(),
  capPerDay: z.coerce.number().optional(),
  capPerMonth: z.coerce.number().optional(),
  rounding: z.enum(['NONE', 'ROUND', 'FLOOR', 'CEIL']).default('NONE'),
  priority: z.coerce.number().int().default(0),
  legalBasisDoc: z.string().max(500).optional(),
  isActive: z.boolean().default(false),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
});

export const payrollGuardConfigSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  maxDeductionPercent: z.coerce.number().int().min(0).max(100).default(50),
  minBasicSharePercent: z.coerce.number().int().min(0).max(100).default(75),
  mustStayAboveUmk: z.boolean().default(true),
  umkNominal: z.coerce.number().optional(),
  isActive: z.boolean().default(true),
});

// ==================== RETENTION ====================

export const retentionPolicySchema = z.object({
  dataType: z.enum(['ATTENDANCE_PHOTO', 'ATTENDANCE_RECORD', 'LEAVE', 'PAYROLL', 'AUDIT_LOG']),
  retentionDays: z.coerce.number().int().min(1).max(36500),
  action: z.enum(['DELETE', 'ANONYMIZE', 'ARCHIVE']).default('DELETE'),
  isActive: z.boolean().default(true),
});

export const leaveTypeConfigSchema = z.object({
  leaveType: z.nativeEnum(LeaveType),
  entitlementDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  periodBasis: z.enum(['CALENDAR_YEAR', 'ACADEMIC_YEAR']).default('CALENDAR_YEAR'),
  isPaid: z.boolean().default(true),
  requiresDocument: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: z.string().max(500).optional(),
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
  email: z.string().email(),
  // Optional: without one a random password is set (see createEmployee).
  password: z.string().min(8).max(256).optional(),
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
  email: z.string().email().optional(),
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
  unitId: z.preprocess((value) => (value === '' ? undefined : value), z.string().uuid().optional()),
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
