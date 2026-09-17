import { RoleCode } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { GOVERNANCE_ROLE_CODES } from '@cipansor/shared';

/**
 * Siapa boleh apa di modul pengawasan, dan atas unit mana.
 *
 * The controller used to carry these two rules itself. That is the one layer
 * whose job is parsing a request and shaping a response; a policy buried in it
 * cannot be reused by the services, cannot be unit-tested without an Express
 * request, and quietly drifts from the route guards that are supposed to agree
 * with it. The rules live here so the controller can delegate and the web side
 * can be told what to show (see `pengawasanAccessOf` in shared).
 */

/**
 * Foundation-wide roles see every unit's records.
 *
 * Written against `RoleCode` rather than the deprecated `UserRole` buckets:
 * `deriveLegacyRole()` maps every `YAYASAN_*` code onto `UNIT_ADMIN`, so a
 * `UserRole.SUPER_ADMIN` comparison silently classified the whole foundation
 * board as unit admins, restricting them to one unit (the bug documented at
 * length in `utils/resolve-unit-id.ts`).
 */
export const FOUNDATION_WIDE_ROLES: readonly string[] = [
  RoleCode.SUPER_ADMIN,
  ...GOVERNANCE_ROLE_CODES,
];

export function isFoundationWide(roleCode?: string | null): boolean {
  return roleCode ? FOUNDATION_WIDE_ROLES.includes(roleCode) : false;
}

export interface PengawasanActor {
  roleCode?: string | null;
  unitId?: string | null;
}

/** True when the actor may act on a record belonging to `recordUnitId`. */
export function canAccessUnit(actor: PengawasanActor, recordUnitId: string | null | undefined): boolean {
  if (isFoundationWide(actor.roleCode)) return true;
  return !!recordUnitId && recordUnitId === actor.unitId;
}

/**
 * Refuse a write to a record outside the actor's unit.
 *
 * `createAudit` / `updateAudit` / `deleteAudit` already did this, but the
 * finding and follow-up handlers did not — so knowing a UUID was enough to
 * write into another unit's audit, even though the record would not appear in
 * that actor's own list. Same check, applied everywhere the unit is derivable
 * from the record's parent. Used by the controller and by the service-level
 * guards that resolve a parent record's unit.
 */
export function assertUnitAccess(actor: PengawasanActor, recordUnitId: string | null | undefined): void {
  if (!canAccessUnit(actor, recordUnitId)) {
    throw Errors.forbidden('Access denied');
  }
}