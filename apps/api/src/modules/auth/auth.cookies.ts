import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { config } from '@/config';
import { getExpirationDate } from '@/lib/jwt';

/**
 * Session cookies.
 *
 * The web app used to keep the access and refresh tokens in `localStorage` and
 * mirror a JavaScript-readable `accessToken` cookie that `middleware.ts`
 * trusted. A cookie written by `document.cookie` can never be `HttpOnly`, so a
 * single XSS (or a malicious third-party script) could read a session that
 * outlives the tab. The API now issues the tokens itself, in cookies the page's
 * JavaScript cannot read; the web client never touches them.
 *
 * Three properties carry the security:
 * - `HttpOnly` — no script, ours or injected, can read the value.
 * - `Secure` in production — never sent over plain HTTP.
 * - `SameSite=Lax` — not attached to the cross-site POSTs that make up CSRF.
 *   The double-submit token in `middleware/csrf.ts` covers what `Lax` leaves open.
 *
 * `SameSite=Lax` also fixes the refresh-cookie scope: it is sent on the
 * top-level GETs the middleware issues and on same-site fetches, so the API's
 * `/auth/principal` sees it while a cross-site form post does not.
 */

/**
 * Cookie names.
 *
 * A `cipansor_` prefix keeps them clear of the legacy `accessToken` /
 * `auth-storage` cookies the old client wrote, so a browser upgrading mid-
 * session cannot have a stale, script-written value shadow the real one.
 */
export const ACCESS_COOKIE = 'cipansor_at';
export const REFRESH_COOKIE = 'cipansor_rt';
export const CSRF_COOKIE = 'cipansor_csrf';

/** A fresh, unguessable double-submit CSRF value. */
export function randomCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * The refresh cookie is only ever presented to `/api/auth/*` (refresh and
 * logout). Scoping it there keeps a 30-day credential off every other request.
 */
const REFRESH_COOKIE_PATH = '/api/auth';

/**
 * How long each cookie lives, derived from the token TTLs so they cannot drift.
 * Computed lazily: a module-level call would make every test that mocks
 * `@/lib/jwt` fail on import if it did not also stub `getExpirationDate`.
 */
function ttlMs(expiry: string): number {
  return Math.max(0, getExpirationDate(expiry).getTime() - Date.now());
}

const TEMP_MAX_AGE = 5 * 60 * 1000;

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

function baseOptions(path: string, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    // Secure in production only. The API runs behind TLS in production; the
    // dev/CI topology is plain HTTP on localhost, where a Secure cookie is
    // simply never stored and the session would silently vanish.
    secure: config.env === 'production',
    sameSite: 'lax',
    path,
    maxAge,
  };
}

/** The `Set-Cookie` options for the session cookies, exposed for tests. */
export function sessionCookieOptions(): CookieOptions {
  return baseOptions('/', ttlMs(config.jwt.expiresIn));
}

/** Issue (or refresh) the readable double-submit CSRF cookie. */
export function setCsrfCookie(
  res: Response,
  token: string,
  secure: boolean = config.env === 'production'
): void {
  // Readable on purpose: the double-submit pattern needs the client to echo it.
  // It is not a credential on its own — possession of it is proven by the
  // HttpOnly session cookie's absence from a cross-site request.
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlMs(config.jwt.refreshExpiresIn),
  });
}

/** Issue the full session: HttpOnly access + refresh cookies, plus the CSRF token. */
export function setSessionCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
  secure: boolean = config.env === 'production'
): void {
  res.cookie(ACCESS_COOKIE, accessToken, { ...sessionCookieOptions(), secure });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: ttlMs(config.jwt.refreshExpiresIn),
  });
  setCsrfCookie(res, csrfToken, secure);
}

/** Issue the short-lived 2FA token in the same HttpOnly cookie the session uses. */
export function setTempCookie(
  res: Response,
  tempToken: string,
  maxAgeMs: number = TEMP_MAX_AGE,
  secure: boolean = config.env === 'production'
): void {
  res.cookie(ACCESS_COOKIE, tempToken, {
    ...baseOptions('/', maxAgeMs),
    secure,
  });
  // The 2FA verify call is an unsafe POST that carries the temp session cookie,
  // so it passes the CSRF gate only if the echo cookie exists by then.
  setCsrfCookie(res, randomCsrfToken(), secure);
}

/** Clear every cookie this module can set. Called on logout and reset. */
export function clearAuthCookies(res: Response): void {
  const secure = config.env === 'production';
  res.clearCookie(ACCESS_COOKIE, { path: '/', secure, sameSite: 'lax' });
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH, secure, sameSite: 'lax' });
  res.clearCookie(CSRF_COOKIE, { path: '/', secure, sameSite: 'lax' });
}

/** The access/temp token carried in the request cookie, if any. */
export function accessTokenFromCookie(req: Request): string | undefined {
  return req.cookies?.[ACCESS_COOKIE];
}

/** The refresh token carried in the request cookie, if any. */
export function refreshTokenFromCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE];
}
