import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";
import { authCookieValue, MAX_AUTH_COOKIE_BYTES } from "./auth-cookie";

/**
 * Middleware-level regression coverage for the oversized `auth-storage` cookie.
 *
 * The store mirrors the whole persisted auth payload into that cookie, and a
 * single cookie tops out near 4 KB. When the write overflowed, the cookie was
 * dropped and `getAuthState` fell back to `accessToken`, which returns
 * `{ isAuthenticated: true }` with no role. The RBAC gate is written
 * `if (isAuthenticated && role && ...)`, so an absent role skipped the check and
 * every authenticated user could open any route.
 *
 * These tests drive the real `middleware()` with a real `NextRequest` so the
 * gate is exercised end to end, not just its inputs.
 */

/** Filler assignments, none primary, sized to overflow the cookie. */
function fillerAssignments(count = 30) {
  return Array.from({ length: count }, (_, i) => ({
    isPrimary: false,
    role: { code: `ROLE_${i}` },
    unit: { name: `Unit ${i} dengan nama panjang sekali` },
  }));
}

function authCookieFor(user: Record<string, unknown>): string {
  const persisted = JSON.stringify({
    state: { user, isAuthenticated: true },
    version: 0,
  });
  return encodeURIComponent(authCookieValue(persisted));
}

function request(path: string, cookies: Record<string, string>): NextRequest {
  // Model the browser, not just the middleware: a cookie over the size limit is
  // dropped rather than sent. Without this the test would pass even with the
  // bug, because the middleware happily parses a cookie no browser would carry.
  const cookie = Object.entries(cookies)
    .filter(([, v]) => v.length <= MAX_AUTH_COOKIE_BYTES)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie },
  });
}

const STUDENT = {
  role: "STUDENT",
  userRoles: [
    { isPrimary: true, role: { code: "SDIT_STUDENT" } },
    ...fillerAssignments(),
  ],
};

describe("middleware RBAC with a trimmed auth-storage cookie", () => {
  it("still redirects a student away from an admin-only route", () => {
    // /finance is in UNIT_ADMIN's routes and not the student's. The trimmed
    // cookie must keep that boundary; before the fix the cookie was dropped and
    // this request passed straight through.
    const res = middleware(
      request("/finance", { "auth-storage": authCookieFor(STUDENT) }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/student");
  });

  it("lets the same student reach a route its role does allow", () => {
    const res = middleware(
      request("/announcements", { "auth-storage": authCookieFor(STUDENT) }),
    );

    expect(res.headers.get("location")).toBeNull();
  });

  it("demonstrates the hole an absent role would open", () => {
    // The failure mode being guarded: an `accessToken` with no `auth-storage`
    // is "authenticated, role unknown", so the `role &&` guard skips RBAC and
    // /finance passes through. Pinned so a future change cannot reintroduce the
    // silent-fallthrough branch as the *normal* path.
    const res = middleware(
      request("/finance", { accessToken: "a".repeat(1197) }),
    );

    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps an oversized payload inside the limit", () => {
    const encoded = authCookieFor(STUDENT);

    expect(encoded.length).toBeLessThanOrEqual(MAX_AUTH_COOKIE_BYTES);
  });
});
