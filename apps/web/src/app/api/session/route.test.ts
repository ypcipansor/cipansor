import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, DELETE } from "./route";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * The routing session is only as good as the endpoint that mints it: if it
 * signed a cookie from a CLIENT assertion, a visitor could mint an admin
 * session by lying. These tests pin the two properties that matter — the API
 * must confirm the bearer before a cookie is issued, and the cookie must be
 * HttpOnly/Secure-in-production.
 */

const SECRET = "route-test-secret";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.JWT_SECRET = SECRET;
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setCookieOf(res: Response): string {
  return res.headers.get("set-cookie") ?? "";
}

describe("POST /api/session", () => {
  it("does not mint a cookie without a bearer (no client assertion)", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        body: "{}",
      }),
    );
    const setCookie = setCookieOf(res);
    expect(setCookie).toContain(`${SESSION_COOKIE}=;`);
    expect(setCookie).toContain("Max-Age=0");
    // The body contract the web store depends on: no cookie minted means
    // `session:false`. The store treats only `{session:true}` as success, so
    // this must stay false whenever the Set-Cookie above is a clear.
    await expect(res.clone().json()).resolves.toEqual({ session: false });
  });

  it("does not mint a cookie when the API rejects the bearer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 401 })),
    );
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer forged" },
        body: "{}",
      }),
    );
    expect(setCookieOf(res)).toContain("Max-Age=0");
    await expect(res.clone().json()).resolves.toEqual({ session: false });
  });

  it("does not mint a cookie when the API confirms no user id", async () => {
    // A 200 from `/auth/me` without a user id must not become a session.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ data: {} }), { status: 200 }),
      ),
    );
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer real" },
        body: "{}",
      }),
    );
    expect(setCookieOf(res)).toContain("Max-Age=0");
    await expect(res.clone().json()).resolves.toEqual({ session: false });
  });

  it("mints a signed, HttpOnly cookie for an API-confirmed session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                id: "user-1",
                role: "TEACHER",
                userRoles: [{ isPrimary: true, role: { code: "TEACHER" } }],
              },
            }),
            { status: 200 },
          ),
      ),
    );
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer real" },
        body: "{}",
      }),
    );
    const setCookie = setCookieOf(res);
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    // Dev (NODE_ENV != production) must still set the cookie; only production
    // forces Secure.
    if (process.env.NODE_ENV === "production") {
      expect(setCookie.toLowerCase()).toContain("secure");
    }

    const value = setCookie.slice(
      setCookie.indexOf("=") + 1,
      setCookie.indexOf(";"),
    );
    const payload = await verifySession(value, SECRET);
    expect(payload).toMatchObject({
      sub: "user-1",
      role: "TEACHER",
      roleCode: "TEACHER",
    });
    // The store only completes a login on this exact body.
    await expect(res.clone().json()).resolves.toEqual({ session: true });
  });

  it("clears the cookie on {clear:true}", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer real" },
        body: JSON.stringify({ clear: true }),
      }),
    );
    expect(setCookieOf(res)).toContain("Max-Age=0");
  });

  /** Mint a cookie for a given /auth/me payload and decode its routing fields. */
  async function mintFor(data: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ data }), { status: 200 }),
      ),
    );
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer real" },
        body: "{}",
      }),
    );
    const setCookie = setCookieOf(res);
    const value = setCookie.slice(
      setCookie.indexOf("=") + 1,
      setCookie.indexOf(";"),
    );
    return verifySession(value, SECRET);
  }

  it("derives the routing bucket from the primary RoleCode, not the stale legacy role (a: legacy MORE privileged)", async () => {
    // The legacy column says SUPER_ADMIN, but the active assignment is a
    // teacher. Signing the legacy role would hand a teacher the admin bucket.
    const payload = await mintFor({
      id: "u1",
      role: "SUPER_ADMIN",
      userRoles: [{ isPrimary: true, role: { code: "SDIT_GURU" } }],
    });
    expect(payload).toMatchObject({ role: "TEACHER", roleCode: "SDIT_GURU" });
  });

  it("derives the routing bucket from the primary RoleCode, not the stale legacy role (b: legacy LESS privileged)", async () => {
    // The legacy column says STUDENT, but the active assignment is an admin.
    // Signing the legacy role would bounce an admin off their own pages.
    const payload = await mintFor({
      id: "u1",
      role: "STUDENT",
      userRoles: [{ isPrimary: true, role: { code: "SDIT_ADMIN" } }],
    });
    expect(payload).toMatchObject({
      role: "UNIT_ADMIN",
      roleCode: "SDIT_ADMIN",
    });
  });

  it("reflects a role switch: a re-mint after the assignment changed uses the new RoleCode", async () => {
    const before = await mintFor({
      id: "u1",
      role: "TEACHER",
      userRoles: [{ isPrimary: true, role: { code: "SDIT_GURU" } }],
    });
    expect(before).toMatchObject({ role: "TEACHER", roleCode: "SDIT_GURU" });

    // Token refresh / role switch: the SAME account now reports a different
    // primary assignment. The new cookie must reflect it immediately.
    const after = await mintFor({
      id: "u1",
      role: "TEACHER",
      userRoles: [{ isPrimary: true, role: { code: "SMPIT_ADMIN" } }],
    });
    expect(after).toMatchObject({
      role: "UNIT_ADMIN",
      roleCode: "SMPIT_ADMIN",
    });
  });

  it("falls back to the legacy role only when the RoleCode is not bucketed (komite/alumni)", async () => {
    // The backend keeps komite/alumni RoleCode-native; their legacy column is
    // the only routing bucket available.
    const payload = await mintFor({
      id: "u1",
      role: "STAFF",
      userRoles: [{ isPrimary: true, role: { code: "SDIT_KOMITE" } }],
    });
    expect(payload).toMatchObject({ roleCode: "SDIT_KOMITE" });
    expect(["STAFF", undefined]).toContain(payload?.role);
  });

  it("fails closed (500) when no signing secret is configured", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: { id: "user-1", role: "TEACHER" } }),
            {
              status: 200,
            },
          ),
      ),
    );
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer real" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/session", () => {
  it("clears the routing cookie", async () => {
    const res = await DELETE();
    const setCookie = setCookieOf(res);
    expect(setCookie).toContain(`${SESSION_COOKIE}=;`);
    expect(setCookie).toContain("Max-Age=0");
  });
});
