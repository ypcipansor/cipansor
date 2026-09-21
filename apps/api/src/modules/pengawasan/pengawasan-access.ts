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
export function canAccessUnit(
  actor: PengawasanActor,
  recordUnitId: string | null | undefined
): boolean {
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
export function assertUnitAccess(
  actor: PengawasanActor,
  recordUnitId: string | null | undefined
): void {
  if (!canAccessUnit(actor, recordUnitId)) {
    throw Errors.forbidden('Access denied');
  }
}

/**
 * Resolve which unit a newly created audit belongs to.
 *
 * The controller used to prefer the actor's token `unitId` and only fall back to
 * `body.unitId` when the token carried none. A foundation-wide reviewer who
 * carries a unit (the foundation unit, say) but deliberately conducts an audit of
 * a different unit therefore had that choice discarded: the audit was filed
 * against the reviewer's own unit, quietly, and the target unit's head never saw
 * it. The request's explicit unit is authoritative for a cross-unit role.
 *
 * - Foundation-wide: `body.unitId` wins when present; otherwise the actor's own
 *   unit is the explicit fallback; with neither, the target is undeterminable and
 *   the request is refused rather than guessed.
 * - Unit-scoped: the actor's own unit is the only possible target. An override in
 *   the body is ignored, never honoured, exactly as `resolveArrearsUnitId` does;
 *   without a unit the request fails closed instead of writing an unscoped audit.
 *
 * `createAudit` persists a required `unitId`, so unlike the list/arrears readers
 * there is no `undefined` ("every unit") outcome — a missing target is an error.
 */
export function resolveAuditUnitId(
  actor: PengawasanActor,
  requestedUnitId?: string | null
): string {
  const requested = requestedUnitId ?? undefined;

  if (isFoundationWide(actor.roleCode)) {
    const target = requested ?? actor.unitId ?? undefined;
    if (!target) {
      throw Errors.badRequest('Unit ID is required: pilih unit tempat audit ini dilaksanakan.');
    }
    return target;
  }

  const ownUnitId = actor.unitId ?? undefined;
  if (!ownUnitId) {
    throw Errors.unauthorized('Unit ID required');
  }
  // The actor's own unit is authoritative for a unit-scoped actor; an override is
  // ignored, never honoured.
  return ownUnitId;
}

/**
 * Resolve which unit an arrears request may read.
 *
 * The controller used to resolve this itself, with a raw inline list —
 * `SUPER_ADMIN` + four `YAYASAN_*` codes — that was not the same set the route
 * authorization uses (`PENGAWASAN_ARREARS_ROLES` is governance ∪ admins ∪
 * treasurers). The two were maintained separately, so a role could be admitted
 * to the endpoint and still be silently narrowed to its own unit, or the
 * reverse. The cross-unit class is exactly `FOUNDATION_WIDE_ROLES`, so this
 * reads that one definition rather than adding a second, drifting copy.
 *
 * A cross-unit role (governance, Super Admin) sees the foundation by default
 * and may narrow to one unit with `unitId`; `"all"` is the explicit cross-unit
 * sentinel and resolves to `undefined` (every unit). Every other role —
 * including a unit admin or treasurer admitted by `PENGAWASAN_ARREARS_ROLES` —
 * is confined to its own unit and **cannot** override it with a query
 * parameter. A unit-scoped actor with no unit is refused rather than defaulted
 * to an unscoped query, because `undefined` means "every unit" downstream.
 */
export function resolveArrearsUnitId(
  actor: PengawasanActor,
  requestedUnitId?: string
): string | undefined {
  const ownUnitId = actor.unitId ?? undefined;

  if (isFoundationWide(actor.roleCode)) {
    if (!requestedUnitId) return undefined;
    return requestedUnitId === 'all' ? undefined : requestedUnitId;
  }

  if (!ownUnitId) {
    throw Errors.unauthorized('Unit ID required');
  }
  // The request's own unit is authoritative for a unit-scoped actor; an
  // override is ignored, never honoured.
  return ownUnitId;
}
