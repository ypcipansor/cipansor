import { z } from "zod";
import {
  ADMIN_ROLE_CODES,
  PESANTREN_EDUCATOR_ROLE_CODES,
  PESANTREN_LEADER_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
  SCHOOL_TEACHER_ROLE_CODES,
} from "../roles";
import { AttendanceStatus } from "../types/enums";

/**
 * Daily attendance — one row per pupil, per class, per day
 * (`Attendance @@unique([studentId, classId, date])`), not per lesson.
 *
 * Who records a class's day is a relation, decided per class by the API
 * (`attendance.access.ts`): the class's wali kelas, a teacher with a lesson
 * in the class, and the operator of its unit. The kepala sekolah reads — and
 * records only where they are one of the above. These are the role codes that
 * may reach the write routes at all.
 */
export const ATTENDANCE_RECORDER_ROUTE_ROLE_CODES: readonly string[] = [
  ...SCHOOL_TEACHER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
  ...PESANTREN_LEADER_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...ADMIN_ROLE_CODES,
];

/**
 * A calendar day, "yyyy-MM-dd", as the teacher picked it. Not a datetime: a
 * register taken at 06:45 WIB belongs to that day, which `toISOString()`
 * would move to the day before.
 */
export const attendanceDay = z.iso.date("Tanggal tidak valid (yyyy-MM-dd)");

const status = z.enum(AttendanceStatus);
const notes = z.string().trim().max(500);

/** POST /attendance — one pupil's day. */
export const createAttendanceSchema = z.object({
  studentId: z.uuid("ID siswa tidak valid"),
  classId: z.uuid("ID kelas tidak valid"),
  date: attendanceDay,
  status,
  notes: notes.optional(),
});

/**
 * POST /attendance/bulk — a class's day. Saving the same day again updates
 * the pupils already recorded: the form is how a register is corrected.
 */
export const bulkAttendanceSchema = z.object({
  classId: z.uuid("ID kelas tidak valid"),
  date: attendanceDay,
  records: z
    .array(
      z.object({
        studentId: z.uuid("ID siswa tidak valid"),
        status,
        notes: notes.optional(),
      }),
    )
    .min(1, "Minimal satu siswa")
    .max(200, "Maksimal 200 siswa sekali simpan"),
});

/** PATCH /attendance/:id */
export const updateAttendanceSchema = z.object({
  status: status.optional(),
  notes: notes.nullish(),
});

/** What POST /attendance/bulk did with the class's day. */
export interface BulkAttendanceResult {
  /** Pupils with no record for the day before. */
  created: number;
  /** Pupils whose record for the day was replaced. */
  updated: number;
}

/**
 * A class the caller records daily attendance for, and why:
 * `HOMEROOM` — its wali kelas; `TEACHER` — they have a lesson in it.
 */
export interface AttendanceRecorderClass {
  id: string;
  name: string;
  level?: string | null;
  unit: { id: string; name: string };
  academicYear: { id: string; name: string };
  as: "HOMEROOM" | "TEACHER";
}

/**
 * GET /attendance/me/classes — which classes the caller records:
 * `ALL` — any class (super admin); `UNIT` — any class of `unitId` (the unit's
 * operator); `ASSIGNED` — the classes listed, of the current academic year
 * (empty for someone who records none).
 */
export interface AttendanceRecorderScope {
  scope: "ALL" | "UNIT" | "ASSIGNED";
  unitId: string | null;
  classes: AttendanceRecorderClass[];
}
