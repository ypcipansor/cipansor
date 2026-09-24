import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

/**
 * The API must hand the browser a session it cannot read from script, and end
 * it cleanly.
 *
 * This pins the server side of the finding: login, refresh and 2FA-verify issue
 * `HttpOnly`, `SameSite=Lax` cookies, `Secure` when the deployment is https;
 * logout clears them. The bearer fields stay in the JSON body for the native
 * client, but the browser's credential is the cookie.
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

function mockReqRes(body: unknown = {}, cookieHeader?: string) {
  const headers: Record<string, unknown> = {};
  const req = {
    body,
    headers: cookieHeader ? { cookie: cookieHeader } : {},
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
    expect(temp).toMatch(/Max-Age=600/);
  });

  it('login sets HttpOnly session cookies and keeps the bearer fields', async () => {
    vi.mocked(authService.login).mockResolvedValue({ user: { id: 'user-1' }, ...TOKENS } as never);
    const { req, res, cookies } = mockReqRes({ email: 'a@b.c', password: 'x' });

    await login(req, res, () => {});
    await flushAsync();

    const names = cookies().map((c) => c.split('=')[0]);
    expect(names).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, ROUTING_COOKIE]);
    for (const c of cookies()) expect(c).toMatch(/;\s*HttpOnly/);
    // The native client still receives the tokens in the body.
    expect((res as never as { jsonPayload: any }).jsonPayload.data.accessToken).toBe('a.b.c');
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
    // Finding 3's server half: the 401 that tells the client a refresh failed
    // must carry the cookie deletions itself, so no client has to remember a
    // second call to avoid the stale-routing login loop.
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

  it('2FA login replaces the temp cookie with the full HttpOnly session', async () => {
    vi.mocked(authService.verifyTwoFactorLogin).mockResolvedValue({
      user: { id: 'user-1' },
      ...TOKENS,
    } as never);
    const { req, res, cookies } = mockReqRes({ token: '123456' });

    await verifyTwoFactorLogin(req, res, () => {});
    await flushAsync();

    for (const c of cookies()) expect(c).toMatch(/;\s*HttpOnly/);
    expect((res as never as { jsonPayload: any }).jsonPayload.data.accessToken).toBe('a.b.c');
  });
});
