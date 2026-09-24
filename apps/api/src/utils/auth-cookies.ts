import type { Request, Response } from 'express';
import { RoleCode } from '@prisma/client';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  TWO_FACTOR_TOKEN_COOKIE,
  ROUTING_COOKIE,
  buildAuthCookie,
  buildClearAuthCookie,
  signRoutingCookie,
  parseCookieHeader,
  type RoutingCookiePayload,
} from '@cipansor/shared';
import { config } from '@/config';
import { decodeToken, getExpirationDate, type TokenPair } from '@/lib/jwt';
import { deriveLegacyRole } from '@/middleware/auth';

/**
 * Server-issued session cookies.
 *
 * The API used to hand the web app its access and refresh tokens in the JSON
 * body, and the browser persisted them in `localStorage` + `document.cookie`.
 * A `document.cookie` write can never be `HttpOnly`, so any XSS on the origin
 * could read and replay a 30-day refresh token. The tokens are now issued as
 * `HttpOnly; Secure; SameSite=Lax` cookies, so script cannot see them at all.
 *
 * The JSON token fields are STRIPPED for browser clients. A field in the body
 * is readable by any script on the origin — the exposure this migration exists
 * to close — so login/refresh/2FA/role-switch return only the profile and the
 * `routing` hint to a browser. A native client (`docs/MOBILE_API.md`) has no
 * cookie jar and opts back in with `X-Client-Type: native` (see
 * `wantsRawTokens`) to keep receiving the pair in the body.
 *
 * `Secure` is conditional on the deployment being https. Production and staging
 * are https; local `pnpm dev` over http would have its cookies silently dropped
 * by the browser if `Secure` were forced, so `NODE_ENV=production` is the
 * switch. (`AUTH_COOKIE_SECURE` can override for an https dev proxy.)
 */

/** The role bucket the web middleware routes on — mirrors `apps/web/src/lib/rbac.ts`. */
function legacyRoleFor(roleCode: string): string {
  // The mapping itself is authoritative in `apps/api/src/middleware/auth.ts`,
  // so this delegates rather than keeping a second copy in sync.
  return deriveLegacyRole(roleCode);
}

function cookieSecure(): boolean {
  if (process.env.AUTH_COOKIE_SECURE === 'false') return false;
  if (process.env.AUTH_COOKIE_SECURE === 'true') return true;
  return config.env === 'production';
}

function secondsFromExpiry(expiresIn: string): number {
  return Math.max(0, Math.floor((getExpirationDate(expiresIn).getTime() - Date.now()) / 1000));
}

/**
 * The access token's own TTL in seconds.
 *
 * The browser gets this figure in the body instead of the token itself (see
 * `sessionBody`); deriving it from the same `config.jwt.expiresIn` the cookie's
 * `Max-Age` uses keeps the two from drifting.
 */
export function accessTokenTtlSeconds(): number {
  return secondsFromExpiry(config.jwt.expiresIn);
}

/** The signed `cipansor_routing` cookie value for a freshly minted token pair. */
export async function signedRoutingCookieValue(tokens: TokenPair): Promise<string> {
  return signRoutingCookie(routingPayloadFor(tokens), config.routingCookie.secret);
}

/** The cookies that carry an authenticated session. */
export async function sessionCookies(tokens: TokenPair): Promise<string[]> {
  const secure = cookieSecure();

  return [
    buildAuthCookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      secure,
      maxAgeSeconds: secondsFromExpiry(config.jwt.expiresIn),
    }),
    buildAuthCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      secure,
      maxAgeSeconds: secondsFromExpiry(config.jwt.refreshExpiresIn),
    }),
    buildAuthCookie(ROUTING_COOKIE, await signedRoutingCookieValue(tokens), {
      secure,
      maxAgeSeconds: secondsFromExpiry(config.jwt.refreshExpiresIn),
    }),
  ];
}

