import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The suspension check runs on every authenticated request, so its two
 * dangerous modes are silent: it can let a deleted user back in, and a lift
 * can overwrite a concurrent suspension in the cache.
 */

const redisGet = vi.fn();
const redisSet = vi.fn();
const redisDel = vi.fn();

vi.mock('@/lib/redis', () => ({
  redis: {
    get: (...args: unknown[]) => redisGet(...args),
    set: (...args: unknown[]) => redisSet(...args),
    del: (...args: unknown[]) => redisDel(...args),
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
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    redisDel.mockResolvedValue(1);
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
    redisGet.mockResolvedValue('1');
    await expect(isUserSuspended('u1')).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to the database when Redis throws', async () => {
    redisGet.mockRejectedValue(new Error('redis down'));
    mockUser({ isActive: false, deletedAt: null });
    await expect(isUserSuspended('u1')).resolves.toBe(true);
  });
});

describe('suspension cache writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisSet.mockResolvedValue('OK');
    redisDel.mockResolvedValue(1);
  });

  it('markUserSuspended primes a positive cached answer', async () => {
    await markUserSuspended('u1');
    expect(redisSet).toHaveBeenCalledWith('suspension:user:u1', '1', 'EX', expect.any(Number));
  });

  it('invalidateUserSuspensionCache deletes the key rather than writing false', async () => {
    await invalidateUserSuspensionCache('u1');

    expect(redisDel).toHaveBeenCalledWith('suspension:user:u1');
    // The regression: a blind `false` outlives a concurrent suspension's `true`.
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('swallows a Redis failure on invalidate', async () => {
    redisDel.mockRejectedValue(new Error('redis down'));
    await expect(invalidateUserSuspensionCache('u1')).resolves.toBeUndefined();
  });
});
