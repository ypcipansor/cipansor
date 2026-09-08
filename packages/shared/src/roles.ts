/**
 * Role-code vocabulary shared by the API and the web app.
 *
 * The database enum in `apps/api/prisma/schema.prisma` (`RoleCode`) is the
 * source of truth for WHICH codes exist; this module is the source of truth
 * for how they are GROUPED (admin, teacher-level, staff, ...) and how they
 * map back to the six legacy `UserRole` buckets. Before this module, those
 * groupings were hand-mirrored in three places (`apps/api` auth middleware,
 * `apps/web` rbac helpers, `apps/web` navigation config) and had already
 * drifted apart.
 *
 * `apps/api` has a sync test asserting these string values exactly match the
 * Prisma enum — if you add a RoleCode to the schema, add it here too.
 */

const SCHOOL_PREFIXES = ["TKQ", "SDIT", "SMPIT", "SMAQ"] as const;

/** `perSchool("GURU")` → `["TKQ_GURU", "SDIT_GURU", "SMPIT_GURU", "SMAQ_GURU"]` */
const perSchool = (suffix: string): string[] =>
  SCHOOL_PREFIXES.map((p) => `${p}_${suffix}`);

// ---------------------------------------------------------------------------
// Functional groups
// ---------------------------------------------------------------------------

/** System administrators: full administrative UI + admin-only API routes. */
export const ADMIN_ROLE_CODES: readonly string[] = [
  "SUPER_ADMIN",
  ...perSchool("ADMIN"),
];

/**
 * Yayasan governance (board members, auditors, treasurer, ...). Elevated
 * foundation-level oversight, deliberately NOT system administrators.
 */
export const GOVERNANCE_ROLE_CODES: readonly string[] = [
  "YAYASAN_PEMBINA",
  "YAYASAN_KETUA",
  "YAYASAN_SEKRETARIS",
  "YAYASAN_BENDAHARA",
  "YAYASAN_ANGGOTA",
  "YAYASAN_PENGAWAS",
];

/** Kepala sekolah — educational leadership, not system administration. */
export const PRINCIPAL_ROLE_CODES: readonly string[] = perSchool("KEPALA_SEKOLAH");

/** Wakil kepala sekolah. */
export const VICE_PRINCIPAL_ROLE_CODES: readonly string[] = perSchool("WAKASEK");

/** Classroom teachers, homeroom teachers, and BK counselors. */
export const SCHOOL_TEACHER_ROLE_CODES: readonly string[] = [
  ...perSchool("GURU"),
  ...perSchool("WALI_KELAS"),
  // BK counselors exist only at the secondary units (TK Qur'an and SD IT
  // have none), matching the RoleCode enum.
  "SMPIT_GURU_BK",
  "SMAQ_GURU_BK",
];

/** Pesantren leadership (kyai / operational director). */
export const PESANTREN_LEADER_ROLE_CODES: readonly string[] = [
  "PESANTREN_PENGASUH",
  "PESANTREN_DIREKTUR",
];

/** Pesantren educators & dormitory mentors (incl. gender-segregated variants). */
export const PESANTREN_EDUCATOR_ROLE_CODES: readonly string[] = [
  "USTADZ",
  "MUSYRIF",
  "MUSYRIFAH",
  "MUHAFIDZ",
  "MUHAFIDZAH",
  "MURABBI",
  "WALI_KAMAR",
];

/** Perguruan Tinggi academic leadership & lecturers. */
export const PT_ACADEMIC_ROLE_CODES: readonly string[] = [
  "PT_REKTOR",
  "PT_WAKIL_REKTOR",
  "PT_DEKAN",
  "PT_KAPRODI",
  "PT_DOSEN",
];

/** Tata usaha (administrative office) across school units, pesantren, and PT. */
export const TATA_USAHA_ROLE_CODES: readonly string[] = [
  ...perSchool("TATA_USAHA"),
  "PESANTREN_TATA_USAHA",
  "PT_TATA_USAHA",
];

/** Unit treasurers (yayasan treasurer is in GOVERNANCE_ROLE_CODES). */
export const BENDAHARA_ROLE_CODES: readonly string[] = perSchool("BENDAHARA");

/** Cross-unit support staff mapped to concrete service modules. */
export const SUPPORT_ROLE_CODES: readonly string[] = [
  "PUSTAKAWAN",
  "PERAWAT",
  "KEAMANAN",
  "LABORAN",
];

/** Business-unit personnel (kantin, laundry, koperasi, ...). */
export const BUSINESS_ROLE_CODES: readonly string[] = [
  "BUSINESS_MANAGER",
  "BUSINESS_STAFF",
];

/** PT non-academic staff (PT_TATA_USAHA already counts as tata usaha). */
export const PT_STAFF_ROLE_CODES: readonly string[] = ["PT_STAF_AKADEMIK"];

/** Students across school units + PT. TK Qur'an has no per-student SISWA role. */
export const STUDENT_ROLE_CODES: readonly string[] = [
  "SDIT_SISWA",
  "SMPIT_SISWA",
  "SMAQ_SISWA",
  "PT_MAHASISWA",
];

