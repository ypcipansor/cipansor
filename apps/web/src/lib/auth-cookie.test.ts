import { describe, expect, it } from "vitest";
import { getEffectiveRole, getPrimaryRoleCode } from "@/lib/rbac";
import {
  authCookiePayload,
  authCookieValue,
  MAX_AUTH_COOKIE_BYTES,
} from "./auth-cookie";

/**
 * Regression coverage for the `auth-storage` cookie.
 *
 * The store mirrors the whole persisted auth payload into that cookie for
 * `middleware.ts`, and a single cookie tops out near 4 KB. A user with many role
 * assignments overflowed it, the write was dropped, and the middleware fell
 * back to `accessToken` — `{ isAuthenticated: true }` with no role, which skips
 * the RBAC gate entirely. These tests pin the size contract and, more
 * importantly, that trimming still leaves the middleware able to resolve the
 * role it gates on.
 */

/** A role assignment shaped like the API's, sized to a realistic payload. */
function assignment(code: string, isPrimary: boolean, unitName: string) {
  return {
    id: `assign-${code}`,
    isPrimary,
    role: { id: `role-${code}`, code, name: code, permissions: [] },
    unit: { id: `unit-${code}`, name: unitName, type: "SDIT" },
  };
}

/** Enough assignments to push the encoded payload well past the limit. */
function manyAssignments(count = 30) {
  return Array.from({ length: count }, (_, i) =>
    assignment(`ROLE_${i}`, i === 0, `Unit ${i} dengan nama panjang sekali`),
  );
}

/** Filler assignments, none primary — for tests that set the primary themselves. */
function fillerAssignments(count = 30) {
  return Array.from({ length: count }, (_, i) =>
    assignment(`ROLE_${i}`, false, `Unit ${i} dengan nama panjang sekali`),
  );
}

function persisted(user: Record<string, unknown>): string {
  return JSON.stringify({ state: { user, isAuthenticated: true }, version: 0 });
}

describe("authCookieValue", () => {
  it("returns a small payload byte-for-byte", () => {
    const value = persisted({
      id: "user-1",
      role: "UNIT_ADMIN",
      userRoles: [],
    });

    expect(authCookieValue(value)).toBe(value);
  });

  it("fits an oversized payload inside the browser's per-cookie limit", () => {
    const value = persisted({
      id: "user-1",
      role: "UNIT_ADMIN",
      userRoles: manyAssignments(),
    });

    expect(encodeURIComponent(value).length).toBeGreaterThan(
      MAX_AUTH_COOKIE_BYTES,
    );
    expect(
      encodeURIComponent(authCookieValue(value)).length,
    ).toBeLessThanOrEqual(MAX_AUTH_COOKIE_BYTES);
  });

  it("preserves the fields the middleware reads when trimming", () => {
    const value = persisted({
      id: "user-1",
      role: "UNIT_ADMIN",
      userRoles: manyAssignments(),
    });

    const parsed = JSON.parse(authCookieValue(value));

    expect(parsed.state.isAuthenticated).toBe(true);
    expect(parsed.state.user.role).toBe("UNIT_ADMIN");
    expect(parsed.state.user.userRoles).toHaveLength(30);
    expect(parsed.state.user.userRoles[0]).toEqual({
      isPrimary: true,
      role: { code: "ROLE_0" },
    });
  });

  it("still resolves the effective role and role code after trimming", () => {
    // The whole point: `canAccessRoute` runs on `getEffectiveRole` and
    // `getPrimaryRoleCode`, so a cookie that fits but loses the role would trade
    // a dropped cookie for a silent RBAC hole — the failure mode being fixed.
    const user = {
      id: "user-1",
      role: "UNIT_ADMIN",
      userRoles: manyAssignments(),
    };

    const trimmedUser = JSON.parse(authCookieValue(persisted(user))).state.user;

    expect(getPrimaryRoleCode(trimmedUser)).toBe("ROLE_0");
    expect(getEffectiveRole(trimmedUser)).toBe(getEffectiveRole(user));
  });

  it("keeps the primary assignment's code, not just the first one", () => {
    // `isPrimary` decides, so flattening to the first assignment would change
    // which role routes the user.
    const userRoles = [
      assignment("YAYASAN_KETUA", false, "Yayasan Cipansor"),
      ...fillerAssignments(),
      assignment("SDIT_ADMIN", true, "SD IT Cipansor"),
    ];
    const user = { id: "user-1", role: null, userRoles };

    const trimmedUser = JSON.parse(authCookieValue(persisted(user))).state.user;

    expect(getPrimaryRoleCode(trimmedUser)).toBe("SDIT_ADMIN");
    expect(getEffectiveRole(trimmedUser)).toBe(getEffectiveRole(user));
  });

  it("yields an empty assignment list for a user without roles", () => {
    const value = persisted({
      id: "user-1",
      role: "UNIT_ADMIN",
      filler: "x".repeat(4000),
    });

    const trimmedUser = JSON.parse(authCookieValue(value)).state.user;

    expect(trimmedUser.userRoles).toEqual([]);
    expect(trimmedUser.role).toBe("UNIT_ADMIN");
  });

  it("returns an unparseable payload untouched", () => {
    // `getAuthState` already guards its own JSON.parse, and inventing a payload
    // here could only discard what the caller stored.
    const broken = `{"state":{"user":${"x".repeat(5000)}}}`;

    expect(authCookieValue(broken)).toBe(broken);
  });

  it("marks an unauthenticated payload as such", () => {
    const value = JSON.stringify({
      state: {
        user: { id: "user-1", role: "UNIT_ADMIN", filler: "x".repeat(4000) },
        isAuthenticated: false,
      },
      version: 0,
    });

    expect(JSON.parse(authCookieValue(value)).state.isAuthenticated).toBe(
      false,
    );
  });
});

describe("authCookiePayload", () => {
  it("keeps the primary flag so the deciding assignment is unambiguous", () => {
    const payload = JSON.parse(
      authCookiePayload(
        {
          role: "STAFF",
          userRoles: [
            { isPrimary: false, role: { code: "TEACHER" } },
            { isPrimary: true, role: { code: "SDIT_ADMIN" } },
          ],
        },
        true,
      ),
    );

    expect(payload.state.user.userRoles).toEqual([
      { isPrimary: false, role: { code: "TEACHER" } },
      { isPrimary: true, role: { code: "SDIT_ADMIN" } },
    ]);
  });

  it("tolerates a null user and a missing role code", () => {
    const payload = JSON.parse(authCookiePayload(null, false));

    expect(payload.state.user).toEqual({ role: null, userRoles: [] });
    expect(payload.state.isAuthenticated).toBe(false);
  });
});
