/**
 * The session cookies, and the two gates that come with them: double-submit
 * CSRF, and "a cookie-authenticated request never receives a token".
 *
 * Before this, the web client kept the access and refresh tokens in
 * `localStorage` and mirrored a JavaScript-readable `accessToken` cookie that
 * `middleware.ts` trusted. A cookie written through `document.cookie` can never
 * be `HttpOnly`, so a single XSS could exfiltrate a session that outlives the
 * tab. The API now issues the cookies itself and the client never touches them.
 *
 * These tests pin the security properties that make that migration real:
 * `HttpOnly` on both token cookies (so no script can read them), `Secure` in
 * production (so they never cross plain HTTP), `SameSite=Lax` (so they are not
 * attached to the cross-site POSTs that make up CSRF), the double-submit token
 * that covers what `Lax` leaves open, and — the property the review caught — the
 * fact that the `X-Client: bearer` header cannot convince the API to hand a
 * cookie-authenticated caller back the raw tokens it already holds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('@/lib/jwt', () => ({
  getExpirationDate: vi.fn(() => new Date(Date.now() + 86_400_000)),
}));

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  PRINCIPAL_COOKIE,
  randomCsrfToken,
  setSessionCookies,
  setTempCookie,
  clearAuthCookies,
  mayReturnTokens,
  csrfTokenForRefresh,
  principalFromCookie,
} from '../auth.cookies';
import { csrfProtection } from '@/middleware/csrf';

interface CookieCall {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

function mockRes() {
  const cookies: CookieCall[] = [];
  const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  const res = {
    cookie(name: string, value: string, options: Record<string, unknown> = {}) {
      cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name: string, options: Record<string, unknown> = {}) {
      cleared.push({ name, options });
      return this;
    },
  } as unknown as Response;
  return { res, cookies, cleared };
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return { method: 'POST', headers: {}, cookies: {}, ...overrides } as unknown as Request;
}

const PRINCIPAL = { id: 'u-1', role: 'UNIT_ADMIN', roleCode: 'SDIT_ADMIN' };

describe('session cookies', () => {
  it('sets HttpOnly access, refresh and routing cookies, plus a readable CSRF cookie', () => {
    const { res, cookies } = mockRes();
    setSessionCookies(res, 'access-token', 'refresh-token', 'csrf-token', PRINCIPAL);

    const access = cookies.find((c) => c.name === ACCESS_COOKIE)!;
    const refresh = cookies.find((c) => c.name === REFRESH_COOKIE)!;
    const principal = cookies.find((c) => c.name === PRINCIPAL_COOKIE)!;
    const csrf = cookies.find((c) => c.name === CSRF_COOKIE)!;

    expect(access.value).toBe('access-token');
    expect(access.options.httpOnly).toBe(true);
    expect(access.options.sameSite).toBe('lax');
    expect(access.options.path).toBe('/');

    expect(refresh.value).toBe('refresh-token');
    expect(refresh.options.httpOnly).toBe(true);
    expect(refresh.options.sameSite).toBe('lax');
    // The long-lived refresh credential is scoped to the auth endpoints only.
    expect(refresh.options.path).toBe('/api/auth');

    // The routing cookie holds no credential and is HttpOnly so page JS cannot
    // overwrite the real session's routing; the middleware alone reads it.
    expect(principal.options.httpOnly).toBe(true);
    expect(principal.value).toBe(JSON.stringify(PRINCIPAL));
    expect(principal.options.path).toBe('/');

    // The CSRF cookie is deliberately readable: the double-submit pattern needs
    // the client to echo it in a header. It is not a credential on its own.
    expect(csrf.options.httpOnly).toBe(false);
    expect(csrf.value).toBe('csrf-token');
  });

  it('marks the cookies Secure in production and not in dev/CI', () => {
    const prod = mockRes();
    setSessionCookies(prod.res, 'a', 'r', 'c', PRINCIPAL, true);
    for (const c of prod.cookies) {
      expect(c.options.secure).toBe(true);
    }

    // Plain-HTTP localhost/dev: a Secure cookie would simply never be stored,
    // silently dropping the session.
    const dev = mockRes();
    setSessionCookies(dev.res, 'a', 'r', 'c', PRINCIPAL, false);
    for (const c of dev.cookies) {
      expect(c.options.secure).toBe(false);
    }
  });

  it('issues the 2FA temp token in the same HttpOnly cookie', () => {
    const { res, cookies } = mockRes();
    setTempCookie(res, 'temp-token');
    const temp = cookies.find((c) => c.name === ACCESS_COOKIE)!;
    expect(temp.options.httpOnly).toBe(true);
    expect(temp.options.sameSite).toBe('lax');
    expect(temp.value).toBe('temp-token');
  });

  it('clears every cookie on logout, with the paths they were set on', () => {
    const { res, cleared } = mockRes();
    clearAuthCookies(res);
    const byName = new Map(cleared.map((c) => [c.name, c.options]));
    expect(byName.get(ACCESS_COOKIE)!.path).toBe('/');
    expect(byName.get(REFRESH_COOKIE)!.path).toBe('/api/auth');
    expect(byName.get(CSRF_COOKIE)!.path).toBe('/');
    expect(byName.get(PRINCIPAL_COOKIE)!.path).toBe('/');
  });

  it('generates a distinct, non-trivial CSRF token each call', () => {
    const a = randomCsrfToken();
    const b = randomCsrfToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe('the routing cookie the Next middleware reads', () => {
  it('round-trips the slim principal shape', () => {
    const req = mockReq({ cookies: { [PRINCIPAL_COOKIE]: JSON.stringify(PRINCIPAL) } });
    expect(principalFromCookie(req)).toEqual(PRINCIPAL);
  });

  it('is null when absent, malformed, or has no role', () => {
    expect(principalFromCookie(mockReq())).toBeNull();
    expect(
      principalFromCookie(mockReq({ cookies: { [PRINCIPAL_COOKIE]: '{not json' } }))
    ).toBeNull();
    expect(
      principalFromCookie(mockReq({ cookies: { [PRINCIPAL_COOKIE]: JSON.stringify({ id: 'x' }) } }))
    ).toBeNull();
  });
});

describe('mayReturnTokens — the token-exfiltration guard', () => {
  it('never returns tokens to a cookie-authenticated request, even with X-Client: bearer', () => {
    // The review's exact attack: page JS runs on the portal origin, adds
    // `X-Client: bearer`, and the HttpOnly cookie authenticates the call. If
    // the body answered with fresh tokens, the migration would be undone.
    const req = mockReq({
      headers: { 'x-client': 'bearer' },
      cookies: { [REFRESH_COOKIE]: 'RT-old' },
    });
    expect(mayReturnTokens(req)).toBe(false);
  });

  it('never returns tokens to a request carrying the access cookie', () => {
    const req = mockReq({
      headers: { 'x-client': 'bearer' },
      cookies: { [ACCESS_COOKIE]: 'AT' },
    });
    expect(mayReturnTokens(req)).toBe(false);
  });

  it('returns tokens only to a cookie-less client that asked', () => {
    expect(mayReturnTokens(mockReq({ headers: { 'x-client': 'bearer' } }))).toBe(true);
  });

  it('returns nothing without the header, cookie or not', () => {
    expect(mayReturnTokens(mockReq())).toBe(false);
    expect(mayReturnTokens(mockReq({ cookies: { [ACCESS_COOKIE]: 'AT' } }))).toBe(false);
  });
});

describe('csrfTokenForRefresh keeps the per-session CSRF token', () => {
  it('reuses the request’s existing value instead of rotating it', () => {
    const { res, cookies } = mockRes();
    const value = csrfTokenForRefresh(mockReq({ cookies: { [CSRF_COOKIE]: 'csrf-1' } }));
    expect(value).toBe('csrf-1');
    expect(cookies).toEqual([]); // pure: the caller sets the cookie
  });

  it('mints one when the request has none', () => {
    expect(csrfTokenForRefresh(mockReq())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('csrfProtection', () => {
  let next: NextFunction & ReturnType<typeof vi.fn>;
  beforeEach(() => {
    next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  });

  it('lets safe methods through untouched', () => {
    const req = mockReq({ method: 'GET', cookies: { [ACCESS_COOKIE]: 'a' } });
    csrfProtection(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('lets a request with no session cookie through (anonymous public POST)', () => {
    const req = mockReq({ method: 'POST', cookies: {} });
    csrfProtection(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('lets a bearer-only client through', () => {
    // No session cookie, an Authorization header: the CSRF pattern does not
    // apply to a client that carries its own token.
    const req = mockReq({
      method: 'POST',
      cookies: {},
      headers: { authorization: 'Bearer x' },
    });
    csrfProtection(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a cookie-authenticated write with no CSRF header', () => {
    const req = mockReq({
      method: 'POST',
      cookies: { [ACCESS_COOKIE]: 'a', [CSRF_COOKIE]: 'csrf' },
      headers: {},
    });
    csrfProtection(req, {} as Response, next);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(403);
  });

  it('rejects a mismatched CSRF token', () => {
    const req = mockReq({
      method: 'POST',
      cookies: { [ACCESS_COOKIE]: 'a', [CSRF_COOKIE]: 'csrf' },
      headers: { 'x-csrf-token': 'different' },
    });
    csrfProtection(req, {} as Response, next);
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });

  it('accepts a matching double-submit pair', () => {
    const req = mockReq({
      method: 'PATCH',
      cookies: { [ACCESS_COOKIE]: 'a', [CSRF_COOKIE]: 'csrf' },
      headers: { 'x-csrf-token': 'csrf' },
    });
    csrfProtection(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('guards refresh too, since the refresh cookie is a session cookie', () => {
    const req = mockReq({
      method: 'POST',
      cookies: { [REFRESH_COOKIE]: 'r' },
      headers: {},
    });
    csrfProtection(req, {} as Response, next);
    expect(next.mock.calls[0][0]?.statusCode).toBe(403);
  });
});
