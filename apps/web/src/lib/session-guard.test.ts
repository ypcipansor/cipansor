import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "./session";

/**
 * SECURITY CRITICAL — the page guard must not trust a client-writable cookie.
 *
 * Before the fix, `middleware.ts` read `auth-storage` and trusted
 * `isAuthenticated` + role from it, so a visitor could forge that cookie and
 * open protected/role-restricted pages. These tests drive the real Proxy and
 * assert:
 *   - a forged `auth-storage` (authenticated, and specifically admin) does not
 *     open a protected route;
 *   - a forged `Authorization` header does not either (it is not a browser
 *     navigation credential);
 *   - an unsigned/garbage session cookie is rejected;
 *   - a valid server-signed cookie is accepted and routed by its role;
 *   - an anonymous visitor still lands on /login.
 */

const SECRET = "guard-test-secret";

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.JWT_SECRET = SECRET;
});

function request(url: string, opts: { cookie?: string; authorization?: string; host?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.authorization) headers.authorization = opts.authorization;
  headers.host = opts.host ?? "portal.cipansor.or.id";
  return new NextRequest(url, { headers });
}

function location(res: Response): string | null {
  return res.headers.get("location");
}

async function validCookies(role: string, roleCode = role) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signSession(
    { v: 1, sub: "u1", role, roleCode, iat: now, exp: now + SESSION_TTL_SECONDS },
    SECRET
  );
  return `${SESSION_COOKIE}=${token}`;
}

describe("middleware session guard", () => {
  it("redirects an anonymous visitor on a protected route to /login", async () => {
    const res = await middleware(request("https://portal.cipansor.or.id/dashboard"));
    expect(res.status).toBe(307);
    expect(location(res)).toContain("/login");
  });

  it("REJECTS a forged `auth-storage` cookie claiming an admin session", async () => {
    const forged = encodeURIComponent(
      JSON.stringify({
        state: {
          isAuthenticated: true,
          user: { role: "SUPER_ADMIN", userRoles: [{ role: { code: "SUPER_ADMIN" }, isPrimary: true }] },
        },
        version: 0,
      })
    );
    // /users is admin-only; a forged profile cookie must not open it.
    const res = await middleware(
      request("https://portal.cipansor.or.id/users", { cookie: `auth-storage=${forged}` })
    );
    expect(res.status).toBe(307);
    expect(location(res)).toContain("/login");
  });

  it("REJECTS a forged `auth-storage` even for a plain authenticated route", async () => {
    const forged = encodeURIComponent(
      JSON.stringify({ state: { isAuthenticated: true, user: { role: "TEACHER" } }, version: 0 })
    );
    const res = await middleware(
      request("https://portal.cipansor.or.id/dashboard", { cookie: `auth-storage=${forged}` })
    );
    expect(location(res)).toContain("/login");
  });

  it("REJECTS an `Authorization: Bearer` header as a page credential", async () => {
    // A browser does not attach this to a document navigation; only a script
    // could, so it must not be a way past the guard.
    const res = await middleware(
      request("https://portal.cipansor.or.id/users", { authorization: "Bearer anything" })
    );
    expect(location(res)).toContain("/login");
  });

  it("REJECTS an unsigned / garbage session cookie", async () => {
    const res = await middleware(
      request("https://portal.cipansor.or.id/users", { cookie: `${SESSION_COOKIE}=forged.value` })
    );
    expect(location(res)).toContain("/login");
  });

  it("REJECTS a session cookie signed with the wrong secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signSession(
      { v: 1, sub: "u1", role: "SUPER_ADMIN", roleCode: "SUPER_ADMIN", iat: now, exp: now + 3600 },
      "attacker-secret"
    );
    const res = await middleware(
      request("https://portal.cipansor.or.id/users", { cookie: `${SESSION_COOKIE}=${token}` })
    );
    expect(location(res)).toContain("/login");
  });

  it("ACCEPTS a valid signed cookie and lets the route through", async () => {
    const res = await middleware(
      request("https://portal.cipansor.or.id/dashboard", { cookie: await validCookies("SUPER_ADMIN") })
    );
    expect(location(res)).toBeNull();
  });

  it("routes a valid admin cookie on the admin-only route (role honoured)", async () => {
    const res = await middleware(
      request("https://portal.cipansor.or.id/users", { cookie: await validCookies("SUPER_ADMIN") })
    );
    expect(location(res)).toBeNull();
  });

  it("redirects a valid non-admin cookie away from an admin-only route", async () => {
    const res = await middleware(
      request("https://portal.cipansor.or.id/users", { cookie: await validCookies("STUDENT") })
    );
    // Not 200 — the RBAC table sends them to their own dashboard.
    expect(res.status).toBe(307);
  });

  it("leaves public routes accessible to anonymous visitors (not bounced to /login)", async () => {
    // The host split sends a marketing path to the public apex, not to login;
    // either way the guard must not require a session for a public prefix.
    const res = await middleware(request("https://portal.cipansor.or.id/profil"));
    expect(location(res)).not.toContain("/login");
  });
});
