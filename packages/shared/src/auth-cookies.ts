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
 * The routing payload is a small JSON blob carrying only what `middleware.ts`
 * needs to place a visitor (role code, legacy role, user id, unit id) — never
 * `permissions[]` and never a token.
 *
 * **`HttpOnly` does NOT make the payload trustworthy.** A cookie is set by the
 * server, but the value the *browser sends back* is just a string the client
 * controls: any request the user's own browser can be made to issue — a `fetch`
 * with `credentials: 'include'`, a same-site form post, a subdomain that can set
 * a cookie-scoped response — can carry a `cipansor_routing` value the attacker
 * chose. Middleware that trusted it would mint a route grant (and, through
 * `roleCode`, an RBAC decision) from unsigned JSON. So the routing cookie is
 * MAC'd: `signRoutingCookie` appends an HMAC over a purpose- and
 * version-separated message, and `verifyRoutingCookie` is the only reader. A
 * payload without a valid signature is treated exactly like no cookie at all —
 * the middleware then falls back to the verified token cookie and, failing
 * that, fails closed.
 *
 * The signing secret is supplied by the caller and is deliberately **not** read
 * here: this module is bundled for the browser as well as run on the server, and
 * a `process.env`/secret reference that can reach a client bundle is how a
 * server-only key leaks. The API and the Next middleware each resolve the same
 * value through `resolveRoutingCookieSecret`.
 */

/** Access token cookie. `HttpOnly`, so script can never read or replay it. */
export const ACCESS_TOKEN_COOKIE = "access_token";
/** Refresh token cookie. `HttpOnly`; rotated on every refresh. */
export const REFRESH_TOKEN_COOKIE = "refresh_token";
/** 2FA temporary token cookie. `HttpOnly`, short-lived. */
export const TWO_FACTOR_TOKEN_COOKIE = "two_factor_token";
/** Server-set routing hint read by `apps/web/middleware.ts`. */
export const ROUTING_COOKIE = "cipansor_routing";

/**
 * A short-lived, *client-readable* marker that the session is known to be dead.
 *
 * The routing cookie is `HttpOnly`, so only the server can clear it — but the
 * server that learns the session is dead is the API, and the browser learns it
 * from a failed refresh. Between the two, `middleware.ts` still sees a signed,
 * unexpired routing cookie and treats the visitor as authenticated, so it
 * redirects `/login` to the role dashboard: the user cannot reach the sign-in
 * form to recover, and every protected page bounces back to `/login`. The
 * marker is the one piece of state the client can write to say "do not trust
 * the routing hint for this navigation".
 *
 * It is deliberately NOT a credential: it grants nothing, carries no identity,
 * and its presence can only *reduce* authority (the middleware stops routing on
 * the stale hint). A forged marker is therefore harmless — it can at worst send
 * its own author to the login page.
 */
export const SESSION_DEAD_COOKIE = "cipansor_session_dead";

/** The cookie-header names that must never appear in client-readable storage. */
export const AUTH_COOKIE_NAMES = [
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  TWO_FACTOR_TOKEN_COOKIE,
  ROUTING_COOKIE,
] as const;

/** How long the client's "session is dead" marker lives, in seconds. */
export const SESSION_DEAD_COOKIE_MAX_AGE_SECONDS = 300;

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
  crypto?: {
    subtle?: {
      importKey(
        format: string,
        keyData: Uint8Array,
        algorithm: { name: string; hash: string },
        extractable: boolean,
        keyUsages: string[],
      ): Promise<unknown>;
      sign(
        algorithm: string,
        key: unknown,
        data: Uint8Array,
      ): Promise<ArrayBuffer>;
      verify(
        algorithm: string,
        key: unknown,
        signature: Uint8Array,
        data: Uint8Array,
      ): Promise<boolean>;
    };
  };
  TextEncoder?: new () => { encode(input: string): Uint8Array };
};
const codecs = globalThis as unknown as GlobalWithCodecs;

function utf8Encode(text: string): Uint8Array {
  if (codecs.TextEncoder) return new codecs.TextEncoder().encode(text);
  return new Uint8Array(
    [...unescape(encodeURIComponent(text))].map((c) => c.charCodeAt(0)),
  );
}

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

/**
 * The purpose/version prefix that every routing-cookie MAC is computed over.
 *
 * This is what stops a signature from being replayed into a different
 * context: a MAC that only covered the payload bytes would also be valid for
 * any other value signed with the same key, and a future cookie format could be
 * confused with this one. Bump `v1` if the signed message layout ever changes.
 */
export const ROUTING_COOKIE_PURPOSE = "cipansor:routing-cookie:v1";

/** The keyed message the MAC is computed over, as UTF-8 bytes. */
function routingCookieMessage(payloadB64: string): Uint8Array {
  return utf8Encode(`${ROUTING_COOKIE_PURPOSE}.${payloadB64}`);
}

/**
 * Sign a routing payload into a `<base64url(payload)>.<base64url(mac)>` value.
 *
 * `secret` is required: there is no development fallback here, because a
 * fallback is exactly the shape that let a published JWT placeholder sign
 * production sessions (`apps/api/src/config/assert-secrets.ts`). Production
 * refuses to boot without a real value; development passes the same dev-only
 * constant the API and middleware resolve, so no cookie is ever signed with an
 * unset key.
 *
 * The primitive is WebCrypto (`globalThis.crypto.subtle`), not a Node `crypto`
 * import, so the exact same code runs in the API (Node) and in the Next
 * middleware/proxy (which may run on the Edge runtime) and is testable under
 * jsdom.
 */
