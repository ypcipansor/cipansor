/**
 * Session cookie hygiene (SECURITY WARNING — finding F).
 *
 * The session bearer token must never live in a cookie the browser exposes to
 * JavaScript. This module removes that duplicate entirely: the web app used to
 * mirror `accessToken` into `document.cookie` (no `HttpOnly`, no `Secure`) on
 * every login, SSO, 2FA and refresh. An XSS bug could then read the long-lived
 * bearer credential straight off `document.cookie`, and the token also travelled
 * on every same-origin request as a cookie.
 *
 * Middleware only needs a ROUTING signal ("does a session appear to exist, and
 * which role dashboard should we send this visitor to"). It does not verify the
 * token — every API call re-authenticates from the `Authorization` header,
 * which the Axios interceptor fills from storage. The zustand persist store
 * already writes an `auth-storage` cookie carrying the user profile, and
 * `middleware.ts` prefers it, so the raw-token cookie is pure duplication and
 * removing it costs nothing functionally while removing a credential from the
 * JS-readable cookie jar.
 *
 * ## Residual risk (explicit, NOT closed by this change)
 *
 * The access/refresh tokens are still persisted to `localStorage`, which is
 * readable by any script on the origin. Closing that fully requires issuing the
 * session as a server-set `HttpOnly; Secure; SameSite` cookie and reworking
 * CSRF — an architectural change tracked separately; this mitigation is the
 * safe, in-scope reduction requested while that is agreed.
 */

export const AUTH_STORAGE_COOKIE = "auth-storage";
/** The credential cookie this module exists to keep out of `document.cookie`. */
export const FORBIDDEN_TOKEN_COOKIE = "accessToken";

/**
 * Remove the bearer-token cookie if an older build (or a test fixture) left one
 * behind. A cookie outlives the page that set it, so merely stopping the write
 * is not enough — an earlier visitor keeps the exposed credential until it is
 * actively cleared.
 */
export function clearBearerTokenCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${FORBIDDEN_TOKEN_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Remove every session cookie this app owns, for logout/rejection paths. */
export function clearSessionCookies(): void {
  if (typeof document === "undefined") return;
  clearBearerTokenCookie();
  document.cookie = `${AUTH_STORAGE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
