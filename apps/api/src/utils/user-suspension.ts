import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
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
 * The cache exists because this runs on every authenticated request. Its TTL
 * bounds how long a stale answer can survive a failed invalidation, and the
 * database is always the authority when Redis is unavailable.
 */
const CACHE_PREFIX = 'suspension:user:';
const CACHE_TTL_SECONDS = 60;

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

async function writeCache(userId: string, suspended: boolean): Promise<void> {
  try {
    await redis.set(cacheKey(userId), suspended ? '1' : '0', 'EX', CACHE_TTL_SECONDS);
  } catch {
    // Best-effort. A missed write costs at most one TTL of staleness; the
    // database read below is what keeps the answer correct.
  }
}

/** True when the account is inactive, deleted, or under an ACTIVE suspension. */
export async function isUserSuspended(userId: string): Promise<boolean> {
  try {
    const cached = await redis.get(cacheKey(userId));
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch {
    // Redis unavailable — fall through to the database.
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
  await writeCache(userId, suspended);
  return suspended;
}

/**
 * Record the suspension in the cache so the very next request on any replica
 * sees it, rather than waiting for the cached "not suspended" to expire.
 */
export async function markUserSuspended(userId: string): Promise<void> {
  await writeCache(userId, true);
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
  try {
    await redis.del(cacheKey(userId));
  } catch {
    // Best-effort, exactly like the write it replaces: the database read on
    // the next request is what keeps the answer correct.
  }
}

/** @deprecated Use {@link invalidateUserSuspensionCache}; kept for callers not yet migrated. */
export async function unmarkUserSuspended(userId: string): Promise<void> {
  await invalidateUserSuspensionCache(userId);
}
