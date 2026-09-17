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
 * **Only the *suspended* answer is cached** (`1`). A cached "not suspended"
 * (`0`) was trusted for a whole TTL while invalidation and priming are
 * best-effort: if the Redis write that should have recorded a suspension
 * failed, the stale `0` kept a revoked token authenticating until the TTL
 * lapsed. A negative cache for a security decision has to guarantee that the
 * miss path cannot outlive the state it denies, and a best-effort cache cannot
 * give that guarantee — so it is not taken. A positive marker is monotonic and
 * safe: a stale `1` that outlives a lift merely keeps an account denied until
 * the TTL, which is the fail-closed direction.
 */
const CACHE_PREFIX = 'suspension:user:';
const CACHE_TTL_SECONDS = 60;

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

/**
 * Prime the cache with a positive (suspended) marker.
 *
 * There is deliberately no writer for `0`: writing "not suspended" is a claim
 * that can be invalidated by another process after this one read it, and the
 * whole point of consulting Redis first is that the answer must not go stale in
 * the permissive direction. Only the new suspension request primes a marker —
 * never a cache miss — so the cache can only ever over-deny, never under-deny.
 *
 * Returns true when the value was stored.
 */
async function writeSuspendedMarker(userId: string): Promise<void> {
  try {
    await redis.set(cacheKey(userId), '1', 'EX', CACHE_TTL_SECONDS);
  } catch (error) {
    // Best-effort, but not silent. A failed revocation prime means the next
    // request on this replica still reads the database — correct, but slow —
    // and on every other replica the marker was never set at all. That is an
    // operational signal worth a log line, not a swallowed error.
    logger.error('[user-suspension] gagal menulis penanda pembekuan ke Redis', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Drop the cached answer on lift.
 *
 * There is no `false` write to race: `null` the key and the next request reads
 * persistent state, where the events are ordered by the database rather than by
 * whichever writer finished last.
 */
async function deleteCache(userId: string): Promise<void> {
  try {
    await redis.del(cacheKey(userId));
  } catch (error) {
    // Best-effort, but observable for the same reason as the prime above.
    logger.error('[user-suspension] gagal menghapus cache pembekuan dari Redis', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** True when the account is inactive, deleted, or under an ACTIVE suspension. */
export async function isUserSuspended(userId: string): Promise<boolean> {
  try {
    const cached = await redis.get(cacheKey(userId));
    // Only a positive marker is trusted. A `0` is ignored — it cannot be relied
    // on to reflect a write that may have failed — and the database decides.
    if (cached === '1') return true;
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
      select: { isActive: true, deletedAt: true },
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
  // Prime only the positive direction; a `false` is never cached, so a failed
  // write can never leave a revoked token authenticated.
  if (suspended) {
    await writeSuspendedMarker(userId);
  }
  return suspended;
}

/**
 * Record the suspension in the cache so the very next request on any replica
 * sees it, rather than waiting for the persistent read.
 */
export async function markUserSuspended(userId: string): Promise<void> {
  await writeSuspendedMarker(userId);
}

/**
 * Drop the cached answer on lift.
 *
 * Writing `false` here is a data race: a suspension that ran while the lift was
 * in flight may already have primed the cache with `true`, and this
 * unconditional `false` — written after it — would win for a whole TTL, letting
 * the suspended account's old token authenticate again. Deleting the key
 * instead forces the next request to read the persistent state, where the two
 * events are ordered by the database and not by which writer finished last.
 */
export async function invalidateUserSuspensionCache(userId: string): Promise<void> {
  await deleteCache(userId);
}

/** @deprecated Use {@link invalidateUserSuspensionCache}; kept for callers not yet migrated. */
export async function unmarkUserSuspended(userId: string): Promise<void> {
  await invalidateUserSuspensionCache(userId);
}
