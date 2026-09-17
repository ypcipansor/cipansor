import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The suspension check runs on every authenticated request, so its two
 * dangerous modes are silent: it can let a deleted user back in, and a stale
 * database read can overwrite a fresh suspension in the cache.
 */

// A small in-memory Redis stand-in. `eval` implements the compare-and-set the
// production Lua script performs, so the concurrency test exercises the real
// "a stale `0` may not lower a `1`" rule rather than a stubbed return value.
const store = new Map<string, string>();
const redisGet = vi.fn(async (key: string) => store.get(key) ?? null);
const redisDel = vi.fn(async (key: string) => (store.delete(key) ? 1 : 0));
const redisEval = vi.fn(async (_script: string, _numKeys: number, key: string, value: string) => {
  const current = store.get(key);
  if (current === '1' && value === '0') return 0;
  store.set(key, value);
  return 1;
});

vi.mock('@/lib/redis', () => ({
  redis: {
    get: (...args: [string]) => redisGet(...args),
    del: (...args: [string]) => redisDel(...args),
    eval: (...args: [string, number, string, string]) => redisEval(...args),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    boardMemberSuspension: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
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

  it('swallows a Redis failure on invalidate', async () => {
    redisDel.mockRejectedValueOnce(new Error('redis down'));
    await expect(invalidateUserSuspensionCache('u1')).resolves.toBeUndefined();
  });
});

describe('stale-negative race', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    noActiveSuspension();
  });

  it('a stale database read cannot lower a suspension marker committed mid-read', async () => {
    // The exact interleaving: request A misses the cache and reads the database
    // while the account is still active; the suspension commits and writes `1`;
    // A finishes last and tries to write `0`. The marker must survive, or the
    // suspended token authenticates again for a whole TTL.
    let releaseRead: (row: unknown) => void = () => {};
    const readGate = new Promise((resolve) => {
      releaseRead = resolve;
    });
    (prisma.user.findUnique as any).mockReturnValue(readGate);

    const staleRequest = isUserSuspended('u1');

    // The suspension commits while A is still awaiting its database read.
    await markUserSuspended('u1');
    expect(store.get('suspension:user:u1')).toBe('1');

    // A's read resolves to the pre-suspension row and it writes `0`.
    releaseRead({ isActive: true, deletedAt: null });
    await expect(staleRequest).resolves.toBe(false);

    // The stored marker is still `1`: the next request on any replica refuses.
    expect(store.get('suspension:user:u1')).toBe('1');
    expect(await isUserSuspended('u1')).toBe(true);
  });
});
