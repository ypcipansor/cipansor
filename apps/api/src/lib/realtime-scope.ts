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
  /**
   * Role codes the account holds on an active, unexpired assignment whose
   * `Role` is itself active.
   *
   * A `Role.isActive = false` is how the administration withdraws a capability
   * from every holder at once; an assignment row that outlived that change must
   * grant nothing. This set is the authoritative live role list, read from the
   * database at handshake, rather than the token's point-in-time `roleCode`.
   */
  activeRoleCodes?: string[];
  /**
   * Set when `effectiveUnitIds` / `activeRoleCodes` were actually read from the
   * live assignments. Only then are those lists authoritative: the token's own
   * `unitId` is a point-in-time snapshot that survives a revocation, so a token
   * minted before an assignment was removed must not keep granting that unit. A
   * pure-function caller (or a test) that leaves this unset gets the legacy
   * "token unit also counts" behaviour, which is what makes these predicates
   * usable without a database.
   */
  assignmentsLoaded?: boolean;
}

/** All units an identity may act on, derived from live assignments when known. */
export function allowedUnitIds(identity: SocketIdentity): Set<string> {
  // Live assignments are the source of truth. The token's `unitId` is a
  // snapshot: when an assignment is revoked the token still names its unit for
  // the rest of its TTL, so re-adding it here would re-grant the very unit the
  // revocation took away. Trust only the active assignment set when it was
  // actually loaded.
  if (identity.assignmentsLoaded) {
    return new Set((identity.effectiveUnitIds ?? []).filter(Boolean));
  }
  const units = new Set<string>();
  if (identity.unitId) units.add(identity.unitId);
  for (const unitId of identity.effectiveUnitIds ?? []) {
    if (unitId) units.add(unitId);
  }
  return units;
}

/**
 * The identity's active role code, honoured only while its `Role` is active.
 *
 * When `activeRoleCodes` is present (the realtime handshake always sets it from
 * the database), the token's `roleCode` counts only if a live, active
 * assignment still carries it. A token minted before the role was disabled
 * would otherwise keep granting that role's rooms and dashboard scope after the
 * role was withdrawn. An absent `activeRoleCodes` leaves the token's role in
 * force, which keeps these predicates usable as pure functions in tests.
 */
export function effectiveRoleCode(identity: SocketIdentity): string | null | undefined {
  if (identity.activeRoleCodes === undefined) return identity.roleCode;
  if (identity.roleCode && identity.activeRoleCodes.includes(identity.roleCode)) {
    return identity.roleCode;
  }
  return null;
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
  if (isFoundationWideRole(effectiveRoleCode(identity))) return true;
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
  return !!roleCode && roleCode === effectiveRoleCode(identity);
}

/**
 * May this identity read the *global* dashboard?
 *
 * The global metrics aggregate every unit. A unit-scoped user has no business
 * seeing them, so this is foundation-wide only.
 */
export function canSubscribeGlobalDashboard(identity: SocketIdentity): boolean {
  return isFoundationWideRole(effectiveRoleCode(identity));
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
  if (isFoundationWideRole(effectiveRoleCode(identity))) {
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
