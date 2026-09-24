import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  loginAs,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

/**
 * Governance oversight of HR is read-only (finding #8).
 *
 * Every governance role collapses to the legacy `UNIT_ADMIN` bucket, so the web
 * leave page used to render approval buttons whose API call the HR router now
 * refuses with 403. These specs pin the boundary against the real seeded stack:
 * pembina/pengawas may read the personnel directory, attendance and contracts,
 * but each write route refuses them — while a unit admin still may write.
 */

async function status(
  session: AuthSession,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<number> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

test.describe("HR governance roles: oversight read, no administration write", () => {
  for (const role of ["pembina", "pengawas"] as const) {
    test(`${role} may read the personnel directory but is refused the writes`, async () => {
      const session = await apiLogin(SEED_USERS[role]);

      // Oversight: the directory and attendance reads succeed. (The contracts
      // read is unit-scoped and a foundation governance role carries no unit,
      // so it is exercised at the router level in the unit tests instead.)
      await apiRequest(session, "GET", "/hr/employees?limit=5");
      await apiRequest(session, "GET", "/hr/attendance?limit=5");

      // Administration: every write the HR page could offer is refused.
      expect(await status(session, "POST", "/hr/attendance", {})).toBe(403);
      expect(await status(session, "POST", "/hr/departments", {})).toBe(403);
      expect(await status(session, "POST", "/hr/contracts", {})).toBe(403);
      expect(
        await status(session, "POST", "/hr/leave-balances/initialize", {}),
      ).toBe(403);
    });
  }

  test("a unit admin may still write attendance", async () => {
    const admin = await apiLogin(SEED_USERS.adminSdit);
    const code = await status(admin, "POST", "/hr/attendance", {});
    // Not 403: the request may fail validation (400), but authorization passed.
    expect(code).not.toBe(403);
  });

  test("the leave page offers no administration controls to a governance role", async ({
    page,
  }) => {
    await loginAs(page, "pembina");
    await page.goto("/hr/leaves");

    // The "All Requests" administration tab is admin-only; pembina sees only
    // their own leave history, never an approve control.
    await expect(page.getByRole("tab", { name: /All Requests/i })).toHaveCount(
      0,
    );
  });
});
