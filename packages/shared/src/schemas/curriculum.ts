import { z } from "zod";
import {
  ADMIN_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
  VICE_PRINCIPAL_ROLE_CODES,
} from "../roles";

/**
 * Mata pelajaran and the teachers who teach them (guru pengampu).
 *
 * Until 2026-09-26 the web and the API described a subject differently: the
 * web offered types REQUIRED/ELECTIVE that the API rejects, a `hoursPerWeek`
 * no column holds, edits as PUT to a PATCH route, and "teacher assignments"
 * at a path the API never served. This one contract is read by both sides.
 */

/** `SubjectType` in Prisma; a contract test pins the two together. */
export const SUBJECT_TYPE_VALUES = [
  "ACADEMIC",
  "RELIGIOUS",
  "TAHFIDZ",
  "EXTRACURRICULAR",
] as const;
export type SubjectType = (typeof SUBJECT_TYPE_VALUES)[number];

/**
 * Who adds, edits and removes a unit's subjects and their guru pengampu: the
 * super admin, and within their own unit its admin, its kepala sekolah and
 * its wakasek. A subject belongs to one unit, so every one of them but the
 * super admin is held to that unit by the API. Teachers and the yayasan
 * organs read subjects; they do not write them.
 */
export const CURRICULUM_MANAGER_ROLE_CODES: readonly string[] = [
  ...ADMIN_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...VICE_PRINCIPAL_ROLE_CODES,
];

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const createSubjectSchema = z.object({
  unitId: z.uuid("Unit wajib dipilih"),
  code: z
    .string()
    .trim()
    .min(2, "Kode minimal 2 karakter")
    .max(10, "Kode maksimal 10 karakter")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(100),
  type: z.enum(SUBJECT_TYPE_VALUES, "Jenis mata pelajaran wajib dipilih"),
  description: optionalText(2000),
  /** Jam pelajaran per minggu. */
  credits: z
    .number()
    .int()
    .min(1, "Minimal 1 JP per minggu")
    .max(40, "Maksimal 40 JP per minggu")
    .default(2),
  /** Kelas yang diajar, as written by the school: "7, 8, 9" or "1-6". */
  level: optionalText(50),
  /** KKM. */
  passingScore: z
    .number()
    .min(0, "KKM minimal 0")
    .max(100, "KKM maksimal 100")
    .default(70),
  isActive: z.boolean().default(true),
});
export type CreateSubjectInput = z.input<typeof createSubjectSchema>;
/** A subject's unit never changes; the API builds its update schema from this. */
export type UpdateSubjectInput = Partial<Omit<CreateSubjectInput, "unitId">>;

export const assignTeacherSubjectSchema = z.object({
  teacherId: z.uuid("Guru wajib dipilih"),
  subjectId: z.uuid("Mata pelajaran tidak valid"),
  /** One class of the subject's unit; absent or null for all its classes. */
  classId: z.uuid("Kelas tidak valid").nullish(),
});
export type AssignTeacherSubjectInput = z.input<
  typeof assignTeacherSubjectSchema
>;

/** A guru pengampu as the API sends it with a subject. */
export interface TeacherSubject {
  id: string;
  teacherId: string;
  subjectId: string;
  classId: string | null;
  isActive: boolean;
  teacher: {
    id: string;
    nip: string | null;
    unitId: string | null;
    user: { id: string; name: string };
  };
  class: { id: string; name: string } | null;
}

/** A subject as the API sends it. `passingScore` is a decimal, sent as text. */
export interface Subject {
  id: string;
  unitId: string;
  code: string;
  name: string;
  type: SubjectType;
  description: string | null;
  credits: number;
  level: string | null;
  passingScore: string | number;
  isActive: boolean;
  unit?: { id: string; name: string };
  teacherSubjects?: TeacherSubject[];
  _count?: {
    lessonPlans?: number;
    schedules?: number;
    exams?: number;
    grades?: number;
    /** Active guru pengampu, on the list. */
    teacherSubjects?: number;
  };
  createdAt: string;
  updatedAt: string;
}