/**
 * The routing hint for a freshly minted token pair.
 *
 * Read straight from the access token's own claims — the same source
 * `authenticate` trusts — rather than a separately-passed payload that could
 * disagree with the token being set. Exported so the login response can hand it
 * to the web client (which needs it as a Playwright/session cookie) without the
 * two implementations drifting.
 */
export function routingPayloadFor(tokens: TokenPair): RoutingCookiePayload {
  const claims = decodeToken(tokens.accessToken);
  return {
    role: claims ? legacyRoleFor(claims.roleCode) : '',
    roleCode: claims?.roleCode ?? '',
    userId: claims?.sub ?? '',
    unitId: claims?.unitId ?? null,
    // The routing hint may live as long as the refresh token; when the session
    // ends the server clears it, and it carries no credential of its own.
    exp: Math.floor(Date.now() / 1000) + secondsFromExpiry(config.jwt.refreshExpiresIn),
  };
}

/** The short-lived cookie carrying a 2FA temporary token. */
export function twoFactorCookie(tempToken: string, expiresIn = '5m'): string {
  return buildAuthCookie(TWO_FACTOR_TOKEN_COOKIE, tempToken, {
    secure: cookieSecure(),
    maxAgeSeconds: secondsFromExpiry(expiresIn),
  });
}

/** Every cookie that must be cleared on logout / terminal failure. */
export function clearedSessionCookies(): string[] {
  return [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, TWO_FACTOR_TOKEN_COOKIE, ROUTING_COOKIE].map(
    (name) => buildClearAuthCookie(name)
  );
}

/** Set an array of `Set-Cookie` headers on the response. */
export function setCookies(res: Response, cookies: string[]): void {
  if (cookies.length === 0) return;
  const existing = res.getHeader('Set-Cookie');
  const merged = existing
    ? [...(Array.isArray(existing) ? existing : [existing]), ...cookies]
    : cookies;
  res.setHeader('Set-Cookie', merged as string[]);
}

/** Read one auth cookie from the request. */
export function readCookie(req: Request, name: string): string | null {
  return parseCookieHeader(req.headers.cookie ?? null)[name] ?? null;
}

/**
 * Whether the caller explicitly identifies as a native Bearer client.
 *
 * Browser sessions are cookie-only: the raw `accessToken` / `refreshToken` /
 * `tempToken` must never reach page JavaScript, where an XSS could read them.
 * A native client (`docs/MOBILE_API.md`) has no cookie jar and needs the bearer
 * pair in the body, so it opts in with `X-Client-Type: native`. The default —
 * anything without that header, including every browser fetch — is the
 * cookie-only shape.
 */
export function wantsRawTokens(req: Request): boolean {
  const value = req.headers['x-client-type'];
  return typeof value === 'string' && value.toLowerCase() === 'native';
}

/**
 * The credentials presented on a request, whatever transport carried them.
 *
 * A cookie-first contract that still admits the `Authorization` header is what
 * lets the browser migrate without breaking the native Bearer clients. The
 * header is checked first so an explicit bearer (a service token, the mobile
 * app) always wins over an ambient cookie.
 */
export interface PresentedCredentials {
  accessToken: string | null;
  refreshToken: string | null;
}

export function presentedCredentials(req: Request): PresentedCredentials {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  return {
    accessToken: bearer ?? readCookie(req, ACCESS_TOKEN_COOKIE),
    refreshToken: readCookie(req, REFRESH_TOKEN_COOKIE),
  };
}

/** True when the role code is a foundation-level governance role. */
export function isFoundationRoleCode(roleCode: string): boolean {
  return (
    roleCode === RoleCode.SUPER_ADMIN ||
    roleCode === RoleCode.YAYASAN_PEMBINA ||
    roleCode === RoleCode.YAYASAN_KETUA ||
    roleCode === RoleCode.YAYASAN_SEKRETARIS ||
    roleCode === RoleCode.YAYASAN_BENDAHARA ||
    roleCode === RoleCode.YAYASAN_ANGGOTA ||
    roleCode === RoleCode.YAYASAN_PENGAWAS
  );
}
