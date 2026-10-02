/**
 * The token a sign-in hands out when the password must change opens exactly
 * one route, `POST /auth/new-password`. It is refused as a session and at the
 * 2FA step — a second /2fa/login with it would be a session without the new
 * password — and that route refuses every other token.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const { verifyToken } = vi.hoisted(() => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/jwt', () => ({ verifyToken }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(), setex: vi.fn() } }));

import { authenticate, authenticate2FA, authenticatePasswordChange } from './auth';

const base = { sub: 'user-1', id: 'user-1', email: 'guru@example.test', roleCode: 'SDIT_GURU' };
const TOKENS = {
  session: { ...base, type: 'access' },
  twoFactorStep: { ...base, type: 'access', isTemp: true },
  passwordChange: { ...base, type: 'access', isTemp: true, purpose: 'password-change' },
  refresh: { ...base, type: 'refresh' },
} as const;

function run(
  middleware: typeof authenticate,
  token: keyof typeof TOKENS
): { error?: { statusCode?: number }; req: Request } {
  verifyToken.mockReturnValue(TOKENS[token]);
  const req = { headers: { authorization: 'Bearer t' }, cookies: {} } as unknown as Request;
  const next = vi.fn();
  middleware(req, {} as Response, next);
  return { error: next.mock.calls[0]?.[0], req };
}

beforeEach(() => vi.clearAllMocks());

describe('the token for a required password change', () => {
  it('is not a session', () => {
    expect(run(authenticate, 'passwordChange').error).toMatchObject({ statusCode: 401 });
  });

  it('cannot complete the 2FA step', () => {
    expect(run(authenticate2FA, 'passwordChange').error).toMatchObject({ statusCode: 401 });
  });

  it('opens the route that sets the new password', () => {
    const { error, req } = run(authenticatePasswordChange, 'passwordChange');
    expect(error).toBeUndefined();
    expect(req.user).toMatchObject({ sub: 'user-1' });
  });
});

describe('the route that sets the new password', () => {
  it.each(['session', 'twoFactorStep', 'refresh'] as const)('refuses a %s token', (token) => {
    expect(run(authenticatePasswordChange, token).error).toMatchObject({ statusCode: 401 });
  });

  it('refuses a request with no token', () => {
    const next = vi.fn();
    authenticatePasswordChange(
      { headers: {}, cookies: {} } as unknown as Request,
      {} as Response,
      next
    );
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });
});

describe('the 2FA step still takes its own token', () => {
  it('accepts the temporary token from sign-in', () => {
    expect(run(authenticate2FA, 'twoFactorStep').error).toBeUndefined();
  });
});
