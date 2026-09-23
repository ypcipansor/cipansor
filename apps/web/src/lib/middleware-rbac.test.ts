import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";
import {
  ROUTING_COOKIE,
  SESSION_DEAD_COOKIE,
  encodeRoutingCookie,
  resolveRoutingCookieSecret,
  signRoutingCookie,
  verifyRoutingCookie,
  type RoutingCookiePayload,
} from "@cipansor/shared";

/**
 * Middleware-level regression coverage for route protection.
 *
 * The session is server-issued: the API sets an `HttpOnly` `cipansor_routing`
 * cookie (the only role-bearing cookie) plus the access/refresh cookies. These
 * tests drive the real `middleware()` with a real `NextRequest`, so the gate is
 * exercised end to end.
 *
 * The cookie the middleware routes on is MAC'd, so a forged `auth-storage`
 * cookie — or a hand-encoded unsigned routing cookie — must grant nothing.
 */

const SECRET = resolveRoutingCookieSecret({
  ROUTING_COOKIE_SECRET: process.env.ROUTING_COOKIE_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV,
});

async function routingCookieFor(
  role: string,
  roleCode: string,
): Promise<string> {
  return signRoutingCookie(
    {
      role,
      roleCode,
      userId: "user-1",
      unitId: null,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    SECRET,
  );
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
  it("redirects a student away from an admin-only route", async () => {
    const res = await middleware(
      request("/finance", {
        [ROUTING_COOKIE]: await routingCookieFor("STUDENT", "SDIT_STUDENT"),
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/student");
  });

  it("lets the same student reach a route its role does allow", async () => {
    const res = await middleware(
      request("/announcements", {
        [ROUTING_COOKIE]: await routingCookieFor("STUDENT", "SDIT_STUDENT"),
      }),
    );

    expect(res.headers.get("location")).toBeNull();
  });

  it("fails closed for a session with no role", async () => {
    // An access token with no routing cookie must NOT pass a protected route:
    // the middleware cannot say what the visitor may open, so it sends them to
    // re-establish a session.
    const res = await middleware(
      request("/finance", { access_token: "a".repeat(1197) }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("fails closed for a session carrying only the legacy access cookie", async () => {
    const res = await middleware(
      request("/finance", { accessToken: "a".repeat(1197) }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("still allows public routes with a token but no role", async () => {
    const res = await middleware(
      request("/profil", { access_token: "a".repeat(1197) }),
    );

    expect(res.headers.get("location")).toBeNull();
  });

  it("ignores a forged client-written auth-storage cookie", async () => {
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

    const res = await middleware(
      request("/finance", { "auth-storage": forged }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});

describe("middleware rejects a forged or stale routing cookie", () => {
  it("cannot be granted access by a hand-encoded unsigned routing JSON blob", async () => {
    // The exact pre-signature encoding: base64url(JSON) with a SUPER_ADMIN role
    // and no MAC. It used to be trusted; now it is indistinguishable from
    // garbage, so the protected route fails closed.
    const unsigned = encodeRoutingCookie({
      role: "SUPER_ADMIN",
      roleCode: "SUPER_ADMIN",
      userId: "attacker",
      unitId: null,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await middleware(
      request("/finance", { [ROUTING_COOKIE]: unsigned }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("rejects a payload tampered with after signing", async () => {
    const signed = await routingCookieFor("STUDENT", "SDIT_STUDENT");
    const [payload, mac] = signed.split(".");
    // Swap the payload for one that says SUPER_ADMIN, keeping the original MAC.
    const tamperedPayload = encodeRoutingCookie({
      role: "SUPER_ADMIN",
      roleCode: "SUPER_ADMIN",
      userId: "attacker",
      unitId: null,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const tampered = `${tamperedPayload}.${mac}`;
    expect(tampered).not.toBe(signed);
    // Sanity: the attacker really did change the payload, not just re-encode it.
    expect(tamperedPayload).not.toBe(payload);

    const res = await middleware(
      request("/finance", { [ROUTING_COOKIE]: tampered }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("rejects a signature that is valid for a different key", async () => {
    const foreign = await signRoutingCookie(
      {
        role: "SUPER_ADMIN",
        roleCode: "SUPER_ADMIN",
        userId: "attacker",
        unitId: null,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      "an-attacker-chosen-key",
    );

    const res = await middleware(
      request("/finance", { [ROUTING_COOKIE]: foreign }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("rejects a correctly signed but expired routing cookie", async () => {
    const expired = await signRoutingCookie(
      {
        role: "SUPER_ADMIN",
        roleCode: "SUPER_ADMIN",
        userId: "user-1",
        unitId: null,
        exp: Math.floor(Date.now() / 1000) - 10,
      },
      SECRET,
    );

    const res = await middleware(
      request("/finance", { [ROUTING_COOKIE]: expired }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("rejects malformed routing cookie values", async () => {
    for (const malformed of [
      "",
      ".",
      "not-a-cookie",
      "a.b.c.d.",
      "%%%%.%%%%",
    ]) {
      const res = await middleware(
        request("/finance", { [ROUTING_COOKIE]: malformed }),
      );
      expect(res.status, `value ${JSON.stringify(malformed)}`).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    }
  });

  it("keeps public routes reachable even with a forged routing cookie", async () => {
    const res = await middleware(
      request("/profil", { [ROUTING_COOKIE]: "forged.value" }),
    );

    expect(res.headers.get("location")).toBeNull();
  });

  it("still routes a correctly signed cookie for a permitted role", async () => {
    const res = await middleware(
      request("/finance", {
        [ROUTING_COOKIE]: await routingCookieFor(
          "UNIT_ADMIN",
          "YAYASAN_PENGAWAS",
        ),
      }),
    );

    expect(res.headers.get("location")).toBeNull();
  });

  it("verifies a signed payload back to its original role and user", async () => {
    const payload: RoutingCookiePayload = {
      role: "UNIT_ADMIN",
      roleCode: "YAYASAN_PENGAWAS",
      userId: "user-9",
      unitId: null,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const value = await signRoutingCookie(payload, SECRET);

    expect(await verifyRoutingCookie(value, SECRET)).toEqual(payload);
    expect(await verifyRoutingCookie(value, "wrong-key")).toBeNull();
  });

  it("stops trusting a valid routing cookie once the client marks the session dead", async () => {
    // Finding 3: a failed refresh clears the HttpOnly cookies server-side, but
    // the stale routing cookie can still ride the racing navigation to /login.
    // The credential-free dead marker must make the middleware treat that
    // request as unauthenticated so /login is served instead of bouncing the
    // user back to a dashboard the dead session cannot load.
    const res = await middleware(
      request("/login", {
        [ROUTING_COOKIE]: await routingCookieFor(
          "UNIT_ADMIN",
          "YAYASAN_PENGAWAS",
        ),
        [SESSION_DEAD_COOKIE]: "1",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("without the marker the same cookie still routes to a dashboard", async () => {
    // The counterpart, proving the previous test's outcome is caused by the
    // marker rather than a broken cookie: with the marker absent, /login with a
    // valid routing cookie redirects to the role dashboard.
    const res = await middleware(
      request("/login", {
        [ROUTING_COOKIE]: await routingCookieFor(
          "UNIT_ADMIN",
          "YAYASAN_PENGAWAS",
        ),
      }),
    );

    expect(res.headers.get("location")).toBeTruthy();
    expect(res.headers.get("location")).not.toContain("/login");
  });
});