export async function signRoutingCookie(
  payload: RoutingCookiePayload,
  secret: string,
): Promise<string> {
  const subtle = codecs.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto is unavailable; cannot sign the routing cookie");
  }
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const key = await subtle.importKey(
    "raw",
    utf8Encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign(
    "HMAC",
    key,
    routingCookieMessage(payloadB64),
  );
  return `${payloadB64}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

/** base64url for raw bytes, without going through a UTF-8 string round-trip. */
function base64UrlEncodeBytes(bytes: Uint8Array): string {
  if (codecs.Buffer) {
    return codecs.Buffer.from(formBinaryString(bytes), "binary").toString(
      "base64url",
    );
  }
  let binary = formBinaryString(bytes);
  return (codecs.btoa ? codecs.btoa(binary) : "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function formBinaryString(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function base64UrlDecodeBytes(value: string): Uint8Array | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    let binary: string;
    if (codecs.Buffer) {
      binary = codecs.Buffer.from(value, "base64url").toString("binary");
    } else {
      binary = codecs.atob ? codecs.atob(b64) : "";
    }
    if (!binary) return null;
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Verify a routing cookie and decode its payload.
 *
 * Any unsigned, malformed, expired, or wrongly-signed value returns null, which
 * the middleware treats the same as "no routing cookie". The MAC is compared by
 * WebCrypto's `verify`, which is constant-time over the signature. Never throws
 * on attacker-controlled input.
 */
export async function verifyRoutingCookie(
  value: string | null | undefined,
  secret: string,
): Promise<RoutingCookiePayload | null> {
  if (!value || !secret) return null;
  const dotted = value.indexOf(".");
  if (dotted <= 0) return null;
  const payloadB64 = value.slice(0, dotted);
  const signatureB64 = value.slice(dotted + 1);
  if (!payloadB64 || !signatureB64) return null;

  const subtle = codecs.crypto?.subtle;
  if (!subtle) return null;
  const signature = base64UrlDecodeBytes(signatureB64);
  if (!signature) return null;

  let valid = false;
  try {
    const key = await subtle.importKey(
      "raw",
      utf8Encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await subtle.verify(
      "HMAC",
      key,
      signature,
      routingCookieMessage(payloadB64),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  return parseRoutingPayload(base64UrlDecode(payloadB64));
}

/** Structured-parse a decoded routing payload, rejecting anything malformed. */
function parseRoutingPayload(raw: string): RoutingCookiePayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RoutingCookiePayload>;
    if (
      typeof parsed?.role !== "string" ||
      typeof parsed?.roleCode !== "string" ||
      typeof parsed?.userId !== "string" ||
      typeof parsed?.exp !== "number" ||
      !Number.isFinite(parsed.exp)
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

/** Encode the routing payload into a cookie-safe (base64url) value. */
export function encodeRoutingCookie(payload: RoutingCookiePayload): string {
  return base64UrlEncode(JSON.stringify(payload));
}

/**
 * Decode a routing cookie value without verifying its signature.
 *
 * **This is not an authentication primitive.** It returns null for anything
 * malformed or expired and never throws, but it accepts an unsigned or forged
 * payload — it exists only so already-trusted code can re-read a value it signed
 * (`verifyRoutingCookie` is the reader middleware must use). Kept for the
 * pre-signature tests and tooling that construct a payload directly.
 */
export function decodeRoutingCookie(
  value: string | null | undefined,
): RoutingCookiePayload | null {
  if (!value) return null;
  const dotted = value.indexOf(".");
  const encoded = dotted > 0 ? value.slice(0, dotted) : value;
  return parseRoutingPayload(base64UrlDecode(encoded));
}

/**
 * Resolve the routing-cookie signing secret from the environment.
 *
 * Shared so the API and the Next middleware cannot disagree about which key is
 * in force. There is no production fallback: the session-secret guard already
 * refuses to boot an API whose `JWT_SECRET` is a published placeholder, and a
 * routing key quietly derived from a weak default would reintroduce the same
 * class of bug for a different cookie. A dedicated `ROUTING_COOKIE_SECRET` is
 * preferred; when unset the JWT secret is reused (the routing cookie is an
 * auxiliary hint, and a single-secret deployment stays configurable).
 * Development only, a fixed dev value keeps `pnpm dev` working with no .env.
 */
export function resolveRoutingCookieSecret(env: {
  ROUTING_COOKIE_SECRET?: string;
  JWT_SECRET?: string;
  NODE_ENV?: string;
}): string {
  const dedicated = env.ROUTING_COOKIE_SECRET?.trim();
  if (dedicated) return dedicated;
  const jwt = env.JWT_SECRET?.trim();
  if (jwt) return jwt;
  if (env.NODE_ENV === "production") {
    throw new Error(
      "ROUTING_COOKIE_SECRET (or JWT_SECRET) is required in production to sign the routing cookie.",
    );
  }
  return "dev-routing-cookie-secret-not-for-production";
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
