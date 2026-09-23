/**
 * Authorization rules for the Socket.IO layer.
 *
 * The socket is a second, parallel surface to the REST API, and it was the one
 * place authorization was never applied: any authenticated user could join any
 * `unit:<id>` or `role:<name>` room, and could ask the dashboard for any unit's
 * metrics or the global set. A room membership is a data grant here — every
 * broadcaster emits into a room — so "who may join which room" *is* the
 * authorization boundary. These pure functions are that boundary, kept out of
 * `realtime.ts` so they can be unit-tested without a live server.
 *
 * `FOUNDATION_WIDE` deliberately mirrors `pengawasan.policy.ts`'s
 * `isFoundationWide`: Super Admin plus the six governance RoleCodes. Those are
 * the roles whose REST view is already the whole foundation, so letting them
 * join every unit room or read global metrics adds no reach they do not have.
 */

/** Roles whose legitimate scope is the entire foundation. */
export const FOUNDATION_WIDE_ROLES: readonly string[] = [
  'SUPER_ADMIN',
  'YAYASAN_PEMBINA',
  'YAYASAN_KETUA',
  'YAYASAN_SEKRETARIS',
  'YAYASAN_BENDAHARA',
  'YAYASAN_ANGGOTA',
  'YAYASAN_PENGAWAS',
];

export function isFoundationWideRole(roleCode: string | null | undefined): boolean {
  return !!roleCode && FOUNDATION_WIDE_ROLES.includes(roleCode);
}

/** The identity the socket authenticated, as the token carried it. */
export interface SocketIdentity {
  userId: string;
  roleCode: string | null | undefined;
  /** The role's unit, if it has one. */
  unitId: string | null | undefined;
  /**
   * Every unit the account is effectively assigned to, across all active
   * assignments. A user can hold roles in more than one unit, and the realtime
   * layer must honour all of them, not just the token's active one.
   */
  effectiveUnitIds?: string[];
}

/** All units an identity may act on: the token unit plus every active assignment. */
export function allowedUnitIds(identity: SocketIdentity): Set<string> {
  const units = new Set<string>();
  if (identity.unitId) units.add(identity.unitId);
  for (const unitId of identity.effectiveUnitIds ?? []) {
    if (unitId) units.add(unitId);
  }
  return units;
}

/**
 * May this identity join `unit:<unitId>`?
 *
 * Foundation-wide roles may join any unit. Everyone else is confined to the
 * units they are actually assigned to — a unitless non-foundation actor has no
 * unit scope at all and is refused.
 */
export function canJoinUnitRoom(
  identity: SocketIdentity,
  unitId: string | null | undefined
): boolean {
  if (!unitId) return false;
  if (isFoundationWideRole(identity.roleCode)) return true;
  return allowedUnitIds(identity).has(unitId);
}

/**
 * May this identity join `role:<roleCode>`?
 *
 * Only its own active role. Letting a client name an arbitrary role room would
 * make every role-scoped broadcast (governance, admin, treasury) readable by
 * anyone who could guess the string — the same "client supplies its own
 * authorization" defect as the unit rooms.
 */
export function canJoinRoleRoom(
  identity: SocketIdentity,
  roleCode: string | null | undefined
): boolean {
  return !!roleCode && roleCode === identity.roleCode;
}

/**
 * May this identity read the *global* dashboard?
 *
 * The global metrics aggregate every unit. A unit-scoped user has no business
 * seeing them, so this is foundation-wide only.
 */
export function canSubscribeGlobalDashboard(identity: SocketIdentity): boolean {
  return isFoundationWideRole(identity.roleCode);
}

/**
 * Which unit's dashboard may this identity subscribe to?
 *
 * Returns the unit id to serve, `undefined` for the global dashboard, or
 * `null` to refuse. A foundation-wide actor may ask for any unit (or global);
 * a unit-scoped actor is pinned to a unit it belongs to and may never read
 * global; a unitless non-foundation actor is refused outright rather than
 * defaulted to the whole foundation.
 */
export function resolveDashboardUnit(
  identity: SocketIdentity,
  requestedUnitId: string | null | undefined
): string | undefined | null {
  if (isFoundationWideRole(identity.roleCode)) {
    return requestedUnitId ?? undefined;
  }
  const units = allowedUnitIds(identity);
  if (requestedUnitId) {
    return units.has(requestedUnitId) ? requestedUnitId : null;
  }
  // No explicit unit: fall back to the actor's own scope if it has exactly one,
  // otherwise there is nothing safe to serve.
  if (units.size === 1) return [...units][0];
  return null;
}
