import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

/**
 * The API must hand the browser a session it cannot read from script, and end
 * it cleanly.
 *
 * This pins the server side of the finding: login, refresh and 2FA-verify issue
 * `HttpOnly`, `SameSite=Lax` cookies, `Secure` when the deployment is https;
 * logout clears them. The raw bearer fields are stripped from a browser's JSON
 * body (CWE-200) and only restored for a native client that opts in with
 * `X-Client-Type: native`.
 */

vi.mock('@/modules/auth/auth.service', () => ({
  authService: {
    login: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
    verifyTwoFactorLogin: vi.fn(),
  },
}));
vi.mock('@/lib/jwt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/jwt')>()),
  verifyToken: vi.fn(),
}));
vi.mock('@/lib/event-bus', () => ({ eventBus: { emit: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { authService } from '@/modules/auth/auth.service';
import {
  login,
  refreshToken as refreshTokenHandler,
  logout,
  clearSession,
  verifyTwoFactorLogin,
} from '@/modules/auth/auth.controller';
import { verifyToken } from '@/lib/jwt';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ROUTING_COOKIE,
  TWO_FACTOR_TOKEN_COOKIE,
} from '@cipansor/shared';

function mockReqRes(
  body: unknown = {},
  cookieHeader?: string,
  extraHeaders: Record<string, string> = {}
) {
  const headers: Record<string, unknown> = {};
  const req = {
    body,
    headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), ...extraHeaders },
    user: { sub: 'user-1' },
  } as unknown as Request;
  const res = {
    statusCode: 200,
    jsonPayload: undefined as unknown,
    status(code: number) {
      (this as never as { statusCode: number }).statusCode = code;
      return this;
    },
    json(payload: unknown) {
      (this as never as { jsonPayload: unknown }).jsonPayload = payload;
      return this;
    },
    getHeader(name: string) {
      return headers[name];
    },
    setHeader(name: string, value: unknown) {
      headers[name] = value;
      return this;
    },
  } as unknown as Response & { jsonPayload: any };
  return { req, res, cookies: () => (headers['Set-Cookie'] as string[]) ?? [] };
}

const TOKENS = { accessToken: 'a.b.c', refreshToken: 'r.e.f' };

/**
 * `asyncHandler` returns `void` (express 5 ignores the handler's return value),
 * so a test that awaits the exported handler only knows the synchronous part
 * ran. The handlers now await the MAC'd routing cookie, whose HMAC is computed
 * off the event loop, so assertions must run after the pending work settles.
 * A short real wait is enough and keeps the assertion order readable.
 */
const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('auth cookie issuance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTH_COOKIE_SECURE;
  });

  it('sets the 2FA temp cookie Max-Age from the token TTL, never a shorter default', async () => {
    // Finding 5: the mandatory-setup flow minted a 10-minute token while the
    // cookie defaulted to 5 minutes, so the browser dropped a credential the
    // server still accepted. The controller must derive Max-Age from the
    // service's `tempTokenExpiresIn`; this asserts the 10-minute setup case.
    vi.mocked(authService.login).mockResolvedValue({
      requiresTwoFactorSetup: true,
      tempToken: 'temp.setup.token',
      tempTokenExpiresIn: '10m',
    } as never);
    const { req, res, cookies } = mockReqRes({ email: 'a@b.c', password: 'x' });

    await login(req, res, () => {});
    await flushAsync();

    const temp = cookies().find((c) => c.startsWith(`${TWO_FACTOR_TOKEN_COOKIE}=`));
    expect(temp).toBeDefined();
    // The cookie must live as long as the 10-minute token, not the old 5-minute
    // default. Allow a few seconds of slack: the max-age is computed from the
    // token's expiry at header-build time, so it can be 599 or 598 depending on
    // where the clock lands between minting and building.
    const maxAge = Number(/Max-Age=(\d+)/.exec(temp ?? '')?.[1]);
    expect(maxAge).toBeGreaterThan(590);
    expect(maxAge).toBeLessThanOrEqual(600);
  });

  it('login sets HttpOnly session cookies for a browser', async () => {
    vi.mocked(authService.login).mockResolvedValue({ user: { id: 'user-1' }, ...TOKENS } as never);
    const { req, res, cookies } = mockReqRes({ email: 'a@b.c', password: 'x' });

    await login(req, res, () => {});
    await flushAsync();

    const names = cookies().map((c) => c.split('=')[0]);
    expect(names).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, ROUTING_COOKIE]);
    for (const c of cookies()) expect(c).toMatch(/;\s*HttpOnly/);
  });

  it('strips the raw tokens from a browser login body but keeps cookies and routing', async () => {
    // Finding 4 (CWE-200): a browser must never be able to read the refresh
    // token from the response JSON — that is the XSS exposure the cookie
    // migration exists to close. The session arrives as HttpOnly cookies and
    // the body keeps only the profile + the signed routing hint.
    vi.mocked(authService.login).mockResolvedValue({ user: { id: 'user-1' }, ...TOKENS } as never);
    const { req, res, cookies } = mockReqRes({ email: 'a@b.c', password: 'x' });

    await login(req, res, () => {});
    await flushAsync();

    const body = (res as never as { jsonPayload: any }).jsonPayload.data;
    expect(body.accessToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
    expect(body.user).toEqual({ id: 'user-1' });
    expect(typeof body.routing).toBe('string');
    // The credential is still issued — as a cookie.
    expect(cookies().map((c) => c.split('=')[0])).toContain(ACCESS_TOKEN_COOKIE);
  });

  it('a native client keeps the raw pair in the login body (X-Client-Type: native)', async () => {
    vi.mocked(authService.login).mockResolvedValue({ user: { id: 'user-1' }, ...TOKENS } as never);
    const { req, res } = mockReqRes({ email: 'a@b.c', password: 'x' }, undefined, {
      'x-client-type': 'native',
    });

    await login(req, res, () => {});
    await flushAsync();

    const body = (res as never as { jsonPayload: any }).jsonPayload.data;
    expect(body.accessToken).toBe('a.b.c');
    expect(body.refreshToken).toBe('r.e.f');
  });

  it('strips the 2FA temp token from a browser challenge body but keeps the cookie', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      requiresTwoFactor: true,
      tempToken: 'temp.challenge.token',
      tempTokenExpiresIn: '5m',
    } as never);
    const { req, res, cookies } = mockReqRes({ email: 'a@b.c', password: 'x' });

    await login(req, res, () => {});
    await flushAsync();

    const body = (res as never as { jsonPayload: any }).jsonPayload.data;
    expect(body.tempToken).toBeUndefined();
    expect(body.requiresTwoFactor).toBe(true);
    expect(body.tempTokenExpiresIn).toBe('5m');
    expect(cookies().some((c) => c.startsWith(`${TWO_FACTOR_TOKEN_COOKIE}=`))).toBe(true);
  });

  it('honours AUTH_COOKIE_SECURE=true for an https deployment', async () => {
    process.env.AUTH_COOKIE_SECURE = 'true';
    vi.mocked(authService.login).mockResolvedValue({ user: { id: 'user-1' }, ...TOKENS } as never);
    const { req, res, cookies } = mockReqRes({ email: 'a@b.c', password: 'x' });

    await login(req, res, () => {});
    await flushAsync();

    for (const c of cookies()) expect(c).toMatch(/;\s*Secure/);
  });

  it('omits Secure for local http dev so the cookie is not dropped', async () => {
    process.env.AUTH_COOKIE_SECURE = 'false';
    vi.mocked(authService.login).mockResolvedValue({ user: { id: 'user-1' }, ...TOKENS } as never);
    const { req, res, cookies } = mockReqRes({ email: 'a@b.c', password: 'x' });

    await login(req, res, () => {});
    await flushAsync();

    for (const c of cookies()) expect(c).not.toMatch(/;\s*Secure/);
  });

  it('refresh reads the cookie when the body is absent and rotates the cookies', async () => {
    vi.mocked(authService.refreshToken).mockResolvedValue({ ...TOKENS } as never);
    const { req, res, cookies } = mockReqRes({}, `${REFRESH_TOKEN_COOKIE}=old-refresh; other=x`);

    await refreshTokenHandler(req, res, () => {});
    await flushAsync();

    expect(authService.refreshToken).toHaveBeenCalledWith('old-refresh');
    expect(cookies().map((c) => c.split('=')[0])).toEqual([
      ACCESS_TOKEN_COOKIE,
      REFRESH_TOKEN_COOKIE,
      ROUTING_COOKIE,
    ]);
  });

  it('refresh refuses when neither body nor cookie carries a token', async () => {
    const { req, res } = mockReqRes({});
    // `asyncHandler` forwards the thrown error to `next` rather than rejecting.
    const next = vi.fn();
    await refreshTokenHandler(req, res, next);
    await flushAsync();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('logout revokes the token and clears all session cookies', async () => {
    const { req, res, cookies } = mockReqRes({}, `${REFRESH_TOKEN_COOKIE}=r; `);
    await logout(req, res, () => {});
    await flushAsync();

    expect(authService.logout).toHaveBeenCalledWith('user-1', 'r');
    const cleared = cookies();
    expect(cleared.map((c) => c.split('=')[0])).toEqual([
      ACCESS_TOKEN_COOKIE,
      REFRESH_TOKEN_COOKIE,
      TWO_FACTOR_TOKEN_COOKIE,
      ROUTING_COOKIE,
    ]);
    for (const c of cleared) expect(c).toMatch(/Max-Age=0/);
  });

  it('session/clear deletes every session cookie and survives an invalid refresh token', async () => {
    // Finding 3: the client must be able to end a session server-side even
    // when the refresh credential is already invalid — that is the exact state
    // that leaves a stale `cipansor_routing` cookie trapping the user in a
    // login loop. The endpoint is unauthenticated on purpose and must clear
    // access, refresh, 2FA and routing regardless, without throwing.
    vi.mocked(verifyToken).mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const { req, res, cookies } = mockReqRes({}, `${REFRESH_TOKEN_COOKIE}=rotten; `);
    const next = vi.fn();

    await clearSession(req, res, next);
    await flushAsync();

    expect(next).not.toHaveBeenCalled();
    const cleared = cookies();
    expect(cleared.map((c) => c.split('=')[0])).toEqual([
      ACCESS_TOKEN_COOKIE,
      REFRESH_TOKEN_COOKIE,
      TWO_FACTOR_TOKEN_COOKIE,
      ROUTING_COOKIE,
    ]);
    for (const c of cleared) expect(c).toMatch(/Max-Age=0/);
    // An invalid token is not revocable and must not be attempted.
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('session/clear revokes a presented refresh token before clearing', async () => {
    vi.mocked(verifyToken).mockReturnValue({ type: 'refresh', sub: 'user-1' } as never);
    const { req, res, cookies } = mockReqRes({}, `${REFRESH_TOKEN_COOKIE}=live; `);

    await clearSession(req, res, () => {});
    await flushAsync();

    expect(authService.logout).toHaveBeenCalledWith('user-1', 'live');
    expect(cookies().every((c) => /Max-Age=0/.test(c))).toBe(true);
  });

  it('refresh answers a definitive rejection by clearing every session cookie', async () => {
    vi.mocked(authService.refreshToken).mockRejectedValue(
      Object.assign(new Error('Refresh token not found or expired'), { statusCode: 401 })
    );
    const { req, res, cookies } = mockReqRes({ refreshToken: 'spent' });
    const next = vi.fn();

    await refreshTokenHandler(req, res, next);
    await flushAsync();

    const cleared = cookies();
    expect(cleared.map((c) => c.split('=')[0])).toEqual([
      ACCESS_TOKEN_COOKIE,
      REFRESH_TOKEN_COOKIE,
      TWO_FACTOR_TOKEN_COOKIE,
      ROUTING_COOKIE,
    ]);
    for (const c of cleared) expect(c).toMatch(/Max-Age=0/);
    expect(next).toHaveBeenCalled();
  });

  it('refresh does NOT clear cookies when the loser of a concurrent rotation races the winner', async () => {
    // Finding 1 (this session). Two tabs refresh the same cookie: the winner
    // sets fresh session cookies, the loser is told REFRESH_RACE. If the loser
    // also returned `clearedSessionCookies()`, its Set-Cookie deletion could
    // arrive after the winner's fresh cookies (response ordering is independent
    // of the transaction) and log the user out of a session that is perfectly
    // valid. The race rejection must therefore carry no cookie header at all.
    vi.mocked(authService.refreshToken).mockRejectedValue(
      Object.assign(new Error('Refresh token is being rotated by another request'), {
        statusCode: 409,
        code: 'REFRESH_RACE',
      })
    );
    const { req, res, cookies } = mockReqRes({ refreshToken: 'spent' });
    const next = vi.fn();

    await refreshTokenHandler(req, res, next);
    await flushAsync();

    // No Set-Cookie: neither a fresh pair nor a deletion.
    expect(cookies()).toEqual([]);
    expect(next).toHaveBeenCalled();
  });

  it('2FA login replaces the temp cookie with the full HttpOnly session', async () => {
    vi.mocked(authService.verifyTwoFactorLogin).mockResolvedValue({
      user: { id: 'user-1' },
      ...TOKENS,
    } as never);
    const { req, res, cookies } = mockReqRes({ token: '123456' });

    await verifyTwoFactorLogin(req, res, () => {});
    await flushAsync();

    for (const c of cookies()) expect(c).toMatch(/;\s*HttpOnly/);
    // The browser body carries no raw token; the session is the cookie.
    expect((res as never as { jsonPayload: any }).jsonPayload.data.accessToken).toBeUndefined();
  });

  it('2FA login keeps the raw pair for a native client', async () => {
    vi.mocked(authService.verifyTwoFactorLogin).mockResolvedValue({
      user: { id: 'user-1' },
      ...TOKENS,
    } as never);
    const { req, res } = mockReqRes({ token: '123456' }, undefined, {
      'x-client-type': 'native',
    });

    await verifyTwoFactorLogin(req, res, () => {});
    await flushAsync();

    expect((res as never as { jsonPayload: any }).jsonPayload.data.accessToken).toBe('a.b.c');
  });
});
