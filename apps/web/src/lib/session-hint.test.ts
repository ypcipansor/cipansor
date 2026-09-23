import { afterEach, describe, expect, it } from "vitest";
import { hasSessionHint } from "./api";

/**
 * Regression coverage for finding 3 (PR #508).
 *
 * `hasSessionHint` decides whether a 401 may be answered with a *refresh*
 * attempt, and whether a failed refresh ends in a logout. It must key off an
 * actual user, not the mere existence of the persisted `auth-storage` key:
 * the store re-persists `{ user: null, isAuthenticated: false }` after any 401,
 * so an anonymous visitor always has the key. Treating that as a session made
 * every later page load fire a speculative refresh, and once the refresh
 * endpoint reliably cleared cookies on a 401 that stray request destroyed a
 * session a concurrent sign-in had just established — the login bounce this
 * helper is supposed to prevent.
 */
describe("hasSessionHint", () => {
  afterEach(() => localStorage.clear());

  it("is false when the key is absent", () => {
    expect(hasSessionHint()).toBe(false);
  });

  it("is false for the persisted empty state an anonymous visitor leaves behind", () => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({ state: { user: null, isAuthenticated: false }, version: 0 }),
    );
    expect(hasSessionHint()).toBe(false);
  });

  it("is true when a user is persisted", () => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: { user: { id: "u1", email: "a@b.c" }, isAuthenticated: true },
        version: 0,
      }),
    );
    expect(hasSessionHint()).toBe(true);
  });

  it("is false for malformed JSON rather than throwing", () => {
    localStorage.setItem("auth-storage", "{not json");
    expect(hasSessionHint()).toBe(false);
  });
});
