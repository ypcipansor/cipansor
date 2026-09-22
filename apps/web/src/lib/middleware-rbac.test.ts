import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";
import { ROUTING_COOKIE, encodeRoutingCookie } from "@cipansor/shared";

/**
 * Middleware-level regression coverage for route protection.
 *
 * The session is server-issued: the API sets an `HttpOnly` `cipansor_routing`
 * cookie (the only role-bearing cookie) plus the access/refresh cookies. These
 * tests drive the real `middleware()` with a real `NextRequest`, so the gate is
 * exercised end to end.
 *
 * A forged `auth-storage` cookie must grant nothing — the whole point of moving
 * the session off client-written cookies.
 */

function routingCookieFor(role: string, roleCode: string): string {
  return encodeRoutingCookie({
    role,
    roleCode,
    userId: "user-1",
    unitId: null,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

function request(path: string, cookies: Record<string, string>): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie },
  });
}

describe("middleware RBAC with the server-issued routing cookie", () => {
  it("redirects a student away from an admin-only route", () => {
    const res = middleware(
      request("/finance", {
        [ROUTING_COOKIE]: routingCookieFor("STUDENT", "SDIT_STUDENT"),
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/student");
  });

  it("lets the same student reach a route its role does allow", () => {
    const res = middleware(
      request("/announcements", {
        [ROUTING_COOKIE]: routingCookieFor("STUDENT", "SDIT_STUDENT"),
      }),
    );

    expect(res.headers.get("location")).toBeNull();
  });

  it("fails closed for a session with no role", () => {
    // An access token with no routing cookie must NOT pass a protected route:
    // the middleware cannot say what the visitor may open, so it sends them to
    // re-establish a session.
    const res = middleware(
      request("/finance", { access_token: "a".repeat(1197) }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("fails closed for a session carrying only the legacy access cookie", () => {
    const res = middleware(
      request("/finance", { accessToken: "a".repeat(1197) }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("still allows public routes with a token but no role", () => {
    const res = middleware(
      request("/profil", { access_token: "a".repeat(1197) }),
    );

    expect(res.headers.get("location")).toBeNull();
  });

  it("ignores a forged client-written auth-storage cookie", () => {
    // The old store mirrored the whole user (with role) into a JS-written
    // cookie. That cookie must no longer influence routing at all — it carries
    // no role, so the middleware fails closed instead of granting /finance.
    const forged = encodeURIComponent(
      JSON.stringify({
        state: {
          user: {
            role: "UNIT_ADMIN",
            userRoles: [{ isPrimary: true, role: { code: "SUPER_ADMIN" } }],
          },
          isAuthenticated: true,
        },
        version: 0,
      }),
    );

    const res = middleware(request("/finance", { "auth-storage": forged }));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
