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
import { Prisma } from '@prisma/client';
import { Errors } from '@/middleware/error';

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

/**
 * How long the signing-key lock waits before giving up.
 *
 * `pg_advisory_xact_lock` always waits, so the statement-level `lock_timeout`
 * set here is what turns a deadlock or a pathologically long hold into a clean
 * error. It is scoped with `set_config(..., true)` (transaction-local) so it
 * cannot leak into the rest of the request.
 */
const LOCK_STATEMENT_TIMEOUT = '5s';

/**
 * A signing operation that lost its race against a board suspension.
 *
 * Thrown from inside a transaction (so the transaction rolls back). Callers that
 * committed crypto work before the transaction translate it to the same refusal
 * the pre-flight `assertCanSign` raises, so the client sees a clean 4xx and never
 * a false success.
 */
export class SigningKeySuspensionRaceError extends Error {
  constructor() {
    super(
      'Kunci tanda tangan Anda dibekukan oleh Surat Keputusan Pembekuan Pengurus ' +
        'saat operasi ini berjalan. Operasi dibatalkan.'
    );
    this.name = 'SigningKeySuspensionRaceError';
  }
}

/**
 * Re-assert — atomically, on the row about to be written — that a key is not
 * held by the board-suspension sentinel.
 *
 * The pre-flight `assertCanSign` reads the key before the operation's real work,
 * which leaves a window: a suspension can commit after that read and before the
 * final write. A `lockedUntil` write that lands late then either overwrites the
 * sentinel (re-enabling signing for a suspended officer) or, for a signature,
 * mints a valid signature for someone the board just froze. Reading and writing
 * the same column in one statement closes it.
 *
 * The row is locked `FOR UPDATE` first so the check and the caller's write see
 * the committed state. A concurrent suspension writes the same key row with a
 * conditional `updateMany` (its own compare-and-set on the observed
 * `lockedUntil`), which takes the row lock for the duration of its transaction —
 * so the two are serialised on the row itself, and whichever commits second sees
 * the other's value. That ordering is what makes this re-read meaningful; the
 * advisory lock above only serialises the e-sign writers against each other.
 *
 * Lock ordering: the key row is taken before the letter row in every signing
 * path, matching `BoardSuspensionService`, which locks the user, then the Plh
 * assignment, and only then touches the signing-key rows — so the two cannot
 * deadlock.
 *
 * Fail closed: a missing key is refused. A key held by the sentinel throws
 * `SigningKeySuspensionRaceError`; a key with an ordinary lockout or a formal
 * revocation is left to `assertCanSign`, which reports the more specific reason.
 */
export async function assertSigningKeyNotSuspendedTx(
  tx: Prisma.TransactionClient,
  keyId: string
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('lock_timeout', ${LOCK_STATEMENT_TIMEOUT}, true)`;
  // `$executeRaw`, not `$queryRaw`: `pg_advisory_xact_lock` returns `void`,
  // which the Prisma 7 driver adapter cannot deserialize as a column.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(1003::int, hashtext(${keyId})::int)`;

  const locked = await tx.$queryRaw<Array<{ locked_until: Date | null }>>`
    SELECT locked_until FROM "user_signing_keys" WHERE id = ${keyId} FOR UPDATE
  `;
  if (!Array.isArray(locked) || locked.length !== 1) {
    throw Errors.badRequest('Kunci tanda tangan tidak ditemukan.');
  }
  if (isSuspensionSigningLock(locked[0].locked_until)) {
    throw new SigningKeySuspensionRaceError();
  }
}

/**
 * Translate a lost suspension race into the plain HTTP refusal the caller
 * already knows how to report. A suspension that lands mid-signature is not a
 * server fault, and it must never be reported as success.
 */
export function asSuspensionRefusal(error: unknown): unknown {
  if (error instanceof SigningKeySuspensionRaceError) {
    return Errors.badRequest(error.message);
  }
  return error;
}
