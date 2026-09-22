import { test, expect } from "@playwright/test";
import { apiLogin, injectSession, SEED_USERS } from "./helpers/auth-api";

/**
 * SECURITY CRITICAL — a forged profile cookie must not open protected pages.
 *
 * Before the fix, the Next Proxy read `auth-storage` (a client-writable cookie)
 * and trusted `isAuthenticated` + role from it. A visitor could run
 * `document.cookie = 'auth-storage={"state":{"isAuthenticated":true,...}}'`
 * and browse role-restricted pages. The guard now trusts only the server-signed,
 * HttpOnly `cipansor-session` cookie.
 *
 * These specs drive the real proxy through the browser.
 */
test.describe("session guard against forged cookies", () => {
  test("a forged `auth-storage` does not open a protected route", async ({ page, context }) => {
    const forged = encodeURIComponent(
      JSON.stringify({
        state: {
          isAuthenticated: true,
          user: { role: "SUPER_ADMIN", userRoles: [{ role: { code: "SUPER_ADMIN" }, isPrimary: true }] },
        },
        version: 0,
      }),
    );
    await context.addCookies([{ name: "auth-storage", value: forged, url: "http://localhost:3000" }]);

    await page.goto("/users");
    // Bounced to the staff login, not rendered.
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });

  test("a forged cookie claiming a plain authenticated user does not open the dashboard", async ({
    page,
    context,
  }) => {
    const forged = encodeURIComponent(
      JSON.stringify({ state: { isAuthenticated: true, user: { role: "TEACHER" } }, version: 0 }),
    );
    await context.addCookies([{ name: "auth-storage", value: forged, url: "http://localhost:3000" }]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });

  test("no session cookie at all redirects an anonymous visitor to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });

  test("a valid server-issued session opens the protected route", async ({ page, context }) => {
    const session = await apiLogin(SEED_USERS.teacher);
    await injectSession(page, session);

    const cookies = await context.cookies();
    const routing = cookies.find((c) => c.name === "cipansor-session");
    // The routing cookie must exist and be HttpOnly (JS cannot read it).
    expect(routing?.httpOnly).toBe(true);

    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher/, { timeout: 15000 });
    // Not bounced to the login screen.
    expect(page.url()).not.toContain("/login");
  });

  test("the routing cookie is not readable from JavaScript", async ({ page }) => {
    const session = await apiLogin(SEED_USERS.teacher);
    await injectSession(page, session);
    await page.goto("/teacher");

    const readable = await page.evaluate(() =>
      document.cookie
        .split(";")
        .map((c) => c.trim())
        .filter((c) => c.startsWith("cipansor-session=")),
    );
    expect(readable).toEqual([]);
  });

  test("a garbage session cookie is rejected", async ({ page, context }) => {
    await context.addCookies([
      { name: "cipansor-session", value: "forged.value", url: "http://localhost:3000" },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });
});
