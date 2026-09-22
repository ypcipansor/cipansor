import { describe, it, expect } from 'vitest';
import {
  SIGNING_KEY_SUSPENSION_LOCK,
  isSuspensionSigningLock,
} from './esign-suspension-lock';
import { assertCanSign, effectiveState, isLocked, SigningKeyState } from './esign-lifecycle';

/**
 * The product decision pinned here: a board suspension *temporarily prohibits*
 * signing, it does not formally revoke the key.
 *
 * `UserSigningKey.revokedAt` is the audited revocation field — set with a
 * reason and never cleared. A suspension is reversible, so "un-revoking" a key
 * is not something the e-sign lifecycle allows. The suspension therefore writes
 * the far-future `lockedUntil` sentinel, which every signing gate must treat as
 * a hard "no" while leaving `revokedAt` untouched, and which the lift removes by
 * restoring the prior value. This file proves the sentinel is recognised on
 * every signing path; the issuance/lift round-trip is proven in
 * `modules/pengawasan/tests/board-suspension.service.test.ts`.
 */
describe('E-Sign suspension lock (temporary prohibition, not revocation)', () => {
  const liveKey = {
    approvedAt: new Date('2026-01-01'),
    expiresAt: new Date('2027-01-01'),
    revokedAt: null,
    lockedUntil: null,
  };

  it('recognises exactly the far-future sentinel, not a normal passphrase lockout', () => {
    expect(isSuspensionSigningLock(SIGNING_KEY_SUSPENSION_LOCK)).toBe(true);
    expect(isSuspensionSigningLock(new Date(SIGNING_KEY_SUSPENSION_LOCK.getTime() + 1))).toBe(true);
    // A minutes-scale passphrase lockout is not the suspension's lock, so the
    // routine successful-signature clear must still be allowed to lift it.
    expect(isSuspensionSigningLock(new Date(Date.now() + 15 * 60 * 1000))).toBe(false);
    expect(isSuspensionSigningLock(null)).toBe(false);
    expect(isSuspensionSigningLock(undefined)).toBe(false);
  });

  it('reports the suspended key as LOCKED, and never as REVOKED', () => {
    // revokedAt stays null: the key is not revoked, only held.
    const suspended = { ...liveKey, lockedUntil: SIGNING_KEY_SUSPENSION_LOCK };
    expect(effectiveState(suspended)).toBe(SigningKeyState.ACTIVE);
    expect(isLocked(suspended)).toBe(true);
  });

  it('refuses signing while the sentinel is set, even though the key is otherwise live', () => {
    const suspended = { ...liveKey, lockedUntil: SIGNING_KEY_SUSPENSION_LOCK };
    expect(() => assertCanSign(suspended)).toThrow(/terkunci/i);
  });

  it('allows signing again once the lift restores the prior value', () => {
    const restored = { ...liveKey, lockedUntil: null };
    expect(() => assertCanSign(restored)).not.toThrow();
  });

  it('keeps a key with a formal revocation refused after any suspension round-trip', () => {
    // A key that was *revoked* is not a key the suspension can resurrect: the
    // lift only restores `lockedUntil`, and `effectiveState` gives revocation
    // precedence over everything.
    const revoked = {
      ...liveKey,
      revokedAt: new Date('2026-02-01'),
      lockedUntil: SIGNING_KEY_SUSPENSION_LOCK,
    };
    expect(effectiveState(revoked)).toBe(SigningKeyState.REVOKED);
    // The lockout gate runs first, so the message names the lock; the important
    // invariant is that signing is still refused — the lift only clears
    // `lockedUntil`, and `revokedAt` (which outranks it) stays.
    expect(() => assertCanSign(revoked)).toThrow();
    expect(() => assertCanSign({ ...revoked, lockedUntil: null })).toThrow(/dicabut/i);
  });
});
