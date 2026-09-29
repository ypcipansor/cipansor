import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { Errors } from './error';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '@/modules/auth/auth.cookies';

/**
 * Double-submit CSRF protection for the cookie-authenticated session.
 *
 * Once the bearer token lives in an `HttpOnly` cookie, the browser attaches it
 * to requests automatically — including requests a different site makes on the
 * user's behalf. `SameSite=Lax` already blocks the cross-site POSTs that carry
 * this class of attack, but `Lax` is one misconfiguration away from being the
 * whole defence. The double-submit token does not depend on it.
 *
 * The pattern: a random value sits in a JavaScript-readable `cipansor_csrf`
 * cookie, and the client echoes it in the `x-csrf-token` header. A cross-site
 * attacker can make the browser *send* the cookie but cannot *read* it to set
 * the header (the cookie is same-origin-readable only), so a request forged
 * elsewhere cannot present a matching pair.
 *
 * The header is required only when a session cookie is actually present, so
 * the bearer-only clients — the mobile API and the e2e API helpers — are
 * untouched, as are the anonymous public POSTs (SPMB, wakaf).
 */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hasSessionCookie(req: Request): boolean {
  return Boolean(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE]);
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(req.method) || !hasSessionCookie(req)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];

  if (
    typeof cookieToken !== 'string' ||
    typeof headerToken !== 'string' ||
    !csrfTokensMatch(cookieToken, headerToken)
  ) {
    return next(
      Errors.forbidden(
        'Permintaan tanpa token CSRF yang sah ditolak. Muat ulang halaman lalu coba lagi.'
      )
    );
  }

  next();
}

/**
 * Compare the double-submit pair in constant time. Both sides are
 * attacker-influenced up to the point of the check, so a byte-by-byte compare
 * that returns at the first difference leaks the prefix length of the genuine
 * value through timing.
 */
export function csrfTokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
