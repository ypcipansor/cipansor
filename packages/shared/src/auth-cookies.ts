/**
 * Auth cookie names and serialisation, shared by the API (which issues the
 * cookies) and the web app (which reads them in middleware and tests).
 *
 * Session credentials are issued by the API as `HttpOnly; Secure; SameSite`
 * cookies. That property cannot be reproduced by client JavaScript — a cookie
 * written from `document.cookie` can never carry `HttpOnly` — so the names,
 * flags and payload shape must have exactly one definition, on the server side,
 * rather than a copy in the browser that can drift.
 *
 * The routing payload is a small, base64url-encoded JSON blob carrying only
 * what `middleware.ts` needs to place a visitor (role code, legacy role, user
 * id, unit id) — never `permissions[]` and never a token. The routing cookie is
 * `HttpOnly` too, so it is a server-set hint, not a client-forgeable grant; the
 * authoritative identity is still the API-verified token.
 */

/** Access token cookie. `HttpOnly`, so script can never read or replay it. */
export const ACCESS_TOKEN_COOKIE = "access_token";
/** Refresh token cookie. `HttpOnly`; rotated on every refresh. */
export const REFRESH_TOKEN_COOKIE = "refresh_token";
/** 2FA temporary token cookie. `HttpOnly`, short-lived. */
export const TWO_FACTOR_TOKEN_COOKIE = "two_factor_token";
/** Server-set routing hint read by `apps/web/middleware.ts`. */
export const ROUTING_COOKIE = "cipansor_routing";

/** The cookie-header names that must never appear in client-readable storage. */
export const AUTH_COOKIE_NAMES = [
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  TWO_FACTOR_TOKEN_COOKIE,
  ROUTING_COOKIE,
] as const;

export interface AuthCookieOptions {
  /**
   * `Secure` when the deployment is served over HTTPS. Production is always
   * true; local `pnpm dev` over http is the only false.
   */
  secure: boolean;
  /** `Max-Age` in seconds. */
  maxAgeSeconds: number;
  path?: string;
}

/**
 * Serialise one auth cookie.
 *
 * `HttpOnly` is unconditional — there is no code path that produces a
 * script-readable session cookie. `SameSite=Lax` is the default CSRF posture
 * for the same-origin production deployment: it withholds the cookie from
 * cross-site POSTs while still sending it on top-level navigations (so a
 * bookmarked deep link keeps working).
 */
export function buildAuthCookie(
  name: string,
  value: string,
  options: AuthCookieOptions,
): string {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path ?? "/"}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Serialise the cookie that deletes an auth cookie.
 *
 * `Max-Age=0` and no `Secure` (a `Secure` deletion cookie would still clear on
 * https, but omitting it keeps the clear working in dev where the cookie was
 * set without `Secure`).
 */
export function buildClearAuthCookie(
  name: string,
  options?: { path?: string },
): string {
  return `${name}=; Path=${options?.path ?? "/"}; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/** The slice of a session `middleware.ts` resolves a route from. */
export interface RoutingCookiePayload {
  /** Legacy role bucket used by the route/dashboard maps in `lib/rbac.ts`. */
  role: string;
  /** Primary RoleCode, used where the bucket is too coarse. */
  roleCode: string;
  userId: string;
  unitId: string | null;
  /** Expiry, epoch seconds. */
  exp: number;
}

/**
 * Tiny base64url helpers.
 *
 * The package must run both in Node (API and Next middleware) and the browser
 * (tests), and it declares no Node types — so the environment globals are read
 * through a narrow structural type instead of referencing `Buffer`/`btoa`
 * directly, which the package's own `tsconfig` does not know about.
 */
interface NodeBufferLike {
  from(
    input: string,
    encoding?: string,
  ): { toString(encoding: string): string };
}
type GlobalWithCodecs = {
  Buffer?: NodeBufferLike;
  btoa?: (value: string) => string;
  atob?: (value: string) => string;
  escape?: (value: string) => string;
  unescape?: (value: string) => string;
};
const codecs = globalThis as unknown as GlobalWithCodecs;

function base64UrlEncode(text: string): string {
  if (codecs.Buffer) {
    return codecs.Buffer.from(text, "utf8").toString("base64url");
  }
  const b64 = codecs.btoa
    ? codecs.btoa(codecs.unescape?.(encodeURIComponent(text)) ?? text)
    : "";
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  if (codecs.Buffer) {
    return codecs.Buffer.from(value, "base64url").toString("utf8");
  }
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  if (!codecs.atob) return "";
  const decoded = codecs.escape
    ? codecs.escape(codecs.atob(b64))
    : codecs.atob(b64);
  return decodeURIComponent(decoded);
}

/** Encode the routing payload into a cookie-safe (base64url) value. */
export function encodeRoutingCookie(payload: RoutingCookiePayload): string {
  return base64UrlEncode(JSON.stringify(payload));
}

/**
 * Decode a routing cookie value. Returns null for anything malformed or
 * expired — the middleware then falls back to the token cookie and, failing
 * that, fails closed. Never throws on attacker-controlled input.
 */
export function decodeRoutingCookie(
  value: string | null | undefined,
): RoutingCookiePayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      base64UrlDecode(value),
    ) as Partial<RoutingCookiePayload>;
    if (
      typeof parsed?.role !== "string" ||
      typeof parsed?.roleCode !== "string" ||
      typeof parsed?.userId !== "string" ||
      typeof parsed?.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp * 1000 <= Date.now()) return null;
    return {
      role: parsed.role,
      roleCode: parsed.roleCode,
      userId: parsed.userId,
      unitId: parsed.unitId ?? null,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a `Cookie` request header into name/value pairs.
 *
 * `cookie-parser` is not a dependency, and only four names are ever read, so a
 * faithful-enough parser lives here. The first `=` splits name from value
 * (cookie values may legitimately contain `=`); percent-decoding is applied
 * because browsers encode cookie values.
 */
export function parseCookieHeader(
  header: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}
