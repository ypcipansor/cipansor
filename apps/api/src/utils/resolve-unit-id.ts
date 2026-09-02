import { Request } from 'express';
import { RoleCode } from '@prisma/client';

/**
 * Resolve the effective unitId for the current request.
 * SUPER_ADMIN users are global and may optionally specify a unitId via
 * query string to scope their operation.
 * Non-SUPER_ADMIN users MUST use the unitId from their JWT to prevent
 * cross-unit access via query parameter injection.
 *
 * NOTE: Only the query string (and JWT for non-SUPER_ADMIN) is consulted —
 * the request body is intentionally NOT checked because every write route
 * in the codebase validates its body with a Zod schema that either uses
 * `.strict()` (rejects unknown fields) or lacks a `unitId` property (strips
 * it by default). A `req.body.unitId` fallback would therefore be dead code
 * and misleading documentation for API consumers. SUPER_ADMIN callers MUST
 * supply the unitId via `?unitId=...` on the query string.
 */
export function resolveUnitId(req: Request): string | undefined {
  // SUPER_ADMIN is checked first so that a SUPER_ADMIN who happens to have
  // a unitId in their JWT (e.g. assigned to a specific unit) can still
  // operate globally by omitting the unitId query param.
  if (req.user?.roleCode === RoleCode.SUPER_ADMIN) {
    return (req.query.unitId as string | undefined)
      || req.user?.unitId
      || undefined;
  }
  // Non-SUPER_ADMIN users: always use JWT unitId (never trust query/body)
  if (req.user?.unitId) {
    return req.user.unitId;
  }
  // Non-SUPER_ADMIN with no unitId in JWT — cannot resolve
  return undefined;
}

/**
 * Boolean helper to check if the current request is from a SUPER_ADMIN user.
 *
 * NOTE: Named `isSuperAdminUser` (not `isSuperAdmin`) to avoid name collision
 * with the Express middleware `isSuperAdmin` exported from
 * `@/middleware/auth`, which has signature `(req, res, next)` and is used
 * directly in route definitions. Importing both into the same file would
 * otherwise require aliasing.
 */
export function isSuperAdminUser(req: Request): boolean {
  return req.user?.roleCode === RoleCode.SUPER_ADMIN;
}

/**
 * Roles whose remit is the whole foundation rather than one unit.
 *
 * The yayasan board oversees every unit and holds the `*_VIEW` permissions to
 * match (see YAYASAN_OVERSIGHT in modules/roles/permissions.ts), but its users
 * have no `unitId` — there is no single unit they belong to. Services that
 * scoped with `where.unitId = currentUser.unitId || 'none'` therefore returned
 * nothing at all for them: the Ketua Yayasan opened /units and was told
 * "Belum ada unit" while five units existed.
 *
 * The reason it looked correct in review is that `deriveLegacyRole()` maps
 * every YAYASAN_* code onto the legacy 'UNIT_ADMIN' string, so a check written
 * as `role !== SUPER_ADMIN` silently classified the board as unit admins. Any
 * scoping decision must be made on `roleCode`, never on the legacy `role`.
 */
export const FOUNDATION_SCOPE_ROLES: readonly string[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_SEKRETARIS,
  RoleCode.YAYASAN_BENDAHARA,
  RoleCode.YAYASAN_ANGGOTA,
  RoleCode.YAYASAN_PENGAWAS,
];

/**
 * True when the role sees across all units rather than being pinned to one.
 *
 * This grants *breadth*, not power: what a foundation role may do with what it
 * can see is still decided by its permission list. Use it only to widen a
 * `where` clause, never to skip an authorize() check.
 */
export function isFoundationScopedRole(roleCode?: string | null): boolean {
  return !!roleCode && FOUNDATION_SCOPE_ROLES.includes(roleCode);
}

/**
 * Leadership roles across Foundation, Schools/Units, Pesantren, and Higher Education.
 */
export const LEADERSHIP_ROLES: readonly string[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.YAYASAN_KETUA,
  RoleCode.YAYASAN_PEMBINA,
  RoleCode.YAYASAN_PENGAWAS,
  RoleCode.YAYASAN_SEKRETARIS,
  RoleCode.YAYASAN_BENDAHARA,
  RoleCode.YAYASAN_ANGGOTA,
  RoleCode.TKQ_ADMIN,
  RoleCode.SDIT_ADMIN,
  RoleCode.SMPIT_ADMIN,
  RoleCode.SMAQ_ADMIN,
  RoleCode.TKQ_KEPALA_SEKOLAH,
  RoleCode.SDIT_KEPALA_SEKOLAH,
  RoleCode.SMPIT_KEPALA_SEKOLAH,
  RoleCode.SMAQ_KEPALA_SEKOLAH,
  RoleCode.PESANTREN_PENGASUH,
  RoleCode.PESANTREN_DIREKTUR,
  RoleCode.PT_REKTOR,
  RoleCode.PT_WAKIL_REKTOR,
  RoleCode.PT_DEKAN,
  RoleCode.PT_KAPRODI,
];

/**
 * Helper to check if a user role belongs to unit or foundation leadership.
 */
export function isLeadershipRole(roleCode?: string | null): boolean {
  return !!roleCode && LEADERSHIP_ROLES.includes(roleCode as RoleCode);
}

/**
 * Roles that work across the academic units rather than inside one.
 *
 * The asrama houses santri from SD IT, SMP IT and SMA Qur'an together, and the
 * shared services — klinik, perpustakaan, keamanan, laboratorium — serve the
 * whole campus. None of these people belong to a school, but the data model
 * gives a user exactly one `unitId`, so the seed assigns them to SMP IT
 * because that is where most santri are.
 *
 * That made their unit-scoped queries return *most* of the right rows and
 * silently drop the rest: a muhafidz opening tahfidz records simply could not
 * see the SD IT santri they teach, with nothing to indicate rows were missing.
 * Granting breadth here is what actually matches the job.
 */
export const CROSS_UNIT_SCOPE_ROLES: readonly string[] = [
  RoleCode.PESANTREN_PENGASUH,
  RoleCode.PESANTREN_DIREKTUR,
  RoleCode.PESANTREN_TATA_USAHA,
  RoleCode.USTADZ,
  RoleCode.MUSYRIF,
  RoleCode.MUSYRIFAH,
  RoleCode.MUHAFIDZ,
  RoleCode.MUHAFIDZAH,
  RoleCode.MURABBI,
  RoleCode.WALI_KAMAR,
  RoleCode.KEAMANAN,
  RoleCode.PERAWAT,
  RoleCode.PUSTAKAWAN,
  RoleCode.LABORAN,
];

/**
 * True when the role's remit spans every unit — the foundation board, or the
 * boarding and shared-service staff.
 *
 * Like isFoundationScopedRole this only ever *widens* a `where` clause. What
 * the role may do with the rows it can now see is still its permission list.
 */
export function seesAllUnits(user: {
  roleCode?: string | null;
  /**
   * Legacy UserRole. Consulted **only** to recognise SUPER_ADMIN, for callers
   * that predate roleCode and still pass `role` alone. It is deliberately not
   * used for anything else: deriveLegacyRole() maps every YAYASAN_* code onto
   * 'UNIT_ADMIN', so trusting `role` generally is exactly what hid the
   * foundation board's scope in the first place.
   */
  role?: string | null;
}): boolean {
  if (user.role === RoleCode.SUPER_ADMIN) return true;
  return (
    isFoundationScopedRole(user.roleCode) ||
    (!!user.roleCode && CROSS_UNIT_SCOPE_ROLES.includes(user.roleCode))
  );
}
