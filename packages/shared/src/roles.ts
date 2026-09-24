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

/**
 * Roles whose remit is the whole foundation, so a unit is optional for them.
 *
 * A governance role or a Super Admin may act across every unit and may file a
 * record addressed to the foundation as a whole; a unit admin is pinned to its
 * own unit. This is the shared predicate the web uses to decide whether to
 * offer a unit chooser and the API uses to decide whether a caller-supplied
 * unit is a choice or must be overridden with the caller's own.
 *
 * Mirrors `FOUNDATION_WIDE_ROLES` in `apps/api/src/modules/pengawasan/…`.
 */
export const FOUNDATION_WIDE_ROLE_CODES: readonly string[] = [
  "SUPER_ADMIN",
  ...GOVERNANCE_ROLE_CODES,
];

export function isFoundationWideRoleCode(roleCode?: string | null): boolean {
  return roleCode ? FOUNDATION_WIDE_ROLE_CODES.includes(roleCode) : false;
}

/**
 * Pengurus — the organ that RUNS the yayasan (UU 16/2001 Pasal 31 ayat 1), and
 * so the only one that drafts its plans. Pembina ratifies the work programme
 * and annual budget (Pasal 28 ayat 2 huruf d); Pengawas supervises and advises
 * (Pasal 40 ayat 1). Neither authors the documents they then judge.
 */
export const PENGURUS_ROLE_CODES: readonly string[] = [
  "YAYASAN_KETUA",
  "YAYASAN_SEKRETARIS",
  "YAYASAN_BENDAHARA",
  "YAYASAN_ANGGOTA",
];

/** Kepala sekolah — educational leadership, not system administration. */
export const PRINCIPAL_ROLE_CODES: readonly string[] =
  perSchool("KEPALA_SEKOLAH");

/** Wakil kepala sekolah. */
export const VICE_PRINCIPAL_ROLE_CODES: readonly string[] =
  perSchool("WAKASEK");

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

