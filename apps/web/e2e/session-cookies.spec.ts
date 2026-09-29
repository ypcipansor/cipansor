import { test, expect } from "@playwright/test";
import {
  apiLogin,
  injectSession,
  SEED_USERS,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  PRINCIPAL_COOKIE,
  type AuthSession,
} from "./helpers/auth-api";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

/**
 * The session is an HttpOnly cookie, and it survives the ways a real browser
 * would otherwise lose it.
 *
 * The review of the first cut found three things this suite is meant to catch,
 * none of which a unit test can:
 * - a full page load after the 15-minute access token expired bounced to
 *   /login, because the middleware only ever saw the access cookie;
 * - two tabs refreshing at once logged the second one out (the server rotates
 *   the refresh token on first use);
 * - the `?token=` upload fallback still carried a session in the URL;
 * - a refused refresh left the routing cookie behind, and the browser looped
 *   between /login and the dashboard.
 *
 * Expiry is simulated by deleting the access cookie rather than by lowering
 * `JWT_EXPIRES_IN`: that is exactly what the browser does when the cookie's
 * Max-Age passes, and it needs no env change in CI.
 */

const API_URL = process.env.API_URL || "http://localhost:3001/api";

let session: AuthSession;

test.beforeAll(async () => {
  session = await apiLogin(SEED_USERS.superAdmin);
});

test.describe("HttpOnly session cookies", () => {
  test("no token is reachable from page JavaScript", async ({ page }) => {
    await injectSession(page, session);
    await page.goto("/dashboard");

    const leaked = await page.evaluate(() => ({
      accessToken: localStorage.getItem("accessToken"),
      refreshToken: localStorage.getItem("refreshToken"),
      cookie: document.cookie,
    }));
    expect(leaked.accessToken).toBeNull();
    expect(leaked.refreshToken).toBeNull();
    // The session cookie is HttpOnly, so document.cookie cannot see it...
    expect(leaked.cookie).not.toContain(`${ACCESS_COOKIE}=`);
    expect(leaked.cookie).not.toContain("accessToken");
    // ...but the double-submit CSRF token is readable on purpose.
    expect(leaked.cookie).toContain(`${CSRF_COOKIE}=`);
  });

  test("a reload after the access token expired refreshes instead of logging out", async ({
    page,
    context,
  }) => {
    await injectSession(page, session);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/dashboard/);

    // The browser drops cipansor_at when the 15-minute Max-Age passes; the
    // refresh cookie is untouched.
    await context.clearCookies({ name: ACCESS_COOKIE });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  });

  test("two tabs refreshing at once both keep their session", async ({
    context,
  }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await injectSession(pageA, session);
    await injectSession(pageB, session);
    await pageA.goto("/dashboard");
    await pageB.goto("/dashboard");

    // Both tabs now hold an expired access cookie and the same rotation-prone
    // refresh cookie. Without serialization, the second refresh presents a
    // token the first already deleted and is logged out.
    await context.clearCookies({ name: ACCESS_COOKIE });

    await Promise.all([
      pageA.reload({ waitUntil: "domcontentloaded" }),
      pageB.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await expect(pageA).toHaveURL(/dashboard/, { timeout: 15000 });
    await expect(pageB).toHaveURL(/dashboard/, { timeout: 15000 });

    await pageA.close();
    await pageB.close();
  });

  test("a session the server refuses ends on the sign-in form, not in a redirect loop", async ({
    page,
    context,
  }) => {
    await injectSession(page, session);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/dashboard/);

    // The refresh token was revoked elsewhere (signed out everywhere, a
    // password reset) and the access cookie has expired; the routing cookie is
    // still in the jar. While it is, the middleware sends /login back to the
    // dashboard, so the refused refresh has to take it away.
    const refresh = (await context.cookies()).find(
      (c) => c.name === REFRESH_COOKIE,
    )!;
    await context.clearCookies({ name: ACCESS_COOKIE });
    await context.addCookies([{ ...refresh, value: "revoked-elsewhere" }]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();

    const names = (await context.cookies()).map((c) => c.name);
    expect(names).not.toContain(PRINCIPAL_COOKIE);
    expect(names).not.toContain(REFRESH_COOKIE);

    // And it stays there: no bounce back to the dashboard.
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
  });

  test("logout clears every session cookie", async ({ page, context }) => {
    await injectSession(page, session);
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "User menu" }).click();
    await page.getByRole("menuitem", { name: /logout|keluar/i }).click();
    await expect(page).toHaveURL(/login/, { timeout: 10000 });

    const names = (await context.cookies()).map((c) => c.name);
    expect(names).not.toContain(ACCESS_COOKIE);
    expect(names).not.toContain(REFRESH_COOKIE);
    expect(names).not.toContain(CSRF_COOKIE);
    expect(names).not.toContain(PRINCIPAL_COOKIE);
  });

  test("an upload loads with the session cookie and no ?token= in the URL", async ({
    page,
  }) => {
    await injectSession(page, session);
    await page.goto("/dashboard");

    const upload = await page.evaluate(
      async ({ apiUrl, csrf }) => {
        // A minimal 1x1 PNG, so the magic-byte check passes.
        const bytes = Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          ),
          (c) => c.charCodeAt(0),
        );
        const form = new FormData();
        form.append(
          "file",
          new Blob([bytes], { type: "image/png" }),
          "dot.png",
        );

        const up = await fetch(`${apiUrl}/upload`, {
          method: "POST",
          body: form,
          credentials: "include",
          headers: { "x-csrf-token": csrf },
        });
        if (!up.ok) return { ok: false, reason: `upload → ${up.status}` };
        const body = await up.json();
        const url: string = body?.data?.url ?? "";
        if (!url) return { ok: false, reason: "no url in upload response" };
        if (url.includes("token="))
          return { ok: false, reason: "token in url" };
        return { ok: true, url };
      },
      { apiUrl: API_URL, csrf: session.csrfToken },
    );
    expect(upload.ok, upload.reason).toBe(true);

    // A browser-native navigation (what <img>/<a> do) carries the HttpOnly
    // session cookie and no token. In production the web host serves /uploads
    // same-origin, so an <img> works identically; the e2e stack splits the
    // hosts (web :3000, API :3001) and helmet's
    // `Cross-Origin-Resource-Policy: same-origin` blocks an embedded image
    // across them, so a navigation is the faithful in-browser proof here.
    const authed = await page.goto(upload.url!);
    expect(authed?.status()).toBe(200);

    // Without the session it is refused — this is not an anonymous directory.
    const anonContext = await page.context().browser()!.newContext();
    const anonPage = await anonContext.newPage();
    const anonymous = await anonPage.goto(upload.url!);
    expect(anonymous?.status()).toBe(401);
    await anonContext.close();
  });
});

