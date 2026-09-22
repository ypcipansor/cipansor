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
      new Request("http://localhost:3000/api/session", { method: "POST", body: "{}" })
    );
    const setCookie = setCookieOf(res);
    expect(setCookie).toContain(`${SESSION_COOKIE}=;`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("does not mint a cookie when the API rejects the bearer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 401 }))
    );
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer forged" },
        body: "{}",
      })
    );
    expect(setCookieOf(res)).toContain("Max-Age=0");
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
            { status: 200 }
          )
      )
    );
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer real" },
        body: "{}",
      })
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

    const value = setCookie.slice(setCookie.indexOf("=") + 1, setCookie.indexOf(";"));
    const payload = await verifySession(value, SECRET);
    expect(payload).toMatchObject({ sub: "user-1", role: "TEACHER", roleCode: "TEACHER" });
  });

  it("clears the cookie on {clear:true}", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer real" },
        body: JSON.stringify({ clear: true }),
      })
    );
    expect(setCookieOf(res)).toContain("Max-Age=0");
  });

  it("fails closed (500) when no signing secret is configured", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { id: "user-1", role: "TEACHER" } }), {
            status: 200,
          })
      )
    );
    const res = await POST(
      new Request("http://localhost:3000/api/session", {
        method: "POST",
        headers: { authorization: "Bearer real" },
        body: "{}",
      })
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
