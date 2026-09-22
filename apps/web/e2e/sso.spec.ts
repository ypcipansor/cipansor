import { test, expect } from "./fixtures/auth.fixture";
import { LoginPage } from "./page-objects";

/**
 * SSO e2e coverage.
 *
 * Both providers now delegate the redirect handshake to their own SDK (Google
 * Identity Services, MSAL), so these specs no longer assert a page-issued
 * `window.location` navigation or a `#id_token` fragment — neither exists any
 * more. A genuine sign-in still needs a real IdP (and, for privileged roles, a
 * TOTP secret), which cannot run in an isolated e2e stack. The IdP *script* is
 * therefore stubbed at the network boundary — exactly the seam the old spec
 * mocked — while everything of ours runs for real: the config fetch, the SDK
 * loader, `initialize()`/`loginPopup()` wiring, the `POST /auth/sso/login`
 * call, and the two-factor branch.
 */

/** Serve a minimal Google Identity Services stub that completes immediately. */
async function stubGoogleIdentityServices(
  page: import("@playwright/test").Page,
  credential: string,
) {
  await page.route("https://accounts.google.com/gsi/client", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.google = {
          accounts: {
            id: {
              initialize: function (config) { window.__gisCallback = config.callback; },
              prompt: function () { window.__gisCallback({ credential: ${JSON.stringify(credential)} }); }
            }
          }
        };
      `,
    });
  });
}

async function stubSsoConfig(
  page: import("@playwright/test").Page,
  config: Record<string, unknown>,
) {
  await page.route("**/api/auth/sso/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          domain: "cipansor.or.id",
          googleEnabled: false,
          googleClientId: null,
          microsoftEnabled: false,
          microsoftClientId: null,
          microsoftTenantId: "common",
          ...config,
        },
      }),
    });
  });
}

test.describe("Single Sign-On (SSO) Buttons", () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test("should display Google Workspace and Microsoft 365 SSO buttons", async ({
    page,
  }) => {
    // No route mock here: the button rendering is driven by the real
    // /api/auth/sso/config payload the login page fetches from the backend.
    // This is genuine browser-to-API integration coverage for the config path.
    const googleBtn = page.getByRole("button", { name: /Google Workspace/i });
    const microsoftBtn = page.getByRole("button", { name: /Microsoft 365/i });

    await expect(googleBtn).toBeVisible();
    await expect(microsoftBtn).toBeVisible();
  });

  test("should show configuration toast when SSO provider is disabled", async ({
    page,
  }) => {
    await stubSsoConfig(page, {
      googleEnabled: false,
      googleClientId: null,
      microsoftEnabled: false,
      microsoftClientId: null,
    });

    // Re-navigate so the config request is intercepted by the mock registered
    // above (the beforeEach load happened before it existed).
    await page.goto("/login");
    const googleBtn = page.getByRole("button", { name: /Google Workspace/i });
    await googleBtn.click();

    await expect(
      page.getByText(/Google Workspace SSO belum dikonfigurasi/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("should sign in with Google and reach the two-factor prompt", async ({
    page,
  }) => {
    // The GIS script hands our loader a credential; the backend call is stubbed
    // to answer "2FA required", which is the branch the page must render.
    await stubSsoConfig(page, {
      googleEnabled: true,
      googleClientId: "google-client-id",
    });
    await stubGoogleIdentityServices(page, "google-id-token-2fa");

    await page.route("**/api/auth/sso/login", async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toEqual({
        provider: "google",
        idToken: "google-id-token-2fa",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            requiresTwoFactor: true,
            tempToken: "temp_2fa_sso_token_123",
          },
        }),
      });
    });

    await page.goto("/login");
    await page.getByRole("button", { name: /Google Workspace/i }).click();

    await expect(
      page.getByText(/Two-Factor Authentication/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("should surface a Google sign-in failure without leaving the page", async ({
    page,
  }) => {
    await stubSsoConfig(page, {
      googleEnabled: true,
      googleClientId: "google-client-id",
    });

    // The SDK script itself fails to load — the loader must reject and the page
    // must report it, not sit silently on a dead button.
    await page.route(
      "https://accounts.google.com/gsi/client",
      async (route) => {
        await route.abort();
      },
    );

    await page.goto("/login");
    await page.getByRole("button", { name: /Google Workspace/i }).click();

    await expect(
      page.getByText(/Gagal masuk dengan Google Workspace/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("the One Tap fallback button stays usable while idle (BUG 3)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // Fake the page clock so idle time passes in an instant. The old
    // implementation armed a 120s timer when the button was RENDERED; on the
    // failed button that timer removed it. Advancing past two minutes must leave
    // the fallback button present and clickable.
    await page.clock.install();

    // A GIS stub whose `prompt()` reports the One Tap prompt as suppressed
    // (`isNotDisplayedMoment()`), which is what makes the login page render the
    // explicit fallback button. `renderButton` injects a real, clickable node.
    await stubSsoConfig(page, {
      googleEnabled: true,
      googleClientId: "google-client-id",
    });
    await page.route(
      "https://accounts.google.com/gsi/client",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: `
            window.google = {
              accounts: {
                id: {
                  initialize: function (config) { window.__gisCallback = config.callback; },
                  prompt: function (listener) {
                    window.__gisMoment = listener;
                    listener({ isNotDisplayedMoment: function () { return true; } });
                  },
                  renderButton: function (parent) {
                    var b = document.createElement("button");
                    b.type = "button";
                    b.textContent = "Masuk dengan Google";
                    b.onclick = function () {
                      window.__gisCallback({ credential: "fallback-id-token" });
                    };
                    parent.appendChild(b);
                  }
                }
              }
            };
          `,
        });
      },
    );

    await page.goto("/login");
    await page.getByRole("button", { name: /Google Workspace/i }).click();

    const fallback = page.getByTestId("google-sso-fallback");
    await expect(fallback).toBeVisible({ timeout: 10000 });
    const button = fallback.getByRole("button", { name: /Masuk dengan Google/i });
    await expect(button).toBeVisible();

    // A real sign-in after the idle period: the stub's credential callback runs
    // the page's own handler, which posts to the SSO endpoint. Answering "2FA
    // required" makes the resulting navigation observable and deterministic.
    await page.route("**/api/auth/sso/login", async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toEqual({
        provider: "google",
        idToken: "fallback-id-token",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            requiresTwoFactor: true,
            tempToken: "temp_2fa_idle_token",
          },
        }),
      });
    });

    // Simulate a user who opens the login page, is called away, and comes back.
    // 150s of idle time is well past the old two-minute RENDER timer; the
    // no-timeout implementation must leave the button intact and clickable.
    await page.clock.fastForward("02:30");
    await expect(button).toBeVisible();
    await button.click();

    await expect(
      page.getByText(/Two-Factor Authentication/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("should start the Microsoft flow with the configured client id", async ({
    page,
  }) => {
    // MSAL issues the navigation inside a popup, so there is no page redirect
    // left to assert. Block the popup at the browser boundary: MSAL then fails
    // fast and deterministically, which proves `loginWithMicrosoft` was reached
    // with the configured client id (an unconfigured provider would instead
    // show the "belum dikonfigurasi" toast and never call the SDK).
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await stubSsoConfig(page, {
      microsoftEnabled: true,
      microsoftClientId: "ms-client-id-123",
      microsoftTenantId: "00000000-0000-0000-0000-000000000000",
    });

    await page.goto("/login");
    const microsoftBtn = page.getByRole("button", { name: /Microsoft 365/i });
    await expect(microsoftBtn).toBeVisible();
    await microsoftBtn.click();

    await expect(
      page.getByText(/Gagal masuk dengan Microsoft 365/i),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText(/Microsoft 365 SSO belum dikonfigurasi/i),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
  });

  test("a real browser sign-in call reaches the API and fails without leaking verifier detail", async ({
    page,
  }) => {
    // No /api/auth/sso/login mock: the credential from the stubbed GIS script
    // is posted to the running API for real. The token is not a genuine Google
    // ID token, so the API must reject it with the stable client message —
    // proving the browser→API contract, and that the verifier's own message
    // (BUG 13) never reaches the client.
    await stubSsoConfig(page, {
      googleEnabled: true,
      googleClientId: "google-client-id",
    });
    await stubGoogleIdentityServices(page, "e2e-not-a-valid-google-id-token");

    await page.goto("/login");
    const ssoResponse = page.waitForResponse((response) =>
      response.url().includes("/api/auth/sso/login"),
    );
    await page.getByRole("button", { name: /Google Workspace/i }).click();

    const response = await ssoResponse;
    expect(response.status()).toBe(401);
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Verifikasi token SSO gagal");
    // The raw verifier reason (signature/audience/tenant) must not leak.
    expect(JSON.stringify(body)).not.toMatch(
      /signature|audience|issuer|tenant|jwt|token verification/i,
    );

    // The store renders the API's message inline above the form.
    await expect(
      page.getByText("Verifikasi token SSO gagal", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
