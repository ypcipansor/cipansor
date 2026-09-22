import { test, expect } from "./fixtures/auth.fixture";

/**
 * Session token storage (SECURITY WARNING — finding F).
 *
 * A real password login must NOT leave the bearer token in any place a script
 * (or an XSS bug) can read it off the document cookie jar. The app used to
 * mirror `accessToken` into `document.cookie` without `HttpOnly`/`Secure`; this
 * spec drives the real login and asserts the credential is gone.
 *
 * The full HttpOnly-cookie session (server-issued `Set-Cookie`) is the residual
 * risk documented in `src/lib/session-cookie.ts`; what is testable today is that
 * the app no longer CREATES the exposed copy, and clears a legacy one.
 */
test.describe("session token storage (finding F)", () => {
  test("a real login does not write the bearer into a JS-readable cookie", async ({
    page,
  }) => {
    // A teacher, not an admin: admins sit behind the 2FA gate, and this test is
    // about the cookie the login path writes, not the second factor.
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("fatimah@cipansor.or.id");
    await page.getByLabel(/password/i).fill("Teacher123!");
    await page.getByRole("button", { name: /masuk|login|sign in/i }).click();

    // A teacher lands on their own dashboard (/teacher), not /dashboard.
    await expect(page).toHaveURL(/\/(dashboard|teacher)/, { timeout: 25000 });

    // The session exists (localStorage bearer), so this is a real logged-in
    // state — not a login that silently failed.
    expect(
      await page.evaluate(() => localStorage.getItem("accessToken")),
    ).toBeTruthy();

    // And the exposed cookie copy must not exist.
    const tokenCookie = await page.evaluate(() =>
      document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("accessToken=")),
    );
    expect(tokenCookie).toBeUndefined();
  });

  test("stale exposed cookie is cleared at bootstrap", async ({
    page,
    context,
  }) => {
    // Simulate a visitor arriving from an older build that mirrored the bearer.
    await context.addCookies([
      {
        name: "accessToken",
        value: "legacy-exposed-token",
        url: "http://localhost:3000",
      },
    ]);
    expect(
      (await context.cookies()).some((c) => c.name === "accessToken"),
    ).toBe(true);

    await page.goto("/");

    // The clear runs from a client effect after hydration, so poll rather than
    // reading the jar at `domcontentloaded` (which can precede hydration).
    await expect
      .poll(
        async () =>
          (await context.cookies()).find((c) => c.name === "accessToken")
            ?.value ?? null,
        { timeout: 15000 },
      )
      .toBeNull();
  });
});
