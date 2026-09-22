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
vi.mock('@/lib/event-bus', () => ({ eventBus: { emit: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { authService } from '@/modules/auth/auth.service';
import {
  login,
  refreshToken as refreshTokenHandler,
  logout,
  verifyTwoFactorLogin,
} from '@/modules/auth/auth.controller';
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

describe('auth cookie issuance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTH_COOKIE_SECURE;
  });

  it('login sets HttpOnly session cookies and keeps the bearer fields', async () => {
    vi.mocked(authService.login).mockResolvedValue({ user: { id: 'user-1' }, ...TOKENS } as never);
    const { req, res, cookies } = mockReqRes({ email: 'a@b.c', password: 'x' });

    await login(req, res, () => {});

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

    for (const c of cookies()) expect(c).toMatch(/;\s*Secure/);
  });

  it('omits Secure for local http dev so the cookie is not dropped', async () => {
    process.env.AUTH_COOKIE_SECURE = 'false';
    vi.mocked(authService.login).mockResolvedValue({ user: { id: 'user-1' }, ...TOKENS } as never);
    const { req, res, cookies } = mockReqRes({ email: 'a@b.c', password: 'x' });

    await login(req, res, () => {});

    for (const c of cookies()) expect(c).not.toMatch(/;\s*Secure/);
  });

  it('refresh reads the cookie when the body is absent and rotates the cookies', async () => {
    vi.mocked(authService.refreshToken).mockResolvedValue({ ...TOKENS } as never);
    const { req, res, cookies } = mockReqRes({}, `${REFRESH_TOKEN_COOKIE}=old-refresh; other=x`);

    await refreshTokenHandler(req, res, () => {});

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

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('logout revokes the token and clears all session cookies', async () => {
    const { req, res, cookies } = mockReqRes({}, `${REFRESH_TOKEN_COOKIE}=r; `);
    await logout(req, res, () => {});

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

  it('2FA login replaces the temp cookie with the full HttpOnly session', async () => {
    vi.mocked(authService.verifyTwoFactorLogin).mockResolvedValue({
      user: { id: 'user-1' },
      ...TOKENS,
    } as never);
    const { req, res, cookies } = mockReqRes({ token: '123456' });

    await verifyTwoFactorLogin(req, res, () => {});

    for (const c of cookies()) expect(c).toMatch(/;\s*HttpOnly/);
    expect((res as never as { jsonPayload: any }).jsonPayload.data.accessToken).toBe('a.b.c');
  });
});
