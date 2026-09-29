import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  PRINCIPAL_COOKIE,
  REFRESH_COOKIE,
  type PrincipalClaims,
} from '@cipansor/shared';
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
 * A fourth cookie, `cipansor_principal`, is NOT a credential and carries no
 * token: it holds the slim `{ id, role, roleCode }` the Next middleware needs to
 * route a request. The middleware runs on the server *before* the app and cannot
 * make sense of an opaque `cipansor_at`, so it reads this instead of asking the
 * API for every page request — which used to be one rate-limited round trip per
 * page and per `<Link>` prefetch, keyed on the web container's loopback address
 * and shared by every user.
 */

export { ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE, PRINCIPAL_COOKIE };

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

/**
 * The routing cookie the Next middleware reads.
 *
 * HttpOnly (so no page script can overwrite the session's routing), and it
 * lives exactly as long as the refresh cookie so a browsing session and its
 * routing do not diverge. It is not a credential: the API still decides what a
 * request may do, and a forged value only reaches a page whose first API call
 * answers 401.
 */
export function setPrincipalCookie(
  res: Response,
  claims: PrincipalClaims,
  secure: boolean = config.env === 'production'
): void {
  res.cookie(PRINCIPAL_COOKIE, JSON.stringify(claims), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlMs(config.jwt.refreshExpiresIn),
  });
}

/** Read and parse the routing cookie, or null when absent/malformed. */
export function principalFromCookie(req: Request): PrincipalClaims | null {
  const raw = req.cookies?.[PRINCIPAL_COOKIE];
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PrincipalClaims>;
    if (typeof parsed?.role !== 'string') return null;
    return {
      id: typeof parsed.id === 'string' ? parsed.id : '',
      role: parsed.role,
      roleCode: typeof parsed.roleCode === 'string' ? parsed.roleCode : parsed.role,
    };
  } catch {
    return null;
  }
}

/**
 * The request's existing CSRF value, or a fresh one when there is none.
 *
 * Used by `/auth/refresh`, which must NOT rotate the CSRF token. Rotating it
 * mid-session means a request that read the old value and is sent after a
 * parallel refresh set a new cookie is refused with 403 — not a 401, so the
 * client does not retry and the user sees an error toast every ~15 minutes
 * under load. OWASP's per-session token is enough; it is set at login and kept
 * through refreshes.
 */
export function csrfTokenForRefresh(req: Request): string {
  const existing = req.cookies?.[CSRF_COOKIE];
  return typeof existing === 'string' && existing ? existing : randomCsrfToken();
}

/** Issue the full session: HttpOnly access + refresh cookies, routing, CSRF. */
export function setSessionCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
  principal: PrincipalClaims,
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
  setPrincipalCookie(res, principal, secure);
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
  res.clearCookie(PRINCIPAL_COOKIE, { path: '/', secure, sameSite: 'lax' });
}

/** The access/temp token carried in the request cookie, if any. */
export function accessTokenFromCookie(req: Request): string | undefined {
  return req.cookies?.[ACCESS_COOKIE];
}

/** The refresh token carried in the request cookie, if any. */
export function refreshTokenFromCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE];
}

/**
 * Whether this response may carry raw tokens in its JSON body.
 *
 * Two conditions, both required:
 * 1. the caller declared itself bearer-only (`X-Client: bearer`), and
 * 2. the credential did NOT arrive in a session cookie.
 *
 * The second is the load-bearing one. A header is set by page JavaScript, so a
 * cookie-authenticated request that merely *adds* `X-Client: bearer` would
 * otherwise be handed back a fresh access and refresh token — exactly the
 * exfiltration the migration exists to stop. A request authenticated by a
 * cookie never gets a token back, whatever headers it carries.
 */
export function mayReturnTokens(req: Request): boolean {
  if (String(req.headers['x-client'] ?? '').toLowerCase() !== 'bearer') return false;
  return !accessTokenFromCookie(req) && !refreshTokenFromCookie(req);
}
