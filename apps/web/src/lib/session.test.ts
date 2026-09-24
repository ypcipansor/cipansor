import { describe, it, expect } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  resolveSessionSecret,
  signSession,
  verifySession,
  sessionCookieOptions,
  type SessionPayload,
} from "./session";

/**
 * SECURITY CRITICAL — forged profile cookie bypasses the page guard.
 *
 * The Proxy trusted `auth-storage`, a cookie the BROWSER writes. These tests
 * pin the replacement: a server-signed, HttpOnly cookie whose signature the
 * Proxy verifies before trusting `isAuthenticated` or the role. A forged or
 * tampered value must verify as null (treated as unauthenticated), and the
 * cookie must not be readable by JavaScript.
 */

const SECRET = "test-routing-secret-0123456789";

function payload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    v: 1,
    sub: "user-1",
    role: "SUPER_ADMIN",
    roleCode: "SUPER_ADMIN",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    ...overrides,
  };
}

describe("resolveSessionSecret", () => {
  it("prefers SESSION_SECRET, then JWT_SECRET", () => {
    expect(resolveSessionSecret({ SESSION_SECRET: "s", JWT_SECRET: "j" })).toBe(
      "s",
    );
    expect(resolveSessionSecret({ JWT_SECRET: "j" })).toBe("j");
  });

  it("returns an empty secret in production when neither is set (fail closed)", () => {
    expect(resolveSessionSecret({ NODE_ENV: "production" })).toBe("");
  });
});

describe("signSession / verifySession", () => {
  it("round-trips a valid payload", async () => {
    const token = await signSession(payload(), SECRET);
    const verified = await verifySession(token, SECRET);
    expect(verified).toMatchObject({
      v: 1,
      sub: "user-1",
      role: "SUPER_ADMIN",
    });
  });

  it("rejects a forged cookie signed with the wrong secret", async () => {
    const forged = await signSession(payload(), "attacker-secret");
    await expect(verifySession(forged, SECRET)).resolves.toBeNull();
  });

  it("rejects a payload whose body was edited without re-signing", async () => {
    const token = await signSession(payload({ role: "STUDENT" }), SECRET);
    const [body] = token.split(".");
    const forgedBody = btoa(JSON.stringify(payload({ role: "SUPER_ADMIN" })))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await expect(
      verifySession(`${forgedBody}.${body.split(".")[1] ?? ""}`, SECRET),
    ).resolves.toBeNull();
  });

  it("rejects a garbage / unsigned cookie", async () => {
    await expect(verifySession("not-a-session", SECRET)).resolves.toBeNull();
    await expect(verifySession("a.b", SECRET)).resolves.toBeNull();
    await expect(verifySession(undefined, SECRET)).resolves.toBeNull();
    await expect(verifySession("", SECRET)).resolves.toBeNull();
  });

  it("rejects an expired cookie", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signSession(
      payload({ iat: now - 100, exp: now - 1 }),
      SECRET,
    );
    await expect(verifySession(token, SECRET)).resolves.toBeNull();
    // Well within its lifetime it is accepted.
    await expect(
      verifySession(await signSession(payload(), SECRET), SECRET, now),
    ).resolves.toMatchObject({
      sub: "user-1",
    });
  });

  it("rejects any cookie when no secret is configured (production fail-closed)", async () => {
    const token = await signSession(payload(), "");
    expect(token).toBe("");
    await expect(verifySession(token, "")).resolves.toBeNull();
  });

  it("rejects a payload with an unexpected shape even if correctly signed", async () => {
    // A signed-but-invalid body must not be trusted; the server never mints it,
    // but a future bug or a leaked secret must not turn into an auth bypass.
    const bad = await signSession(
      { sub: 5 } as unknown as SessionPayload,
      SECRET,
    );
    await expect(verifySession(bad, SECRET)).resolves.toBeNull();
  });
});

describe("sessionCookieOptions", () => {
  it("is HttpOnly and SameSite=Lax, Secure in production only", () => {
    const prod = sessionCookieOptions({ NODE_ENV: "production" });
    expect(prod).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    const dev = sessionCookieOptions({ NODE_ENV: "development" });
    expect(dev).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  });
});
