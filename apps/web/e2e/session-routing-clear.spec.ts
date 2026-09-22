import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiLogin, serverSessionCookies, SEED_USERS } from "./helpers/auth-api";

/**
 * Findings A / C — the `HttpOnly` routing cookie must be cleared SERVER-side on
 * every path that ends a session, so the Next Proxy cannot keep routing a
 * signed-out / rejected visitor into a protected page (the redirect loop).
 *
 * These specs deliberately do NOT use `injectSession`: its `addInitScript`
 * re-seeds the bearer on every navigation, which would mask exactly the state
 * under test. They seed the browser once, then observe what the app does.
 */

/** Seed localStorage + the server-signed routing cookie exactly once. */
async function seedOnce(page: Page, accessToken: string, refreshToken: string) {
  const cookies = await serverSessionCookies(accessToken);
  await page.context().addCookies(
    cookies.map(({ name, value }) => ({
      name,
      value,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
  await page.addInitScript(
    ([token, refresh]) => {
      // Only seed when absent, so a test can clear storage and have it stay
      // cleared across navigations.
      if (
        !localStorage.getItem("accessToken") &&
        !sessionStorage.getItem("seeded")
      ) {
        localStorage.setItem("accessToken", token as string);
        localStorage.setItem("refreshToken", refresh as string);
      }
      sessionStorage.setItem("seeded", "1");
    },
    [accessToken, refreshToken] as const,
  );
}

async function routingCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "cipansor-session")?.value ?? null;
}

test.describe("routing session clearing (findings A / C)", () => {
  test("logout clears the HttpOnly routing cookie so /login sticks", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.teacher);
    await seedOnce(page, session.accessToken, session.refreshToken);

    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher/, { timeout: 15000 });
    expect(await routingCookie(page)).not.toBeNull();

    // Drive the REAL sign-out through the app shell, so the store's
    // `DELETE /api/session` runs — not a hand-rolled fetch.
    await page
      .getByRole("button", { name: /logout|keluar/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await expect.poll(() => routingCookie(page), { timeout: 15000 }).toBeNull();

    // The routing cookie is gone AND the bearer is gone: a protected page must
    // bounce to /login and STAY (a surviving cookie would bounce it back).
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await page.waitForTimeout(1500);
    expect(page.url()).toContain("/login");
  });

  test("a definitive refresh failure clears the routing session and lands on /login", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.teacher);
    await seedOnce(page, session.accessToken, session.refreshToken);
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher/, { timeout: 15000 });
    expect(await routingCookie(page)).not.toBeNull();

    // Keep the routing cookie, but make every bearer refresh DEFINITIVELY fail:
    // a rejected access token plus a refresh token the API 401s. The axios
    // interceptor then takes the definitive branch (clear the server-side
    // cookie + local tokens + redirect) — finding A's fix.
    await page.evaluate(() => {
      localStorage.setItem("accessToken", "expired-access");
      localStorage.setItem("refreshToken", "definitely-not-a-valid-refresh");
      sessionStorage.setItem("seeded", "1");
    });

    // A protected navigation fires authenticated API calls → 401 → refresh →
    // 401 → definitive cleanup. `window.location.href = "/login"` is a full
    // navigation, so the URL settles there.
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/login/, { timeout: 20000 });

    await expect.poll(() => routingCookie(page), { timeout: 15000 }).toBeNull();
    expect(
      await page.evaluate(() => localStorage.getItem("accessToken")),
    ).toBeNull();

    // No redirect loop: anonymous navigation settles on /login.
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await page.waitForTimeout(1500);
    expect(page.url()).toContain("/login");
  });

  test("a routing cookie cannot fetch data once the bearer is gone (routing ≠ authorization)", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.teacher);
    await seedOnce(page, session.accessToken, session.refreshToken);
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher/, { timeout: 15000 });

    // Drop the bearer but keep the signed routing cookie (the residual-risk
    // scenario finding C documents).
    await page.evaluate(() => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      sessionStorage.setItem("seeded", "1");
    });
    expect(await routingCookie(page)).not.toBeNull();

    // The routing cookie alone must not authorize a single API row.
    const status = await page.evaluate(async () => {
      const res = await fetch("http://localhost:3001/api/students?limit=1");
      return res.status;
    });
    expect(status).toBe(401);
  });
});
