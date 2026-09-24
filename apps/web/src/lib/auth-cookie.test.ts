import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { middlewareAuthCookieValue } from "./auth-cookie";
import { getEffectiveRole, getPrimaryRoleCode, type RbacUser } from "./rbac";

/** A role assignment the way `/auth/me` returns it: the whole role and unit ride along. */
function assignment(code: string, isPrimary: boolean) {
  return {
    id: `ur-${code}`,
    isPrimary,
    isActive: true,
    role: {
      id: `role-${code}`,
      code,
      name: `Peran ${code} dengan nama tampilan yang cukup panjang`,
      realm: "UNIT",
      permissions: Array.from({ length: 12 }, (_, i) => ({
        code: `${code}_PERMISSION_${i}`,
        description: "Izin yang hanya dipakai antarmuka, tidak oleh middleware",
      })),
    },
    unit: {
      id: "unit-sdit",
      code: "SDIT",
      name: "SD Islam Terpadu Cipansor",
      address:
        "Jl. Raya Cipansor No. 1, Desa Cipansor, Kecamatan Contoh, Kabupaten Contoh, Jawa Barat 40000",
    },
  };
}

function persisted(user: unknown, isAuthenticated = true) {
  return JSON.stringify({ state: { user, isAuthenticated }, version: 0 });
}

/** What middleware.ts does with the cookie value, minus the NextRequest. */
function middlewareReads(cookieValue: string) {
  const parsed = JSON.parse(cookieValue);
  if (parsed.state?.isAuthenticated !== true || !parsed.state?.user)
    return null;
  return {
    role: getEffectiveRole(parsed.state.user),
    roleCode: getPrimaryRoleCode(parsed.state.user),
  };
}

const fatUser = {
  id: "u-1",
  email: "fatimah@cipansor.or.id",
  name: "Fatimah",
  role: "TEACHER",
  profile: { bio: "x".repeat(800), phone: "0812000000" },
  userRoles: [
    assignment("SDIT_GURU", false),
    assignment("SDIT_WALI_KELAS", true),
    assignment("SDIT_KOMITE", false),
    assignment("SMPIT_GURU", false),
  ],
};

describe("middlewareAuthCookieValue", () => {
  const cases: Array<[string, unknown]> = [
    ["the primary assignment is not the first", fatUser],
    [
      "no assignment is marked primary — the first one decides",
      {
        ...fatUser,
        userRoles: fatUser.userRoles.map((a) => ({ ...a, isPrimary: false })),
      },
    ],
    ["legacy role only", { id: "u-2", role: "PARENT" }],
    [
      "a raw RoleCode in the legacy column",
      { id: "u-3", role: "SMPIT_KEPALA_SEKOLAH", userRoles: [] },
    ],
    [
      "the primary assignment has no role code",
      {
        id: "u-4",
        role: "STAFF",
        userRoles: [{ isPrimary: true, role: null }],
      },
    ],
    ["signed out", null],
  ];

  it.each(cases)(
    "the middleware reads the same role from the slim cookie: %s",
    (_, user) => {
      const full = persisted(user);
      const slim = middlewareAuthCookieValue(full);
      expect(slim).not.toBeNull();
      expect(middlewareReads(slim!)).toEqual(middlewareReads(full));
      if (user) {
        expect(getEffectiveRole(user as RbacUser)).toBeDefined();
      }
    },
  );

  it("keeps isAuthenticated false when the store says so", () => {
    const slim = middlewareAuthCookieValue(persisted(fatUser, false));
    expect(JSON.parse(slim!).state.isAuthenticated).toBe(false);
    expect(middlewareReads(slim!)).toBeNull();
  });

  it("stays far below the 4 KB browsers silently drop, however fat the user", () => {
    const fatter = {
      ...fatUser,
      userRoles: Array.from({ length: 30 }, (_, i) =>
        assignment(`ROLE_${i}`, i === 17),
      ),
    };
    const full = encodeURIComponent(persisted(fatter));
    const slim = encodeURIComponent(
      middlewareAuthCookieValue(persisted(fatter))!,
    );
    // The bug: the full value is what the browser used to throw away.
    expect(full.length).toBeGreaterThan(4096);
    expect(slim.length).toBeLessThan(400);
  });

  it("returns null for a value that is not JSON, so the caller clears the cookie", () => {
    expect(middlewareAuthCookieValue("{not json")).toBeNull();
    expect(middlewareAuthCookieValue("null")).toBeNull();
  });

  it("the middleware reads nothing from the cookie's user beyond what the slim value keeps", () => {
    // The slim value only holds what getEffectiveRole/getPrimaryRoleCode read.
    // A field read straight off the cookie's user (parsed.state.user.<x>) would
    // silently come back undefined in production.
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../middleware.ts"),
      "utf8",
    );
    const direct = src.match(/parsed\.state\??\.user\??\.\w+/g) ?? [];
    expect(direct).toEqual([]);
    const passedOn = src.match(/\w+\(parsed\.state\??\.user\)/g) ?? [];
    expect(passedOn.length).toBeGreaterThan(0);
    for (const call of passedOn) {
      expect(call).toMatch(/^(getEffectiveRole|getPrimaryRoleCode)\(/);
    }
  });
});