/**
 * The routing cookie's bucket comes from the API, from the token it just
 * minted. Komite and alumni role codes have no bucket of their own on purpose;
 * the web used to fall back to the user's legacy `role` column, and the API now
 * does the same. Without it their cookie carried the raw role code, which the
 * middleware refuses, and they could not open a single page. Signed in through
 * the form so the cookie is the API's, not the e2e helper's.
 */
test.describe("roles with no bucket of their own", () => {
  for (const [email, landing] of [
    ["smpit.komite@cipansor.or.id", /\/reports/],
    ["smpit.alumni@cipansor.or.id", /\/alumni/],
  ] as const) {
    test(`${email} signs in through the form and reaches their own page`, async ({
      page,
      context,
    }) => {
      const account = DEMO_ACCOUNTS.find((a) => a.email === email)!;
      await page.goto("/login");
      await page.locator("#email").fill(account.email);
      await page.locator("#password").fill(account.password);
      await page.getByRole("button", { name: "Masuk", exact: true }).click();

      await expect(page).toHaveURL(landing, { timeout: 20000 });
      const principal = (await context.cookies()).find(
        (c) => c.name === PRINCIPAL_COOKIE,
      );
      expect(JSON.parse(decodeURIComponent(principal!.value)).role).toMatch(
        /^(STAFF|STUDENT)$/,
      );
    });
  }
});
