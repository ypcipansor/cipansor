/**
 * The signing-key sentinel that a board suspension writes.
 *
 * Lives in `utils/` rather than the pengawasan module because two sides read it:
 * `BoardSuspensionService` writes it, and the E-Sign service must never clear it
 * by accident. Importing the pengawasan module from esign would invert the
 * dependency; a shared constant keeps the knowledge in one place.
 *
 * This is a *temporary lock*, not a formal revocation. `UserSigningKey.revokedAt`
 * is the audited revocation field (set with a reason, and never cleared), and a
 * suspension deliberately does not touch it: a suspension is reversible, so a key
 * that was merely locked must come back exactly as it was. Writing `revokedAt`
 * would either be irreversible on lift or require "un-revoking" a key, which the
 * e-sign lifecycle rightly does not allow. The far-future date maps to LOCKED in
 * `effectiveState`, and the lift restores the prior `lockedUntil`.
 */
export const SIGNING_KEY_SUSPENSION_LOCK = new Date('2099-01-01T00:00:00Z');

/**
 * Is this key held by the suspension sentinel rather than a normal lockout?
 *
 * Normal lockouts come from failed passphrase attempts as short, minutes-scale
 * windows. The sentinel is far in the future so no time-based path clears it by
 * being reached first — but "far in the future" must be recognised as *the
 * suspension's* lock, or the routine successful-signature clear
 * (`failedAttempts: 0, lockedUntil: null`) would silently re-enable signing for
 * a suspended officer whenever the suspension landed mid-signature. Both clear
 * sites consult this and leave the sentinel alone.
 */
export function isSuspensionSigningLock(lockedUntil: Date | null | undefined): boolean {
  return !!lockedUntil && lockedUntil.getTime() >= SIGNING_KEY_SUSPENSION_LOCK.getTime();
}
