/**
 * Server-issued routing session cookie (SECURITY CRITICAL — finding: forged
 * profile cookie bypasses the page guard).
 *
 * The Next Proxy (`middleware.ts`) used to read `auth-storage` — a cookie the
 * BROWSER's JavaScript writes from the zustand persist store. That made the
 * guard self-certifying: a visitor could `document.cookie = 'auth-storage=
 * {"state":{"isAuthenticated":true,"user":{"userRoles":[{"role":{"code":
 * "SUPER_ADMIN"}}]}}}'` and reject every protected/role-restricted page. The
 * UI would then call the API with no bearer, get 401 and bounce, but the page
 * guard itself was already defeated — role-sensitive markup/chrome rendered,
 * and any future server-side decision reading the cookie would inherit it.
 *
 * The fix is a session cookie the SERVER issues and signs, and that the browser
 * cannot forge:
 *
 *  - HttpOnly  — JavaScript cannot read it, so XSS cannot exfiltrate the
 *                routing identity either (it is not the bearer token; the
 *                bearer still lives in localStorage and `Authorization`).
 *  - Secure    — production only; on localhost/dev the cookie must still be
 *                set, so the flag follows `NODE_ENV`.
 *  - SameSite=Lax — sent on top-level navigations (the guard needs it) but not
 *                on cross-site subrequests.
 *  - HMAC-SHA-256 signed with a server-only secret. The proxy verifies the
 *    signature before trusting `isAuthenticated` or the role. A tampered or
 *    forged value verifies as null and is treated as no session.
 *
 * The payload is a *routing* signal, never an authorization one: it carries the
 * user id, the legacy role bucket and the RoleCode so Proxy can pick the
 * dashboard/menu. Every API call re-authenticates from the bearer token, so a
 * stale-but-valid signature cannot grant data access.
 *
 * This module is runtime-agnostic (Web Crypto) so the Proxy (Node runtime) and
 * the route handler that mints the cookie share ONE implementation.
 */

export const SESSION_COOKIE = "cipansor-session";

/** How long a routing session cookie stays valid. Mirrors the profile cookie. */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

export interface SessionPayload {
  /** Schema version, so a future change can invalidate old cookies. */
  v: 1;
  /** User id the session belongs to. */
  sub: string;
  /** Legacy role bucket used by `rbac.ts` route/dashboard tables. */
  role?: string;
  /** Primary RoleCode, for RoleCode-native routing decisions. */
  roleCode?: string;
  /** Issued-at / expiry, seconds since epoch. */
  iat: number;
  exp: number;
}

/**
 * The secret that signs routing cookies.
 *
 * Deliberately falls back to `JWT_SECRET` so an existing deployment works
 * without a new required variable, while `SESSION_SECRET` lets an operator
 * rotate the routing identity independently of the API's token signer. In
 * production the API refuses to boot with a placeholder `JWT_SECRET`, so this
 * inherits that guarantee; locally the dev default is fine.
 */
export function resolveSessionSecret(
  env: { SESSION_SECRET?: string; JWT_SECRET?: string; NODE_ENV?: string } = process.env
): string {
  const secret = env.SESSION_SECRET || env.JWT_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === "production") return "";
  return "dev-routing-session-secret-not-for-production";
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

/** Mint a signed session cookie value. Returns "" when no secret is configured. */
export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  if (!secret) return "";
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(body, secret);
  return `${body}.${signature}`;
}

/**
 * Verify a session cookie value and return its payload, or null when it is
 * missing, malformed, unsigned-by-us, tampered with, or expired.
 *
 * Fails closed on every branch: a Proxy that cannot prove the cookie was minted
 * by this server treats the visitor as unauthenticated.
 */
export async function verifySession(
  token: string | undefined | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = await sign(body, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  const decoded = base64UrlDecode(body);
  if (!decoded) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    return null;
  }
  if (!isSessionPayload(parsed)) return null;
  if (parsed.exp <= nowSeconds) return null;
  return parsed;
}

/** Constant-time comparison so a signature cannot be guessed byte-by-byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    p.v === 1 &&
    typeof p.sub === "string" &&
    p.sub.length > 0 &&
    typeof p.exp === "number" &&
    typeof p.iat === "number" &&
    (p.role === undefined || typeof p.role === "string") &&
    (p.roleCode === undefined || typeof p.roleCode === "string")
  );
}

/** The `Set-Cookie` attributes for the routing session. */
export function sessionCookieOptions(
  env: { NODE_ENV?: string } = process.env
): { httpOnly: true; secure: boolean; sameSite: "lax"; path: string; maxAge: number } {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
