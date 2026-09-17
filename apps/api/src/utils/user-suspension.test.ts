import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The suspension check runs on every authenticated request, so its two
 * dangerous modes are silent: it can let a deleted user back in, and a stale
 * database read can overwrite a fresh suspension in the cache.
 */

// A small in-memory Redis stand-in, exercising the real positive/delete
// operations rather than stubbed return values.
const store = new Map<string, string>();
const redisGet = vi.fn(async (key: string) => store.get(key) ?? null);
const redisSet = vi.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
  store.set(key, value);
  return 'OK';
});
const redisDel = vi.fn(async (key: string) => (store.delete(key) ? 1 : 0));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: (...args: [string]) => redisGet(...args),
    set: (...args: [string, string, string, number]) => redisSet(...args),
    del: (...args: [string]) => redisDel(...args),
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
    mockUser({ isActive: true, deletedAt: new Date('2026-01-01') });

    await expect(isUserSuspended('u1')).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { isActive: true, deletedAt: true },
    });
  });

  it('treats an inactive user as suspended', async () => {
    mockUser({ isActive: false, deletedAt: null });
    await expect(isUserSuspended('u1')).resolves.toBe(true);
  });

  it('treats a live user with no active suspension as usable', async () => {
    mockUser({ isActive: true, deletedAt: null });
    await expect(isUserSuspended('u1')).resolves.toBe(false);
  });

  it('treats a missing user row as suspended', async () => {
    mockUser(null);
    await expect(isUserSuspended('u1')).resolves.toBe(true);
  });

  it('honours a cached positive without hitting the database', async () => {
    store.set('suspension:user:u1', '1');
    await expect(isUserSuspended('u1')).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to the database when Redis throws', async () => {
    redisGet.mockRejectedValueOnce(new Error('redis down'));
    mockUser({ isActive: false, deletedAt: null });
    await expect(isUserSuspended('u1')).resolves.toBe(true);
  });

  it('does not write a negative answer to the cache', async () => {
    mockUser({ isActive: true, deletedAt: null });
    await isUserSuspended('u1');
    expect(redisSet).not.toHaveBeenCalled();
    expect(store.has('suspension:user:u1')).toBe(false);
  });

  it('primes only the positive answer when suspended', async () => {
    mockUser({ isActive: false, deletedAt: null });
    await isUserSuspended('u1');
    expect(store.get('suspension:user:u1')).toBe('1');
  });
});

describe('suspension cache writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
  });

  it('markUserSuspended primes a positive cached answer', async () => {
    await markUserSuspended('u1');
    expect(store.get('suspension:user:u1')).toBe('1');
  });

  it('invalidateUserSuspensionCache deletes the key rather than writing false', async () => {
    store.set('suspension:user:u1', '1');
    await invalidateUserSuspensionCache('u1');

    expect(redisDel).toHaveBeenCalledWith('suspension:user:u1');
    // The regression: a blind `false` outlives a concurrent suspension's `true`.
    expect(store.has('suspension:user:u1')).toBe(false);
  });

  it('swallows a Redis failure on invalidate but logs it', async () => {
    redisDel.mockRejectedValueOnce(new Error('redis down'));
    await expect(invalidateUserSuspensionCache('u1')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs a Redis failure when priming a suspension marker', async () => {
    redisSet.mockRejectedValueOnce(new Error('redis down'));
    await expect(markUserSuspended('u1')).resolves.toBeUndefined();
    // Failure is observable: it must not be swallowed silently.
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
    // The account was usable, so a (hypothetical) cached negative could exist
    // as a stale `0`. This simulates the failure mode the review called out:
    // the invalidation/priming write fails, so the cache is not corrected.
    // Because the implementation never trusts a `0`, the next request still
    // reads the database and refuses.
    store.set('suspension:user:u1', '0'); // stale negative, as if left behind
    redisDel.mockRejectedValueOnce(new Error('redis down'));
    mockUser({ isActive: false, deletedAt: null });

    await expect(isUserSuspended('u1')).resolves.toBe(true);
    // The stale `0` in the store was never consulted; the database decided.
    // The suspended path then primes a positive marker over it.
    expect(store.get('suspension:user:u1')).toBe('1');
  });
});
