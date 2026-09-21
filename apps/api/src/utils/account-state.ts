import crypto from 'crypto';

/**
 * Ownership of a user account's `isActive` value.
 *
 * `isActive` is a single boolean with many writers: an admin deactivating an
 * account, an HR offboarding, a student soft-delete, and the board-suspension
 * service. When a suspension later lifts, it must reactivate the account it
 * switched off — and *only* that one. `accountStateSnapshot.isActiveBefore`
 * recorded what the account looked like at suspension time, but not whether the
 * current `false` is still the suspension's own write; an admin deactivation
 * that landed during the suspension was silently undone.
 *
 * Comparing `User.updatedAt` was the first attempt and failed the other way: a
 * profile edit moves the timestamp, so a lift refused to restore an account the
 * suspension itself had disabled.
 *
 * The fix is a writer token — a fresh, opaque value minted by whoever changes
 * the account state and stored on `User.accountStateWriter` in the same
 * statement. The suspension records the token it wrote; the lift reactivates
 * only while that exact token is still present, which is a claim no unrelated
 * writer can hold. A profile edit leaves the column alone, so it never blocks a
 * lift.
 */

/**
 * The payload that records one account-state change.
 *
 * `accountStateVersion` is bumped in the *same* statement as `isActive` /
 * `deletedAt` / `accountStateWriter`, so the counter and the state it describes
 * can never disagree — a version read elsewhere is always the version of the
 * state that was actually committed.
 */
export interface AccountStateChange {
  accountStateVersion: { increment: number };
  accountStateWriter: string;
}
export function newAccountStateWriter(): string {
  return `asw_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Build the `data` for switching an account off, stamped with a new owner.
 *
 * Returns the token alongside the payload so a caller that needs to remember
 * ownership (the suspension service) can persist it on its own row.
 */
export function deactivationState(): {
  isActive: false;
  accountStateWriter: string;
  accountStateVersion: { increment: number };
} {
  return {
    isActive: false,
    accountStateWriter: newAccountStateWriter(),
    accountStateVersion: { increment: 1 },
  };
}

/**
 * Build the `data` for switching an account on, stamped with a new owner.
 *
 * A reactivation takes ownership too: a later suspension that switches the
 * account off again must not be undone by a stale lift of an older suspension,
 * which would otherwise still see its own token.
 */
export function activationState(): {
  isActive: true;
  accountStateWriter: string;
  accountStateVersion: { increment: number };
} {
  return {
    isActive: true,
    accountStateWriter: newAccountStateWriter(),
    accountStateVersion: { increment: 1 },
  };
}

/**
 * The `data` for a soft delete, stamped with a new owner.
 *
 * `deletedAt` is checked before ownership on lift, so the token is not what
 * makes a soft-delete win — but stamping it keeps every account-state change
 * attributable, so a restore-then-lift sequence cannot mistake an old token
 * for the suspension's.
 */
export function softDeleteState(now: Date = new Date()): {
  deletedAt: Date;
  accountStateWriter: string;
  accountStateVersion: { increment: number };
} {
  return {
    deletedAt: now,
    accountStateWriter: newAccountStateWriter(),
    accountStateVersion: { increment: 1 },
  };
}
