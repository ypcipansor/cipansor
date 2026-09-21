import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * The 2FA door had no suspension check: a temporary token minted *before* a
 * suspension could still be presented at `/2fa/login`, complete the OTP and
 * receive a fresh access + refresh pair for an account that had since been
 * switched off. The pre-authentication middleware accepts temporary tokens by
 * design, so the check has to live here.
 */
const verifyToken = vi.fn();
const isUserSuspended = vi.fn();

vi.mock('@/lib/jwt', () => ({ verifyToken: (...args: unknown[]) => verifyToken(...args) }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(), setex: vi.fn(), set: vi.fn() } }));
vi.mock('@/utils/user-suspension', () => ({
  isUserSuspended: (...args: unknown[]) => isUserSuspended(...args),
}));

import { authenticate2FA } from './auth';

const makeReq = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {}, params: {}, body: {} }) as unknown as Request;

describe('authenticate2FA suspension gate', () => {
  let next: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    next = vi.fn();
    vi.clearAllMocks();
  });

  it('refuses a temporary token whose account was suspended after it was minted', async () => {
    // The token was issued at the start of the login; the suspension lands
    // before the OTP is presented. The signature is still valid.
    verifyToken.mockReturnValue({
      sub: 'user-suspended',
      type: 'access',
      isTemp: true,
      roleCode: 'YAYASAN_KETUA',
    });
    isUserSuspended.mockResolvedValue(true);

    await authenticate2FA(
      makeReq('Bearer temp-token'),
      {} as Response,
      next as unknown as NextFunction
    );

    // `next` is called with the error the async handler wraps, so the route
    // never reaches the OTP verification that would mint tokens.
    const error = next.mock.calls[0]?.[0];
    expect(error).toMatchObject({ statusCode: 401 });
    expect(isUserSuspended).toHaveBeenCalledWith('user-suspended');
  });

  it('lets a live account through the 2FA gate', async () => {
    verifyToken.mockReturnValue({
      sub: 'user-active',
      type: 'access',
      isTemp: true,
      roleCode: 'YAYASAN_KETUA',
    });
    isUserSuspended.mockResolvedValue(false);

    const req = makeReq('Bearer temp-token');
    await authenticate2FA(req, {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({ sub: 'user-active' });
  });

  it('still rejects a refresh token presented at the 2FA door', async () => {
    verifyToken.mockReturnValue({ sub: 'user-1', type: 'refresh' });

    await authenticate2FA(
      makeReq('Bearer refresh-token'),
      {} as Response,
      next as unknown as NextFunction
    );

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
    expect(isUserSuspended).not.toHaveBeenCalled();
  });
});
