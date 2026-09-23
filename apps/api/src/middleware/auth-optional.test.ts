import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * Finding 8 — `optionalAuth` must apply the same persistent account-state gate
 * as `authenticate`.
 *
 * "Optional" is about the *absence* of a credential, not about its validity. A
 * present-but-unusable token (suspended, deactivated, deleted or missing user)
 * must never be attached as `req.user`, or a handler branching on it treats the
 * caller as the person the token names.
 */
const verifyToken = vi.fn();
const isUserSuspended = vi.fn();

vi.mock('@/lib/jwt', () => ({ verifyToken: (...args: unknown[]) => verifyToken(...args) }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(), setex: vi.fn(), set: vi.fn() } }));
vi.mock('@/utils/user-suspension', () => ({
  isUserSuspended: (...args: unknown[]) => isUserSuspended(...args),
}));

import { optionalAuth } from './auth';

const makeReq = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {}, params: {}, body: {} }) as unknown as Request;

describe('optionalAuth account-state gate', () => {
  let next: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    next = vi.fn();
    vi.clearAllMocks();
  });

  it('does not attach a suspended account as the principal', async () => {
    verifyToken.mockReturnValue({
      sub: 'user-suspended',
      type: 'access',
      roleCode: 'YAYASAN_KETUA',
    });
    isUserSuspended.mockResolvedValue(true);

    const req = makeReq('Bearer access-token');
    await optionalAuth(req, {} as Response, next as unknown as NextFunction);

    expect(isUserSuspended).toHaveBeenCalledWith('user-suspended');
    expect(req.user).toBeUndefined();
    // Anonymous, not 401 — the endpoint contract serves anonymous callers too.
    expect(next).toHaveBeenCalledWith();
  });

  it('attaches a live account as the principal', async () => {
    verifyToken.mockReturnValue({ sub: 'user-active', type: 'access', roleCode: 'YAYASAN_KETUA' });
    isUserSuspended.mockResolvedValue(false);

    const req = makeReq('Bearer access-token');
    await optionalAuth(req, {} as Response, next as unknown as NextFunction);

    expect(req.user).toMatchObject({ sub: 'user-active' });
    expect(next).toHaveBeenCalledWith();
  });

  it('treats a missing credential as anonymous without a state read', async () => {
    const req = makeReq();
    await optionalAuth(req, {} as Response, next as unknown as NextFunction);

    expect(isUserSuspended).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('ignores a temporary 2FA token instead of attaching it', async () => {
    verifyToken.mockReturnValue({ sub: 'user-1', type: 'access', isTemp: true });

    const req = makeReq('Bearer temp-token');
    await optionalAuth(req, {} as Response, next as unknown as NextFunction);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});