/** Parents/guardians. */
export const PARENT_ROLE_CODES: readonly string[] = perSchool("ORANG_TUA");

/** School committees (komite sekolah). */
export const KOMITE_ROLE_CODES: readonly string[] = perSchool("KOMITE");

/** Alumni across the secondary units + PT (no TK Qur'an / SD IT alumni role). */
export const ALUMNI_ROLE_CODES: readonly string[] = [
  "SMPIT_ALUMNI",
  "SMAQ_ALUMNI",
  "PT_ALUMNI",
];

/** External roles (students, parents, alumni, komite) that cannot participate in E-Office correspondence. */
export const EXCLUDED_CORRESPONDENCE_ROLES: readonly string[] = [
  ...STUDENT_ROLE_CODES,
  ...PARENT_ROLE_CODES,
  ...KOMITE_ROLE_CODES,
  ...ALUMNI_ROLE_CODES,
];

/** Every RoleCode in the system — must equal the Prisma enum exactly. */
export const ALL_ROLE_CODES: readonly string[] = [
  ...ADMIN_ROLE_CODES,
  ...GOVERNANCE_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...VICE_PRINCIPAL_ROLE_CODES,
  ...SCHOOL_TEACHER_ROLE_CODES,
  ...PESANTREN_LEADER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
  ...PT_ACADEMIC_ROLE_CODES,
  ...TATA_USAHA_ROLE_CODES,
  ...BENDAHARA_ROLE_CODES,
  ...SUPPORT_ROLE_CODES,
  ...BUSINESS_ROLE_CODES,
  ...PT_STAFF_ROLE_CODES,
  ...STUDENT_ROLE_CODES,
  ...PARENT_ROLE_CODES,
  ...KOMITE_ROLE_CODES,
  ...ALUMNI_ROLE_CODES,
];

// ---------------------------------------------------------------------------
// Legacy UserRole bridge
// ---------------------------------------------------------------------------

/** The six coarse buckets of the legacy `UserRole` enum. */
export type LegacyRole =
  | "SUPER_ADMIN"
  | "UNIT_ADMIN"
  | "TEACHER"
  | "STAFF"
  | "STUDENT"
  | "PARENT";

export const LEGACY_ROLES: readonly LegacyRole[] = [
  "SUPER_ADMIN",
  "UNIT_ADMIN",
  "TEACHER",
  "STAFF",
  "STUDENT",
  "PARENT",
];

/**
 * Legacy bucket → RoleCodes it expands to. This is the canonical bridge used
 * by the API's `authorize()` for routes still written against `UserRole`.
 *
 * Deliberate exclusions (no legacy bucket): KOMITE_* and ALUMNI_* — they
 * predate nothing; modules serving them must use RoleCode directly.
 */
export const LEGACY_ROLE_EXPANSION: Record<LegacyRole, string[]> = {
  SUPER_ADMIN: ["SUPER_ADMIN"],
  UNIT_ADMIN: [
    ...GOVERNANCE_ROLE_CODES,
    ...perSchool("ADMIN"),
  ],
  TEACHER: [
    ...SCHOOL_TEACHER_ROLE_CODES,
    ...PRINCIPAL_ROLE_CODES,
    ...VICE_PRINCIPAL_ROLE_CODES,
    ...PESANTREN_LEADER_ROLE_CODES,
    ...PESANTREN_EDUCATOR_ROLE_CODES,
    ...PT_ACADEMIC_ROLE_CODES,
  ],
  STAFF: [
    ...TATA_USAHA_ROLE_CODES,
    ...BENDAHARA_ROLE_CODES,
    ...PT_STAFF_ROLE_CODES,
    ...SUPPORT_ROLE_CODES,
    ...BUSINESS_ROLE_CODES,
  ],
  STUDENT: [...STUDENT_ROLE_CODES],
  PARENT: [...PARENT_ROLE_CODES],
};

/**
 * RoleCode → legacy bucket (inverse of LEGACY_ROLE_EXPANSION; first mapping
 * wins). Komite and alumni codes intentionally have no entry.
 */
export const ROLE_CODE_TO_LEGACY: Record<string, LegacyRole> = (() => {
  const map: Record<string, LegacyRole> = {};
  for (const [legacy, codes] of Object.entries(LEGACY_ROLE_EXPANSION) as Array<
    [LegacyRole, string[]]
  >) {
    for (const code of codes) {
      if (!map[code]) map[code] = legacy;
    }
  }
  return map;
})();

/** Type guard: is this string one of the six legacy buckets? */
export function isLegacyRole(value: unknown): value is LegacyRole {
  return typeof value === "string" && (LEGACY_ROLES as string[]).includes(value);
}

/** Derive the legacy bucket for a RoleCode, or `undefined` if unmapped. */
export function legacyRoleFor(roleCode: string): LegacyRole | undefined {
  if (isLegacyRole(roleCode)) return roleCode;
  return ROLE_CODE_TO_LEGACY[roleCode];
}
