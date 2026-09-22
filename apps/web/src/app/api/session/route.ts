import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  resolveSessionSecret,
  signSession,
  sessionCookieOptions,
  type SessionPayload,
} from "@/lib/session";
import { deriveLegacyRole, isLegacyRole, type LegacyRole } from "@/lib/rbac";

/**
 * Issue the server-signed routing session cookie.
 *
 * The browser calls this after a successful login / SSO / 2FA / role switch,
 * passing the API access token in the `Authorization` header. We verify that
 * token against the API's `/auth/me` and only then sign a cookie — so the cookie
 * is proof of a session the SERVER confirmed, not a client assertion.
 *
 * The access token is deliberately neither echoed nor stored: it stays in
 * localStorage and is carried per-request as a bearer, exactly as before. This
 * endpoint only decides the routing identity.
 *
 * `POST /api/session` with `{ clear: true }` (or `DELETE`) clears it, which
 * logout uses so a signed-out browser carries no routing session.
 */

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface MeUser {
  id?: string;
  role?: string | null;
  userRoles?: Array<{
    isPrimary?: boolean;
    role?: { code?: string | null } | null;
  }> | null;
}

/** The primary RoleCode from the API's user payload. */
function primaryRoleCode(user: MeUser): string | undefined {
  const assignments = user.userRoles ?? [];
  const primary = assignments.find((a) => a?.isPrimary) ?? assignments[0];
  return primary?.role?.code ?? undefined;
}

/**
 * The legacy routing bucket, derived from the primary active RoleCode.
 *
 * SECURITY / CORRECTNESS: the API's persisted `role` column is the LEGACY
 * vocabulary and can be stale after a role switch or an assignment change — the
 * active assignment (RoleCode) is what `/auth/me` reports as the source of
 * truth. Reading `role` first signed a cookie whose legacy bucket contradicted
 * the live RoleCode, and the guard then made routing decisions on the stale
 * value (too-broad or too-narrow access after a switch).
 *
 * So the RoleCode decides first and the legacy column is only a fallback for
 * RoleCodes this map deliberately does not bucket (komite/alumni, which the
 * backend keeps RoleCode-native and reaches through the persisted column).
 */
function effectiveLegacyRole(user: MeUser): LegacyRole | undefined {
  const code = primaryRoleCode(user);
  if (code) {
    const derived = deriveLegacyRole(code);
    if (derived) return derived;
  }
  if (isLegacyRole(user.role)) return user.role;
  if (typeof user.role === "string") return deriveLegacyRole(user.role);
  return undefined;
}

function clearCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}

export async function POST(request: Request) {
  const secret = resolveSessionSecret();
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";

  let body: { clear?: boolean } = {};
  try {
    body = (await request.json()) as { clear?: boolean };
  } catch {
    body = {};
  }

  if (body.clear || !bearer) {
    return clearCookie(NextResponse.json({ session: false }));
  }

  let user: MeUser | null = null;
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { authorization: `Bearer ${bearer}` },
      cache: "no-store",
    });
    if (res.ok) {
      const payload = (await res.json()) as { data?: MeUser };
      user = payload.data ?? null;
    }
  } catch {
    user = null;
  }

  if (!user?.id) {
    // The API did not confirm a session; do not mint one.
    return clearCookie(NextResponse.json({ session: false }));
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    sub: user.id,
    role: effectiveLegacyRole(user),
    roleCode: primaryRoleCode(user),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const token = await signSession(payload, secret);
  if (!token) {
    // No signing secret configured (a production misconfiguration): fail closed
    // rather than serve a guard that trusts an unsigned value.
    return NextResponse.json({ session: false }, { status: 500 });
  }

  const response = NextResponse.json({ session: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export async function DELETE() {
  return clearCookie(NextResponse.json({ session: false }));
}
