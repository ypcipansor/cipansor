import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The suspension check runs on every authenticated request, so its dangerous
 * modes are silent: it can let a deleted user back in, and a stale cache write
 * can resurrect a marker for an account that has already been restored.
 */

// A small in-memory Redis stand-in. `eval` interprets the compare-and-set
// script with the same version *and state-precedence* ordering Redis would
// apply, so the tests exercise the real write path (argument shape + ordering)
// rather than stubbed returns.
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
    const currentState = match ? match[1] : null;
    const incoming = Number(version);
    // Mirror the Lua exactly: a strictly newer version always wins; an equal
    // version is won only by a tombstone that is not already the stored state.
    const accept =
      incoming > current || (incoming === current && state === 'n' && currentState !== 'n');
    if (accept) {
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

  it('honours a versioned positive marker that matches the durable version', async () => {
    // A marker whose version equals the account's current `accountStateVersion`
    // is still authoritative: no account-state write has happened since. The
    // durable read confirms it, so the short-circuit is safe.
    store.set('suspension:user:u1', 's:7');
    mockUser({ isActive: false, deletedAt: null, accountStateVersion: 7 });
    await expect(isUserSuspended('u1')).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });

  it('ignores a stale positive marker whose version is behind the account', async () => {
    // The lift committed at version 8 (its tombstone write failed) but the stale
    // `s:7` remains in Redis. The durable version moved on, so the marker must
    // not decide and the restored account must be allowed.
    store.set('suspension:user:u1', 's:7');
    mockUser({ isActive: true, deletedAt: null, accountStateVersion: 8 });
    await expect(isUserSuspended('u1')).resolves.toBe(false);
    expect(prisma.user.findUnique).toHaveBeenCalled();
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

  it('a stale suspension prime cannot overwrite a same-version lift tombstone', async () => {
    // The exact race in the review: a request reads the account as suspended
    // (version 5), the lift commits and records `n:5`, then the stale read primes
    // `s:5`. The tombstone must survive, or the restored account is refused for
    // the whole TTL.
    await invalidateUserSuspensionCache('u1', 5);
    await markUserSuspended('u1', 5);
    expect(store.get('suspension:user:u1')).toBe('n:5');
  });

  it('a newer re-suspension still overwrites an older tombstone', async () => {
    await invalidateUserSuspensionCache('u1', 5);
    // The re-suspension bumps the counter, so its positive marker must win.
    await markUserSuspended('u1', 6);
    expect(store.get('suspension:user:u1')).toBe('s:6');
    mockUser({ isActive: false, deletedAt: null, accountStateVersion: 6 });
    await expect(isUserSuspended('u1')).resolves.toBe(true);
  });

  it('an idempotent replay of the same tombstone does not reshuffle state', async () => {
    await invalidateUserSuspensionCache('u1', 8);
    await invalidateUserSuspensionCache('u1', 8);
    expect(store.get('suspension:user:u1')).toBe('n:8');
  });

  it('the compare-and-set script decides equal versions by state precedence', () => {
    // A strictly newer version always wins; an equal version is won only by a
    // tombstone over a different marker. The old `>=` accepted the stale
    // positive marker and is the bug this replaces.
    expect(SUSPENSION_CACHE_CAS_SCRIPT).toContain('incoming > current');
    expect(SUSPENSION_CACHE_CAS_SCRIPT).toContain("ARGV[1] == 'n' and currentState ~= 'n'");
    expect(SUSPENSION_CACHE_CAS_SCRIPT).not.toContain('>= current');
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

describe('a failed lift invalidation cannot lock out a restored account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    noActiveSuspension();
  });

  it('allows the restored account even though the tombstone write failed', async () => {
    // Suspend at version 5 records `s:5`. The lift commits at version 6, but
    // its best-effort `n:6` tombstone write fails. The stale `s:5` is now
    // behind the durable version, so it must not keep the account refused
    // until the TTL; the database decides and the account is active.
    await markUserSuspended('u1', 5);
    redisEval.mockRejectedValueOnce(new Error('redis down'));
    await invalidateUserSuspensionCache('u1', 6);
    expect(store.get('suspension:user:u1')).toBe('s:5');

    mockUser({ isActive: true, deletedAt: null, accountStateVersion: 6 });
    await expect(isUserSuspended('u1')).resolves.toBe(false);
  });

  it('still refuses when the durable account state really is suspended', async () => {
    // Guard against the comparison being read as "ignore all positive
    // markers": a current-version marker (no state write since) still refuses.
    await markUserSuspended('u1', 5);
    await invalidateUserSuspensionCache('u1', 6);
    await markUserSuspended('u1', 6);
    mockUser({ isActive: false, deletedAt: null, accountStateVersion: 6 });
    await expect(isUserSuspended('u1')).resolves.toBe(true);
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