/** Tata usaha (administrative office) across school units and pesantren. */
export const TATA_USAHA_ROLE_CODES: readonly string[] = [
  ...perSchool("TATA_USAHA"),
  "PESANTREN_TATA_USAHA",
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

/** Students across school units. TK Qur'an has no per-student SISWA role. */
export const STUDENT_ROLE_CODES: readonly string[] = [
  "SDIT_SISWA",
  "SMPIT_SISWA",
  "SMAQ_SISWA",
];

/** Parents/guardians. */
export const PARENT_ROLE_CODES: readonly string[] = perSchool("ORANG_TUA");

/** School committees (komite sekolah). */
export const KOMITE_ROLE_CODES: readonly string[] = perSchool("KOMITE");

/** Alumni across the secondary units (no TK Qur'an / SD IT alumni role). */
export const ALUMNI_ROLE_CODES: readonly string[] = [
  "SMPIT_ALUMNI",
  "SMAQ_ALUMNI",
];

/**
 * Menulis data alumni (alumni, karier, pendidikan, donasi, acara, kehadiran) —
 * admin dan tata usaha, di lingkup unitnya. Satu sumber untuk API
 * (`modules/alumni/alumni-access.ts`) dan web (tombol di halaman Alumni).
 */
export const ALUMNI_WRITE_ROLE_CODES: readonly string[] = [
  ...ADMIN_ROLE_CODES,
  ...TATA_USAHA_ROLE_CODES,
];

/**
 * Membaca kontak, data diri, dan analisis nilai per alumni — pengelola ditambah
 * kepala sekolah dan organ yayasan. Akun lain melihat direktori tanpa semua itu.
 */
export const ALUMNI_PERSONAL_DATA_ROLE_CODES: readonly string[] = [
  ...ALUMNI_WRITE_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...GOVERNANCE_ROLE_CODES,
];

/** External roles (students, parents, alumni, komite) that cannot participate in E-Office correspondence. */
export const EXCLUDED_CORRESPONDENCE_ROLES: readonly string[] = [
  ...STUDENT_ROLE_CODES,
  ...PARENT_ROLE_CODES,
  ...KOMITE_ROLE_CODES,
  ...ALUMNI_ROLE_CODES,
];

/**
 * Roles that handle a unit's correspondence as part of the job: the office
 * that registers and files letters, and the head who signs them.
 *
 * Single source of truth for the E-Office "Edit Naskah Surat" UI toggle and
 * the API's letter-access guard (`apps/api/src/utils/letter-access.ts`), so
 * the two can never drift apart again. The API has a sync test
 * (`apps/api/src/middleware/roles-sync.test.ts`) asserting the grouped
 * strings match the `RoleCode` Prisma enum exactly.
 *
 * Deliberately an explicit list rather than a permission string: introducing a
 * LETTER_* permission would mean editing the role→permission matrix and would
 * only take effect after every existing JWT expired; an allowlist checked at
 * request time is auditable in one place and correct immediately.
 */
export const LETTER_UNIT_SCOPE_ROLES: readonly string[] = [
  ...TATA_USAHA_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...perSchool("ADMIN"),
];

/**
 * Foundation/executive roles that may edit a letter's naskah too — the
 * API's `updateLetter` grants the creator, these executive roles, and any
 * `LETTER_UNIT_SCOPE_ROLES` holder (via `handlesUnitCorrespondence`).
 */
export const LETTER_EDIT_EXECUTIVE_ROLES: readonly string[] = [
  "SUPER_ADMIN",
  "YAYASAN_KETUA",
  "YAYASAN_SEKRETARIS",
];

/**
 * True when a role code may edit a letter's naskah (excluding the "is the
 * creator" check, which is by user id). Mirrors `updateLetter` on the API so
 * the E-Office "Edit Naskah Surat" UI toggle and the server guard read the
 * same source.
 */
export function mayEditLetter(roleCode: string | null | undefined): boolean {
  if (!roleCode) return false;
  return (
    LETTER_UNIT_SCOPE_ROLES.includes(roleCode) ||
    LETTER_EDIT_EXECUTIVE_ROLES.includes(roleCode)
  );
}

/** Every RoleCode in the system — must equal the Prisma enum exactly. */
export const ALL_ROLE_CODES: readonly string[] = [
  ...ADMIN_ROLE_CODES,
  ...GOVERNANCE_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...VICE_PRINCIPAL_ROLE_CODES,
  ...SCHOOL_TEACHER_ROLE_CODES,
  ...PESANTREN_LEADER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
  ...TATA_USAHA_ROLE_CODES,
  ...BENDAHARA_ROLE_CODES,
  ...SUPPORT_ROLE_CODES,
  ...BUSINESS_ROLE_CODES,
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
  "SUPER_ADMIN" | "UNIT_ADMIN" | "TEACHER" | "STAFF" | "STUDENT" | "PARENT";

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
  UNIT_ADMIN: [...GOVERNANCE_ROLE_CODES, ...perSchool("ADMIN")],
  TEACHER: [
    ...SCHOOL_TEACHER_ROLE_CODES,
    ...PRINCIPAL_ROLE_CODES,
    ...VICE_PRINCIPAL_ROLE_CODES,
    ...PESANTREN_LEADER_ROLE_CODES,
    ...PESANTREN_EDUCATOR_ROLE_CODES,
  ],
  STAFF: [
    ...TATA_USAHA_ROLE_CODES,
    ...BENDAHARA_ROLE_CODES,
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
  return (
    typeof value === "string" && (LEGACY_ROLES as string[]).includes(value)
  );
}

/** Derive the legacy bucket for a RoleCode, or `undefined` if unmapped. */
export function legacyRoleFor(roleCode: string): LegacyRole | undefined {
  if (isLegacyRole(roleCode)) return roleCode;
  return ROLE_CODE_TO_LEGACY[roleCode];
}

// ---------------------------------------------------------------------------
// Pengawasan governance (WBS & board suspension)
// ---------------------------------------------------------------------------

/**
 * The governance permissions a web page shows controls for, matched to the
 * `authorize(...)` lists in `apps/api/src/modules/pengawasan/pengawasan.routes.ts`.
 *
 * The governance page rendered every action to every visitor who could open it,
 * so a Pengawas saw "Pulihkan Status" and "Tetapkan SK" buttons that the API
 * answered with a 403 — the page and the policy disagreed about what a role may
 * do. These lists are the single definition both sides read, so a control is
 * only shown when the request behind it will be accepted. Scope (which unit or
 * report) is still the API's decision; this is authorization, not ownership.
 */

/**
 * Read/list access to board suspensions and their scoped pickers.
 *
 * The Pembina may *see* the register — it is the organ that appoints and
 * dismisses (UU 16/2001 Pasal 28), so oversight of who is currently frozen is
 * theirs — but read access is deliberately NOT the same grant as issuing an SK.
 * The three grants (read, issue, lift) used to be one list, which meant every
 * role that could open the tab could also mint a suspension and a Plh role.
 */
export const PENGAWASAN_SUSPENSION_READ_ROLES: readonly string[] = [
  "SUPER_ADMIN",
  "YAYASAN_PENGAWAS",
  "YAYASAN_PEMBINA",
];

/**
 * Issuing an SK Pembekuan (and enumerating the suspend/Plh candidate lists).
 *
 * Reserved for the Pengawas — the oversight organ that audits the Pengurus —
 * and Super Admin for operational recovery. The Pembina is intentionally
 * excluded: it is the body that *appoints* the Pengurus, so letting it also
 * freeze them through the oversight endpoint collapses the separation between
 * the appointing organ and the supervising one, and lets the same officer
 * suspend and (as lifter) restore with no second signature. The service
 * re-enforces this, so an internal caller cannot bypass the route.
 */
export const PENGAWASAN_SUSPENSION_ISSUE_ROLES: readonly string[] = [
  "SUPER_ADMIN",
  "YAYASAN_PENGAWAS",
];

/**
 * @deprecated Use {@link PENGAWASAN_SUSPENSION_READ_ROLES} (list) or
 * {@link PENGAWASAN_SUSPENSION_ISSUE_ROLES} (issuance). Kept as an alias of the
 * read list so any consumer that only gates visibility keeps compiling; the
 * API's write routes no longer read it.
 */
export const PENGAWASAN_SUSPENSION_ROLES: readonly string[] =
  PENGAWASAN_SUSPENSION_READ_ROLES;

/** Pemulihan status is the Pembina's, with Super Admin for operational recovery. */
export const PENGAWASAN_LIFT_ROLES: readonly string[] = [
  "SUPER_ADMIN",
  "YAYASAN_PEMBINA",
];

/** Periodic oversight report submission. */
export const PENGAWASAN_PERIODIC_REPORT_ROLES: readonly string[] = [
  "SUPER_ADMIN",
  "YAYASAN_PENGAWAS",
];

/** WBS handling: governance plus principals, unit admins and their buckets. */
export const PENGAWASAN_WBS_HANDLER_ROLES: readonly string[] = [
  ...GOVERNANCE_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...ADMIN_ROLE_CODES,
];

/** Reads the arrears oversight report. */
export const PENGAWASAN_ARREARS_ROLES: readonly string[] = [
  ...GOVERNANCE_ROLE_CODES,
  ...ADMIN_ROLE_CODES,
  ...BENDAHARA_ROLE_CODES,
];

/** Writes audits, findings and follow-up deletions. */
export const PENGAWASAN_AUDIT_WRITE_ROLES: readonly string[] = [
  "SUPER_ADMIN",
  "YAYASAN_PENGAWAS",
  ...ADMIN_ROLE_CODES,
  ...GOVERNANCE_ROLE_CODES,
];

/** Reads audits, and submits follow-ups, at unit level. */
export const PENGAWASAN_AUDIT_GENERAL_ROLES: readonly string[] = [
  ...GOVERNANCE_ROLE_CODES,
  ...ADMIN_ROLE_CODES,
  ...SCHOOL_TEACHER_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...VICE_PRINCIPAL_ROLE_CODES,
  ...PESANTREN_LEADER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
  ...TATA_USAHA_ROLE_CODES,
  ...BENDAHARA_ROLE_CODES,
  ...SUPPORT_ROLE_CODES,
  ...BUSINESS_ROLE_CODES,
];

/**
 * The governance actions a role may take, resolved from the lists above. One
 * function for both the page and its tests, so the visibility rule is exercised
 * once instead of re-derived per control.
 */
export function pengawasanAccessOf(roleCode: string | null | undefined) {
  const code = roleCode ?? "";
  const has = (list: readonly string[]) => list.includes(code);
  return {
    /** Can *see* the register and its tabs (read/list). */
    canReadSuspensions: has(PENGAWASAN_SUSPENSION_READ_ROLES),
    /** Can issue an SK Pembekuan and enumerate the candidate pickers. */
    canIssueSuspension: has(PENGAWASAN_SUSPENSION_ISSUE_ROLES),
    /**
     * @deprecated Retained for a control that only needs the tab to render.
     * Use `canReadSuspensions` for visibility and `canIssueSuspension` for the
     * button that posts the SK. The page no longer offers issuance on this.
     */
    canManageSuspensions: has(PENGAWASAN_SUSPENSION_READ_ROLES),
    canLiftSuspension: has(PENGAWASAN_LIFT_ROLES),
    canSubmitPeriodicReport: has(PENGAWASAN_PERIODIC_REPORT_ROLES),
    canHandleWbs: has(PENGAWASAN_WBS_HANDLER_ROLES),
    canViewArrears: has(PENGAWASAN_ARREARS_ROLES),
    canWriteAudits: has(PENGAWASAN_AUDIT_WRITE_ROLES),
    canReadAudits: has(PENGAWASAN_AUDIT_GENERAL_ROLES),
  };
}
