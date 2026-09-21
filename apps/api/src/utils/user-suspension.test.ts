import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The suspension check runs on every authenticated request, so its dangerous
 * modes are silent: it can let a deleted user back in, and a stale cache write
 * can resurrect a marker for an account that has already been restored.
 */

// A small in-memory Redis stand-in. `eval` interprets the compare-and-set
// script with the same version ordering Redis would apply, so the tests exercise
// the real write path (argument shape + ordering) rather than stubbed returns.
const store = new Map<string, string>();
const redisGet = vi.fn(async (key: string) => store.get(key) ?? null);
const redisEval = vi.fn(
  async (
    _script: string,
    _numKeys: number,
    key: string,
    state: string,
    version: string,
    _ttl: string
  ) => {
    const raw = store.get(key) ?? null;
    const match = raw ? /^([sn]):(\d+)$/.exec(raw) : null;
    const current = match ? Number(match[2]) : -1;
    if (Number(version) >= current) {
      store.set(key, `${state}:${version}`);
      return 1;
    }
    return 0;
  }
);

vi.mock('@/lib/redis', () => ({
  redis: {
    get: (...args: [string]) => redisGet(...args),
    eval: (...args: [string, number, string, string, string, string]) => redisEval(...args),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    boardMemberSuspension: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  isUserSuspended,
  markUserSuspended,
  invalidateUserSuspensionCache,
  SUSPENSION_CACHE_CAS_SCRIPT,
} from './user-suspension';

function mockUser(row: unknown) {
  (prisma.user.findUnique as any).mockResolvedValue(row);
}

function noActiveSuspension() {
  (prisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
}

describe('isUserSuspended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    noActiveSuspension();
  });

  it('treats a soft-deleted user as suspended even when isActive is true', async () => {
    mockUser({ isActive: true, deletedAt: new Date('2026-01-01'), accountStateVersion: 4 });

    await expect(isUserSuspended('u1')).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { isActive: true, deletedAt: true, accountStateVersion: true },
    });
  });

  it('treats an inactive user as suspended', async () => {
    mockUser({ isActive: false, deletedAt: null, accountStateVersion: 1 });
    await expect(isUserSuspended('u1')).resolves.toBe(true);
  });

  it('treats a live user with no active suspension as usable', async () => {
    mockUser({ isActive: true, deletedAt: null, accountStateVersion: 1 });
    await expect(isUserSuspended('u1')).resolves.toBe(false);
  });

  it('treats a missing user row as suspended', async () => {
    mockUser(null);
    await expect(isUserSuspended('u1')).resolves.toBe(true);
  });

  it('honours a versioned positive marker without hitting the database', async () => {
    store.set('suspension:user:u1', 's:7');
    await expect(isUserSuspended('u1')).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does not trust a legacy marker without a version', async () => {
    // A `1` written by an older build carries no ordering, so it must not
    // short-circuit a decision that could already have been reversed.
    store.set('suspension:user:u1', '1');
    mockUser({ isActive: true, deletedAt: null, accountStateVersion: 9 });
    await expect(isUserSuspended('u1')).resolves.toBe(false);
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });

  it('does not trust a restore tombstone as a negative answer', async () => {
    store.set('suspension:user:u1', 'n:9');
    mockUser({ isActive: true, deletedAt: null, accountStateVersion: 9 });
    await expect(isUserSuspended('u1')).resolves.toBe(false);
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });

  it('falls back to the database when Redis throws', async () => {
    redisGet.mockRejectedValueOnce(new Error('redis down'));
    mockUser({ isActive: false, deletedAt: null, accountStateVersion: 2 });
    await expect(isUserSuspended('u1')).resolves.toBe(true);
  });

  it('does not write a negative answer to the cache', async () => {
    mockUser({ isActive: true, deletedAt: null, accountStateVersion: 3 });
    await isUserSuspended('u1');
    expect(store.has('suspension:user:u1')).toBe(false);
  });

  it('primes the positive answer with the version it read', async () => {
    mockUser({ isActive: false, deletedAt: null, accountStateVersion: 12 });
    await isUserSuspended('u1');
    expect(store.get('suspension:user:u1')).toBe('s:12');
  });
});

describe('suspension cache writes are ordered by the durable version', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
  });

  it('markUserSuspended records the version it was given', async () => {
    await markUserSuspended('u1', 3);
    expect(store.get('suspension:user:u1')).toBe('s:3');
  });

  it('a delayed prime cannot outrank a newer restore', async () => {
    // The exact race: suspension commits at version 5, the lift commits at 6 and
    // records its tombstone, then the suspension's post-commit prime arrives late.
    await invalidateUserSuspensionCache('u1', 6);
    await markUserSuspended('u1', 5);

    // The stale prime is rejected, so the restored account is not re-marked.
    expect(store.get('suspension:user:u1')).toBe('n:6');
    mockUser({ isActive: true, deletedAt: null, accountStateVersion: 6 });
    await expect(isUserSuspended('u1')).resolves.toBe(false);
  });

  it('an older suspension event cannot overwrite a newer suspension marker', async () => {
    await markUserSuspended('u1', 7);
    await markUserSuspended('u1', 6);
    expect(store.get('suspension:user:u1')).toBe('s:7');
  });

  it('a restore with an equal version still lands (idempotent replay)', async () => {
    await markUserSuspended('u1', 4);
    await invalidateUserSuspensionCache('u1', 4);
    expect(store.get('suspension:user:u1')).toBe('n:4');
  });

  it('the compare-and-set script orders integer versions', () => {
    expect(SUSPENSION_CACHE_CAS_SCRIPT).toContain("tonumber(ARGV[2]) >= current");
  });

  it('swallows a Redis failure on invalidate but logs it', async () => {
    redisEval.mockRejectedValueOnce(new Error('redis down'));
    await expect(invalidateUserSuspensionCache('u1', 1)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs a Redis failure when priming a suspension marker', async () => {
    redisEval.mockRejectedValueOnce(new Error('redis down'));
    await expect(markUserSuspended('u1', 1)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('cached-negative revocation guarantee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    noActiveSuspension();
  });

  it('keeps access denied after persistent state changes even when Redis invalidation fails', async () => {
    // A hypothetical stale `0` left behind by an older build. Because the
    // implementation never trusts a negative, the next request still reads the
    // database and refuses.
    store.set('suspension:user:u1', '0');
    redisEval.mockRejectedValueOnce(new Error('redis down'));
    mockUser({ isActive: false, deletedAt: null, accountStateVersion: 8 });

    await expect(isUserSuspended('u1')).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });
});
