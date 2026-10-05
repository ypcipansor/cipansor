import { z } from 'zod';
import {
  EXTRACURRICULAR_CATEGORIES,
  EXTRACURRICULAR_STATUSES,
  createExtracurricularSchema,
  updateExtracurricularSchema,
} from '@cipansor/shared';

// Enums matching Prisma
export const ExtracurricularCategory = z.enum(EXTRACURRICULAR_CATEGORIES);

export const ExtracurricularStatus = z.enum(EXTRACURRICULAR_STATUSES);
export const EnrollmentStatus = z.enum(['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'DISMISSED']);
export const DayOfWeek = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);
export const AttendanceStatus = z.enum(['PRESENT', 'ABSENT', 'LATE', 'SICK', 'EXCUSED']);

// List query
export const listExtracurricularsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  unitId: z.string().uuid().optional(),
  category: ExtracurricularCategory.optional(),
  status: ExtracurricularStatus.optional(),
  academicYearId: z.string().uuid().optional(),
  isCompulsory: z.coerce.boolean().optional(),
});

export type ListExtracurricularsQuery = z.infer<typeof listExtracurricularsQuerySchema>;

// Create and update: one contract with the portal's forms (@cipansor/shared).
export { createExtracurricularSchema, updateExtracurricularSchema };
export type CreateExtracurricularInput = z.output<typeof createExtracurricularSchema>;
export type UpdateExtracurricularInput = z.output<typeof updateExtracurricularSchema>;

// Enrollment
export const enrollStudentSchema = z.object({
  extracurricularId: z.string().uuid(),
  studentId: z.string().uuid(),
  notes: z.string().optional(),
});

export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;

// Bulk enrollment
export const bulkEnrollSchema = z.object({
  extracurricularId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1),
});

export type BulkEnrollInput = z.infer<typeof bulkEnrollSchema>;

// Update enrollment
export const updateEnrollmentSchema = z.object({
  status: EnrollmentStatus.optional(),
  grade: z.string().optional(),
  notes: z.string().optional(),
});

export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;

// Attendance record
export const recordAttendanceSchema = z.object({
  extracurricularId: z.string().uuid(),
  date: z.string().datetime().or(z.date()),
  attendances: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: AttendanceStatus,
        notes: z.string().optional(),
      })
    )
    .min(1),
});

export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;

// Achievement
export const createAchievementSchema = z.object({
  extracurricularId: z.string().uuid(),
  studentId: z.string().uuid().optional(), // null for team achievements
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  level: z.string().min(1), // Sekolah, Kecamatan, Kabupaten, Provinsi, Nasional, Internasional
  rank: z.string().optional(), // Juara 1, 2, 3, Harapan, Peserta
  organizer: z.string().optional(),
  eventDate: z.string().datetime().or(z.date()),
  certificateUrl: z.string().url().optional(),
  photoUrl: z.string().url().optional(),
});

export type CreateAchievementInput = z.infer<typeof createAchievementSchema>;

// List enrollments query
export const listEnrollmentsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  extracurricularId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  status: EnrollmentStatus.optional(),
});

export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuerySchema>;

// Attendance query
export const listAttendanceQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  extracurricularId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;

// Achievement query
export const listAchievementsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  extracurricularId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  level: z.string().optional(),
});

export type ListAchievementsQuery = z.infer<typeof listAchievementsQuerySchema>;
