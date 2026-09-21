import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { BoardSuspensionStatus } from '@prisma/client';

/**
 * Whether an access token still belongs to a usable account.
 *
 * The previous implementation kept a `Set<string>` in module scope. That is a
 * per-process fact, and the API runs more than one process: a replica or a
 * worker that had not handled the suspension request never learned about it,
 * so a suspended board member kept using their existing access token there
 * until it expired. A revocation that only half the fleet honours is not a
 * revocation.
 *
 * The answer therefore comes from persistent state — `User.isActive` plus any
 * ACTIVE `BoardMemberSuspension` — and Redis only caches it. Both are
 * consulted on a cache miss, so the two suspension mechanisms cannot drift:
 * the service sets `isActive: false`, and the row is what makes the intent
 * legible in the governance module.
 *
 * **A negative answer is never trusted.** A cached "not suspended" was trusted
 * for a whole TTL while invalidation and priming are best-effort: if the Redis
 * write that should have recorded a suspension failed, the stale negative kept
 * a revoked token authenticating until the TTL lapsed. A negative cache for a
 * security decision has to guarantee that the miss path cannot outlive the state
 * it denies, and a best-effort cache cannot give that guarantee — so it is not
 * taken. Only the *suspended* answer short-circuits; anything else reads the
 * database.
 *
 * **Cache writes are ordered by a durable version, not by arrival time.**
 * `suspendBoardMember` primes this cache *after* its transaction commits, so a
 * lift can commit — and record its restore — before the delayed prime runs. The
 * prime would then re-assert a suspension for an account that is already
 * restored, and the legitimate user stays refused until the TTL. Arrival order
 * cannot decide this, so the marker carries `User.accountStateVersion`, the
 * monotonic counter every guarded account-state write bumps. A write is applied
 * only when its version is not older than the version already recorded, which
 * makes a delayed prime from a superseded event a no-op. The comparison runs
 * inside Redis so two replicas cannot interleave a read and a write.
 */
const CACHE_PREFIX = 'suspension:user:';
const CACHE_TTL_SECONDS = 60;

/**
 * `s:<version>` — a positive marker: the account was suspended as of `version`.
 * `n:<version>` — a tombstone: the account state was changed as of `version`.
 *
 * The tombstone carries ordering, **not** an answer: a request that reads it
 * still consults the database, exactly as it would on a miss. Without it a
 * delayed prime would find no recorded version and be accepted, which is the
 * race this encoding removes. A legacy bare `1`/`0` has no version and is
 * therefore ignored for ordering — the current writer's version is the best
 * information available.
 */
const SUSPENDED = 's';
const RESTORED = 'n';

function parseEntry(raw: string | null): { state: string; version: number } | null {
  if (!raw) return null;
  const [state, versionText] = raw.split(':');
  if ((state !== SUSPENDED && state !== RESTORED) || !/^\d+$/.test(versionText ?? '')) {
    return null;
  }
  return { state, version: Number(versionText) };
}

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

/**
 * Write the marker only when the version being written is not older than the
 * one already stored.
 *
 * Read-modify-write from Node would let two replicas each read the same old
 * version and each write, which is the same race one level down, so the whole
 * decision runs inside Redis. `KEYS[1]` is the cache key; `ARGV[1]` the state
 * (`s`/`n`), `ARGV[2]` the version, `ARGV[3]` the TTL.
 */
export const SUSPENSION_CACHE_CAS_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local current = -1
if raw then
  local state, version = string.match(raw, '^([sn]):(%d+)$')
  if state then current = tonumber(version) end
end
if tonumber(ARGV[2]) >= current then
  redis.call('SET', KEYS[1], ARGV[1] .. ':' .. ARGV[2], 'EX', tonumber(ARGV[3]))
  return 1
end
return 0
`;

async function writeEntry(userId: string, state: string, version: number): Promise<void> {
  try {
    await redis.eval(
      SUSPENSION_CACHE_CAS_SCRIPT,
      1,
      cacheKey(userId),
      state,
      String(version),
      String(CACHE_TTL_SECONDS)
    );
  } catch (error) {
    // Best-effort, but not silent. A failed revocation prime means the next
    // request on this replica still reads the database — correct, but slow —
    // and on every other replica the marker was never set at all. That is an
    // operational signal worth a log line, not a swallowed error.
    logger.error('[user-suspension] gagal menulis penanda pembekuan ke Redis', {
      userId,
      version,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** True when the account is inactive, deleted, or under an ACTIVE suspension. */
export async function isUserSuspended(userId: string): Promise<boolean> {
  try {
    const cached = await redis.get(cacheKey(userId));
    // Only a positive marker short-circuits. A tombstone or a legacy `0` is not
    // trusted — it cannot be relied on to reflect a write that may have failed —
    // and the database decides.
    if (parseEntry(cached)?.state === SUSPENDED) return true;
  } catch (error) {
    // Redis unavailable — fall through to the database. Logged because a
    // sustained outage turns this hot path into a database read per request.
    logger.warn('[user-suspension] Redis tidak tersedia, membaca status dari database', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const [user, activeSuspension] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, deletedAt: true, accountStateVersion: true },
    }),
    prisma.boardMemberSuspension.findFirst({
      where: { userId, status: BoardSuspensionStatus.ACTIVE },
      select: { id: true },
    }),
  ]);

  // A token whose user row is gone must not authenticate either. `deletedAt`
  // is a soft delete that leaves `isActive` untouched, so without it a
  // deleted user's still-valid access token kept working until it expired.
  const suspended = !user || !user.isActive || !!user.deletedAt || !!activeSuspension;
  // Prime only the positive direction, carrying the version this answer was read
  // at: a `false` is never cached, so a failed write can never leave a revoked
  // token authenticated, and a superseded prime cannot outrank a later restore.
  if (suspended && user) {
    await writeEntry(userId, SUSPENDED, user.accountStateVersion ?? 0);
  }
  return suspended;
}

/**
 * Record the suspension in the cache so the very next request on any replica
 * sees it, rather than waiting for the persistent read.
 *
 * `accountStateVersion` is the version the caller's own state write produced —
 * not a value re-read afterwards, which could already belong to a later lift.
 * The write is rejected when a newer version is already recorded, so a prime
 * that arrives after the suspension was lifted does not resurrect the marker.
 */
export async function markUserSuspended(
  userId: string,
  accountStateVersion: number
): Promise<void> {
  await writeEntry(userId, SUSPENDED, accountStateVersion);
}

/**
 * Record that the account state changed, so a later suspension prime cannot
 * outrank it.
 *
 * This is deliberately a *tombstone*, not a deletion and not a trusted negative.
 * Deleting the key would discard the version a delayed prime must be compared
 * against; writing a trusted "not suspended" would be a claim that another
 * process can invalidate after this one read it. The tombstone carries the
 * ordering only — the next request still reads the database.
 *
 * `accountStateVersion` is the version the restoring write produced.
 */
export async function invalidateUserSuspensionCache(
  userId: string,
  accountStateVersion: number
): Promise<void> {
  await writeEntry(userId, RESTORED, accountStateVersion);
}

/** @deprecated Use {@link invalidateUserSuspensionCache}; kept for callers not yet migrated. */
export async function unmarkUserSuspended(
  userId: string,
  accountStateVersion: number
): Promise<void> {
  await invalidateUserSuspensionCache(userId, accountStateVersion);
}
