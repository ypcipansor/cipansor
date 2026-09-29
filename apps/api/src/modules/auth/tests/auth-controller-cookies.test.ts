/**
 * The auth controller must never hand a bearer token to browser JavaScript.
 *
 * The migration's whole point is that the token stops being script-readable.
 * Issuing the HttpOnly cookie alone is not enough: if the response body still
 * carried `accessToken`/`refreshToken`, the page could read them and the
 * vulnerability would be unchanged, just harder to notice. So the controller
 * answers a browser with the user only, and returns the raw tokens only to a
 * client that explicitly declares itself bearer (`X-Client: bearer`) — the
 * mobile app and the e2e API helpers.
 *
 * These tests also pin the rotation on refresh and the clearing on logout, both
 * of which the issue lists as required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const { authServiceMock } = vi.hoisted(() => ({
  authServiceMock: {
    login: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
    verifyTwoFactorLogin: vi.fn(),
  },
}));

vi.mock('../auth.service', () => ({ authService: authServiceMock }));
vi.mock('@/lib/jwt', () => ({
  getExpirationDate: vi.fn(() => new Date(Date.now() + 86_400_000)),
}));
vi.mock('@/lib/event-bus', () => ({ eventBus: { emit: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { login, refreshToken, logout } from '../auth.controller';
import { ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE } from '../auth.cookies';

const USER = {
  id: 'u-1',
  email: 'guru@example.test',
  name: 'Guru',
  role: 'TEACHER',
  roleCode: 'SDIT_GURU',
  unitId: 'unit-1',
  permissions: [],
};

function mockRes() {
  const cookies: Array<{ name: string; value: string; options: any }> = [];
  const cleared: string[] = [];
  const res = {
    jsonPayload: undefined as unknown,
    json(payload: unknown) {
      (this as any).jsonPayload = payload;
      return this;
    },
    cookie(name: string, value: string, options: any) {
      cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name: string) {
      cleared.push(name);
      return this;
    },
  } as unknown as Response & { jsonPayload: any };
  return { res, cookies, cleared };
}

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: {},
    cookies: {},
    body: {},
    user: { sub: 'u-1' },
    ...overrides,
  } as unknown as Request;
}

describe('auth controller: cookies, not body tokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gives a browser the user only, and sets the HttpOnly session cookies', async () => {
    authServiceMock.login.mockResolvedValue({
      user: USER,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });

    const { res, cookies } = mockRes();
    await login(mockReq(), res, vi.fn());

    // The body carries no token — this is the security property.
    expect(res.jsonPayload.data).toEqual({ user: USER });
    expect(res.jsonPayload.data.accessToken).toBeUndefined();
    expect(res.jsonPayload.data.refreshToken).toBeUndefined();

    expect(cookies.find((c) => c.name === ACCESS_COOKIE)?.value).toBe('access-1');
    expect(cookies.find((c) => c.name === ACCESS_COOKIE)?.options.httpOnly).toBe(true);
    expect(cookies.find((c) => c.name === REFRESH_COOKIE)?.value).toBe('refresh-1');
    expect(cookies.find((c) => c.name === REFRESH_COOKIE)?.options.httpOnly).toBe(true);
    expect(cookies.some((c) => c.name === CSRF_COOKIE)).toBe(true);
  });

  it('still returns tokens to an explicit bearer client', async () => {
    authServiceMock.login.mockResolvedValue({
      user: USER,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });

    const { res } = mockRes();
    await login(mockReq({ headers: { 'x-client': 'bearer' } }), res, vi.fn());

    expect(res.jsonPayload.data.accessToken).toBe('access-1');
    expect(res.jsonPayload.data.refreshToken).toBe('refresh-1');
  });

  it('reads the refresh token from the cookie and rotates the session', async () => {
    authServiceMock.refreshToken.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });

    const { res, cookies } = mockRes();
    await refreshToken(mockReq({ cookies: { [REFRESH_COOKIE]: 'refresh-1' } }), res, vi.fn());

    expect(authServiceMock.refreshToken).toHaveBeenCalledWith('refresh-1');
    expect(cookies.find((c) => c.name === ACCESS_COOKIE)?.value).toBe('access-2');
    expect(cookies.find((c) => c.name === REFRESH_COOKIE)?.value).toBe('refresh-2');
    // The browser body says only that it refreshed; no token leaves in JSON.
    expect(res.jsonPayload.data).toEqual({ refreshed: true });
  });

  it('revokes the cookie refresh token on logout and clears every cookie', async () => {
    const { res, cleared } = mockRes();
    await logout(
      mockReq({
        cookies: { [REFRESH_COOKIE]: 'refresh-1' },
        user: { sub: 'u-1' },
      }),
      res,
      vi.fn()
    );

    expect(authServiceMock.logout).toHaveBeenCalledWith('u-1', 'refresh-1');
    expect(cleared).toEqual(expect.arrayContaining([ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]));
  });
});
