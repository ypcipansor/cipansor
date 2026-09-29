import { describe, it, expect, beforeAll } from "vitest";
import type { AuthSession } from "./auth-api";

/**
 * The e2e harness injects a session the same shape the API now issues: the
 * bearer tokens as HttpOnly cookies, and only the *user* in localStorage. If a
 * helper ever went back to seeding a token into localStorage (or dropped the
 * `httpOnly` flag off the session cookie), the suite would pass while testing a
 * world the app no longer lives in — and a regression in the real migration
 * could slip through green e2e. These assertions keep the fixture honest.
 *
 * `BASE_URL` is set before the dynamic import: Vite defines
 * `process.env.BASE_URL` as its config `base` ("/") under vitest, and the
 * helper reads it at module load.
 */
process.env.BASE_URL = "http://localhost:3000";
let api: typeof import("./auth-api");
beforeAll(async () => {
  api = await import("./auth-api");
});

const session: AuthSession = {
  user: { id: "u-1", email: "guru@example.test", role: "TEACHER" },
  accessToken: "access-1",
  refreshToken: "refresh-1",
  csrfToken: "csrf-1",
};

describe("buildStorageState", () => {
  it("stores the session tokens as HttpOnly cookies", () => {
    const state = api.buildStorageState(session);
    const access = state.cookies.find((c) => c.name === api.ACCESS_COOKIE)!;
    const refresh = state.cookies.find((c) => c.name === api.REFRESH_COOKIE)!;
    expect(access.value).toBe("access-1");
    expect(access.httpOnly).toBe(true);
    expect(refresh.value).toBe("refresh-1");
    expect(refresh.httpOnly).toBe(true);
  });

  it("keeps the CSRF cookie readable so the client can echo it", () => {
    const state = api.buildStorageState(session);
    const csrf = state.cookies.find((c) => c.name === api.CSRF_COOKIE)!;
    expect(csrf.value).toBe("csrf-1");
    expect(csrf.httpOnly).toBe(false);
  });

  it("persists the user but no bearer token in localStorage", () => {
    const state = api.buildStorageState(session);
    const entries = state.origins[0].localStorage;
    const authStorage = JSON.parse(
      entries.find((e) => e.name === "auth-storage")!.value,
    );
    expect(authStorage.state.user).toEqual(session.user);
    expect(authStorage.state.accessToken).toBeUndefined();
    expect(authStorage.state.refreshToken).toBeUndefined();

    const serialized = JSON.stringify(state.origins);
    expect(serialized).not.toContain("access-1");
    expect(serialized).not.toContain("refresh-1");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
  });
});
