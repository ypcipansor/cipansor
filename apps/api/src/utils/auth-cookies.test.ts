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

    const cookies = sessionCookies(tokenPair() as never);

    expect(cookies.length).toBe(3);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/;\s*HttpOnly/);
      expect(cookie).toMatch(/;\s*SameSite=Lax/);
    }
  });

  it('adds Secure in production and omits it in local http dev', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_COOKIE_SECURE;
    let mod = await loadModule();
    for (const cookie of mod.sessionCookies(tokenPair() as never)) {
      expect(cookie).toMatch(/;\s*Secure/);
    }

    process.env.NODE_ENV = 'development';
    mod = await loadModule();
    for (const cookie of mod.sessionCookies(tokenPair() as never)) {
      expect(cookie).not.toMatch(/;\s*Secure/);
    }
  });

  it('names the access, refresh and routing cookies distinctly', async () => {
    process.env.NODE_ENV = 'development';
    const { sessionCookies } = await loadModule();
    const { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, ROUTING_COOKIE } =
      await import('@cipansor/shared');

    const names = sessionCookies(tokenPair() as never).map((c) => c.split('=')[0]);
    expect(names).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, ROUTING_COOKIE]);
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
