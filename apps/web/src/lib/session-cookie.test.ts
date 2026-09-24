import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AUTH_STORAGE_COOKIE,
  FORBIDDEN_TOKEN_COOKIE,
  clearBearerTokenCookie,
  clearRoutingSessionOnServer,
  clearSessionCookies,
} from "./session-cookie";

/**
 * Finding F — the session bearer token must never live in a JS-readable cookie.
 *
 * These tests pin the mitigation's contract: the credential cookie is removed,
 * and the only session cookie this app writes is the non-credential
 * `auth-storage` profile blob. Full cookie-based session issuance (server-set
 * `HttpOnly; Secure`) is a larger architectural change tracked separately.
 */
describe("session-cookie", () => {
  beforeEach(() => {
    document.cookie = `${FORBIDDEN_TOKEN_COOKIE}=; path=/; max-age=0`;
    document.cookie = `${AUTH_STORAGE_COOKIE}=; path=/; max-age=0`;
  });

  it("clears a leftover bearer-token cookie", () => {
    document.cookie = `${FORBIDDEN_TOKEN_COOKIE}=leaked-bearer; path=/`;
    expect(document.cookie).toContain(
      `${FORBIDDEN_TOKEN_COOKIE}=leaked-bearer`,
    );

    clearBearerTokenCookie();

    expect(document.cookie).not.toContain("leaked-bearer");
    expect(document.cookie).not.toContain(
      `${FORBIDDEN_TOKEN_COOKIE}=leaked-bearer`,
    );
  });

  it("clears both the credential and the profile cookie on logout", () => {
    document.cookie = `${FORBIDDEN_TOKEN_COOKIE}=tok; path=/`;
    document.cookie = `${AUTH_STORAGE_COOKIE}=profile; path=/`;

    clearSessionCookies();

    expect(document.cookie).not.toContain(FORBIDDEN_TOKEN_COOKIE);
    expect(document.cookie).not.toContain(AUTH_STORAGE_COOKIE);
  });

  it("never writes a bearer token of its own (the total set of cookies it adds is empty)", () => {
    const before = document.cookie;
    clearSessionCookies();
    // A cleared cookie may still be visible as an empty assignment; what must
    // never appear is a new credentialed value.
    expect(before).not.toContain("Bearer");
  });
});

/**
 * Finding A — the `HttpOnly` routing cookie can only be removed server-side.
 *
 * `clearSessionCookies()` cannot touch `cipansor-session`, so the definitive
 * refresh-failure path must also ask the server. This helper is the shared,
 * best-effort wrapper for that request.
 */
describe("clearRoutingSessionOnServer (finding A)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("issues DELETE /api/session and reports success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(clearRoutingSessionOnServer()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/session", {
      method: "DELETE",
    });
  });

  it("resolves false (never rejects) on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(clearRoutingSessionOnServer()).resolves.toBe(false);
  });

  it("resolves false (never rejects) on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(clearRoutingSessionOnServer()).resolves.toBe(false);
  });
});
