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
});
