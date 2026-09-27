import {
  ADMIN_ROLE_CODES,
  PESANTREN_EDUCATOR_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
  SCHOOL_TEACHER_ROLE_CODES,
} from "../roles";

/**
 * Wali kelas — the homeroom teacher of a class, `Class.homeroomTeacherId`.
 * It is a duty of a guru for one class in one academic year, not a role
 * (decided 2026-09-26, `.claude/memory/decisions/peran-dan-tugas-tambahan.md`).
 *
 * Who reaches the homeroom routes at all: teachers — whether a teacher is the
 * wali kelas of a class is decided per class by the API — and the unit's
 * kepala sekolah and operator, who read. The yayasan organs, tata usaha,
 * bendahara, students and wali are not here.
 */
export const HOMEROOM_ROUTE_ROLE_CODES: readonly string[] = [
  ...SCHOOL_TEACHER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...ADMIN_ROLE_CODES,
];

/**
 * What an account may do with one class's homeroom data:
 * - `HOMEROOM` — the class's wali kelas: reads, and writes notes while the
 *   class's academic year is the current one;
 * - `OVERSEER` — the kepala sekolah and the operator of the class's unit, and
 *   the super admin: read.
 * Anyone else does not reach the class (404).
 */
export type HomeroomAccess = "HOMEROOM" | "OVERSEER";

/** How the caller stands towards a class, sent with its homeroom data. */
export interface HomeroomViewer {
  access: HomeroomAccess;
  /** The wali kelas, in the current academic year. */
  canWrite: boolean;
}

/** One class the caller is wali kelas of (GET /homeroom/my-classes). */
export interface MyHomeroomClass {
  id: string;
  name: string;
  level?: string | null;
  unit: { id: string; name: string };
  academicYear: { id: string; name: string };
  /** Today falls inside the class's academic year. */
  isCurrent: boolean;
  _count?: { enrollments: number };
}
