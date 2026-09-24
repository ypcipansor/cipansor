import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Session cookies must be unreadable to script and secure in production.
 *
 * The finding this pins: the access/refresh tokens used to be handed to the
 * browser as JSON, which the web app persisted in `localStorage` and a
 * `document.cookie` write. A JavaScript-written cookie can never be `HttpOnly`,
 * so any XSS could read and replay a 30-day refresh token. The API now issues
 * them itself, and these tests assert the flags that make the difference — a
 * regression to a script-readable cookie (or a lost `Secure` in production)
 * fails here.
 */

const ENV = { ...process.env };

async function loadModule() {
  vi.resetModules();
  return import('@/utils/auth-cookies');
}

function tokenPair() {
  return {
    accessToken: 'header.payload.signature',
    refreshToken: 'refresh-token-value',
  };
}

describe('sessionCookies', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ENV };
  });

  it('marks every session cookie HttpOnly and SameSite=Lax', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_COOKIE_SECURE = 'false';
    const { sessionCookies } = await loadModule();

    const cookies = await sessionCookies(tokenPair() as never);

    expect(cookies.length).toBe(3);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/;\s*HttpOnly/);
      expect(cookie).toMatch(/;\s*SameSite=Lax/);
    }
  });

  it('adds Secure in production and omits it in local http dev', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(48);
    delete process.env.AUTH_COOKIE_SECURE;
    let mod = await loadModule();
    for (const cookie of await mod.sessionCookies(tokenPair() as never)) {
      expect(cookie).toMatch(/;\s*Secure/);
    }

    process.env.NODE_ENV = 'development';
    mod = await loadModule();
    for (const cookie of await mod.sessionCookies(tokenPair() as never)) {
      expect(cookie).not.toMatch(/;\s*Secure/);
    }
  });

  it('names the access, refresh and routing cookies distinctly', async () => {
    process.env.NODE_ENV = 'development';
    const { sessionCookies } = await loadModule();
    const { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, ROUTING_COOKIE } =
      await import('@cipansor/shared');

    const names = (await sessionCookies(tokenPair() as never)).map((c) => c.split('=')[0]);
    expect(names).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, ROUTING_COOKIE]);
  });

  it('signs the routing cookie so it verifies and is not plain base64 JSON', async () => {
    process.env.NODE_ENV = 'development';
    const { sessionCookies } = await loadModule();
    const { ROUTING_COOKIE, resolveRoutingCookieSecret, verifyRoutingCookie } =
      await import('@cipansor/shared');

    const cookie = (await sessionCookies(tokenPair() as never)).find((c) =>
      c.startsWith(`${ROUTING_COOKIE}=`)
    );
    expect(cookie).toBeDefined();
    const value = cookie!.slice(`${ROUTING_COOKIE}=`.length).split(';')[0];

    // A signed value is `payload.mac`, not a bare base64url JSON blob.
    expect(value).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const payload = await verifyRoutingCookie(
      value,
      resolveRoutingCookieSecret({
        JWT_SECRET: process.env.JWT_SECRET,
        NODE_ENV: process.env.NODE_ENV,
      })
    );
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe('');
  });

  it('clears every session cookie with Max-Age=0 and HttpOnly', async () => {
    const { clearedSessionCookies } = await loadModule();
    const cookies = clearedSessionCookies();

    expect(cookies.length).toBe(4);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/Max-Age=0/);
      expect(cookie).toMatch(/;\s*HttpOnly/);
    }
  });

  it('short-lived 2FA cookie is HttpOnly too', async () => {
    process.env.NODE_ENV = 'development';
    const { twoFactorCookie } = await loadModule();
    expect(twoFactorCookie('tmp-token')).toMatch(/;\s*HttpOnly/);
  });
});

describe('routing cookie secret resolution', () => {
  it('prefers a dedicated ROUTING_COOKIE_SECRET over JWT_SECRET', async () => {
    const { resolveRoutingCookieSecret } = await import('@cipansor/shared');
    expect(
      resolveRoutingCookieSecret({
        ROUTING_COOKIE_SECRET: 'dedicated',
        JWT_SECRET: 'jwt',
        NODE_ENV: 'production',
      })
    ).toBe('dedicated');
  });

  it('falls back to JWT_SECRET when no dedicated secret is set', async () => {
    const { resolveRoutingCookieSecret } = await import('@cipansor/shared');
    expect(resolveRoutingCookieSecret({ JWT_SECRET: 'jwt', NODE_ENV: 'production' })).toBe('jwt');
  });

  it('refuses to resolve a key in production when neither secret is set', async () => {
    const { resolveRoutingCookieSecret } = await import('@cipansor/shared');
    expect(() => resolveRoutingCookieSecret({ NODE_ENV: 'production' })).toThrow(
      /ROUTING_COOKIE_SECRET/
    );
  });

  it('uses a fixed dev key so local `pnpm dev` needs no .env', async () => {
    const { resolveRoutingCookieSecret } = await import('@cipansor/shared');
    const dev = resolveRoutingCookieSecret({ NODE_ENV: 'development' });
    expect(dev).toBeTruthy();
    expect(dev).not.toBe(resolveRoutingCookieSecret({ JWT_SECRET: 'jwt' }));
  });
});
