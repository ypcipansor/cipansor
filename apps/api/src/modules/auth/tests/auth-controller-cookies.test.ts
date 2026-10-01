/**
 * The auth controller must never hand a bearer token to browser JavaScript.
 *
 * The migration's whole point is that the token stops being script-readable.
 * Issuing the HttpOnly cookie alone is not enough: if the response body still
 * carried `accessToken`/`refreshToken`, the page could read them and the
 * vulnerability would be unchanged, just harder to notice. So the controller
 * answers a browser with the user only, and returns the raw tokens only to a
 * client that explicitly declares itself bearer AND presents no session cookie.
 *
 * The second condition is the one the review added. `X-Client: bearer` is set by
 * page JavaScript, so a cookie-authenticated request could add it and the API
 * would hand back a fresh 15-minute access token and a 30-day refresh token —
 * exactly the exfiltration #523 is about. The test below runs the fetch the
 * review wrote and asserts the body carries no token.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const { authServiceMock } = vi.hoisted(() => ({
  authServiceMock: {
    login: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
    verifyTwoFactorLogin: vi.fn(),
    getTwoFactorStatus: vi.fn(),
  },
}));

vi.mock('../auth.service', () => ({ authService: authServiceMock }));
vi.mock('@/lib/jwt', () => ({
  getExpirationDate: vi.fn(() => new Date(Date.now() + 86_400_000)),
  // The routing claims are read from the token the controller just minted.
  decodeToken: vi.fn(() => ({ sub: 'u-1', role: 'UNIT_ADMIN', roleCode: 'SDIT_ADMIN' })),
}));
vi.mock('@/lib/event-bus', () => ({ eventBus: { emit: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  login,
  refreshToken,
  logout,
  verifyTwoFactorLogin,
  getTwoFactorStatus,
} from '../auth.controller';
import { ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE, PRINCIPAL_COOKIE } from '../auth.cookies';

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
    headers: {} as Record<string, string>,
    json(payload: unknown) {
      (this as any).jsonPayload = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      (this as any).headers[name] = value;
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
  } as unknown as Response & { jsonPayload: any; headers: Record<string, string> };
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
    expect(cookies.some((c) => c.name === PRINCIPAL_COOKIE)).toBe(true);
  });

  it('still returns tokens to an explicit, cookie-less bearer client', async () => {
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
    await refreshToken(
      mockReq({ cookies: { [REFRESH_COOKIE]: 'refresh-1', [CSRF_COOKIE]: 'csrf-1' } }),
      res,
      vi.fn()
    );

    expect(authServiceMock.refreshToken).toHaveBeenCalledWith('refresh-1');
    expect(cookies.find((c) => c.name === ACCESS_COOKIE)?.value).toBe('access-2');
    expect(cookies.find((c) => c.name === REFRESH_COOKIE)?.value).toBe('refresh-2');
    // The browser body says only that it refreshed; no token leaves in JSON.
    expect(res.jsonPayload.data).toEqual({ refreshed: true });
    // The CSRF token is not rotated on refresh — the request keeps working.
    expect(cookies.find((c) => c.name === CSRF_COOKIE)?.value).toBe('csrf-1');
  });

  it('never answers a cookie-authenticated refresh with tokens, even with X-Client: bearer', async () => {
    // The review's exact reproduction: an injected script on the portal origin
    // calls refresh with credentials, the X-Client header, and the CSRF echo.
    authServiceMock.refreshToken.mockResolvedValue({
      accessToken: 'AT-new',
      refreshToken: 'RT-new',
    });

    const { res } = mockRes();
    await refreshToken(
      mockReq({
        cookies: { [REFRESH_COOKIE]: 'RT-old', [CSRF_COOKIE]: 'csrf' },
        headers: { 'x-client': 'bearer', 'x-csrf-token': 'csrf' },
      }),
      res,
      vi.fn()
    );

    const data = res.jsonPayload.data;
    expect(data.refreshToken).toBeUndefined();
    expect(data.accessToken).toBeUndefined();
    // The rotated tokens still reach the browser — as HttpOnly cookies.
    expect(res.jsonPayload.data).toEqual({ refreshed: true });
  });

  it('never answers a cookie-authenticated 2FA verify with tokens', async () => {
    authServiceMock.verifyTwoFactorLogin.mockResolvedValue({
      user: USER,
      accessToken: 'AT-new',
      refreshToken: 'RT-new',
    });

    const { res } = mockRes();
    await verifyTwoFactorLogin(
      mockReq({
        body: { token: '123456' },
        user: { sub: 'u-1', isTemp: true },
        cookies: { [ACCESS_COOKIE]: 'temp' },
        headers: { 'x-client': 'bearer' },
      }),
      res,
      vi.fn()
    );

    expect(res.jsonPayload.data.refreshToken).toBeUndefined();
    expect(res.jsonPayload.data.accessToken).toBeUndefined();
  });

  it('clears every session cookie when the refresh is refused', async () => {
    // A revoked, expired or unknown refresh token. Leaving the routing cookie
    // behind loops the browser between /login and the dashboard.
    authServiceMock.refreshToken.mockRejectedValue(
      Object.assign(new Error('Invalid refresh token'), { statusCode: 401 })
    );

    const { res, cookies, cleared } = mockRes();
    const next = vi.fn();
    await refreshToken(
      mockReq({ cookies: { [REFRESH_COOKIE]: 'revoked', [CSRF_COOKIE]: 'csrf-1' } }),
      res,
      next
    );

    // asyncHandler does not return its promise; wait for the error to land.
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(cookies).toEqual([]);
    expect(cleared).toEqual(
      expect.arrayContaining([ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE, PRINCIPAL_COOKIE])
    );
  });

  it('leaves the cookies alone when there is no refresh token at all', async () => {
    // Nothing to end. Clearing here raced a sign-in in the same browser: the
    // answer to a stray refresh from the login page landed after the sign-in
    // had set the cookies, and wiped them.
    const { res, cookies, cleared } = mockRes();
    const next = vi.fn();
    await refreshToken(mockReq({ cookies: { [PRINCIPAL_COOKIE]: '{}' } }), res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(authServiceMock.refreshToken).not.toHaveBeenCalled();
    expect(cookies).toEqual([]);
    expect(cleared).toEqual([]);
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
    expect(cleared).toEqual(
      expect.arrayContaining([ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE, PRINCIPAL_COOKIE])
    );
  });

  it('marks the 2FA status no-store so a revalidation cannot answer 304', async () => {
    authServiceMock.getTwoFactorStatus.mockResolvedValue({ enabled: false, isInvited: true });

    const { res } = mockRes();
    await getTwoFactorStatus(mockReq(), res, vi.fn());

    expect(authServiceMock.getTwoFactorStatus).toHaveBeenCalledWith('u-1');
    expect(res.jsonPayload.data).toEqual({ enabled: false, isInvited: true });
    // Express would otherwise add an ETag and a 304 on `If-None-Match`; the web
    // client's post-sign-in invitation waits for a 2xx status answer.
    expect(res.headers['Cache-Control']).toBe('no-store, private');
  });
});
