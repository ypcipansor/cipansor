import { test, expect } from "./fixtures/auth.fixture";
import { LoginPage } from "./page-objects";

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
    // Mock getSSOConfig response with disabled providers
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
          },
        }),
      });
    });

    const googleBtn = page.getByRole("button", { name: /Google Workspace/i });
    await googleBtn.click();

    // Verify toast or notification appears
    await expect(
      page.getByText(/Google Workspace SSO belum dikonfigurasi/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("should handle requiresTwoFactor branch during SSO callback", async ({
    page,
  }) => {
    // This is the ONLY place the SSO login endpoint is stubbed, and it is
    // unavoidable in CI: a genuine Google/Microsoft OAuth code exchange needs a
    // real external IdP plus a locally-held x509 key that matches the provider's
    // JWKS. That cannot run in an isolated e2e stack, so the ID-token
    // verification step boundary has to be mocked here. The surrounding
    // browser-to-API contract (handshake state, hash callback, redirect to the
    // two-factor prompt) is exercised for real against the login page's
    // ssoLogin client.
    //
    // The login page rejects an SSO callback that arrives without the handshake
    // state it stored when the user initiated the flow (in sessionStorage).
    // Plant it the way the Google/Microsoft button click does, so the callback
    // is accepted and the ssoLogin request fires.
    //
    // The goto deliberately adds a query string. From the beforeEach's already
    // loaded /login, a goto that only changes the hash stays in the same
    // document, so the hashchange-driven callback reads an empty hash and is
    // rejected. A query-string change forces a fresh full page load, which
    // preserves the #id_token hash and re-runs the init script that seeds the
    // provider.
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem("sso_provider", "google");
    });

    await page.route("**/api/auth/sso/login", async (route) => {
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

    await page.goto("/login?sso=1#id_token=valid_mock_token&provider=google");

    await expect(
      page.getByText(/Two-Factor Authentication/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("should build the Microsoft authorize URL with the backend tenant id", async ({
    page,
  }) => {
    // Mock getSSOConfig with an enabled Microsoft provider pinned to a
    // single tenant. The login page must target that tenant authority
    // (not the multi-tenant `common`) when it opens Microsoft 365 SSO.
    //
    // The config is fetched when the login page mounts (during the beforeEach
    // navigation), so register the route BEFORE a fresh navigation that will
    // re-fetch it — otherwise the page would read the real backend config
    // (SSO disabled in CI) and show the "not configured" toast instead of
    // redirecting.
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
            microsoftEnabled: true,
            microsoftClientId: "ms-client-id-123",
            microsoftTenantId: "00000000-0000-0000-0000-000000000000",
          },
        }),
      });
    });

    // Re-navigate so the config request is actually intercepted by the mock
    // registered above (the beforeEach load happened before it existed).
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /Microsoft 365/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Microsoft 365/i }).click();

    // The page redirects to login.microsoftonline.com/<tenant>/... and the
    // tenant segment must be the backend-enforced one.
    await page.waitForURL(
      /login\.microsoftonline\.com\/00000000-0000-0000-0000-000000000000\/oauth2\/v2\.0\/authorize/,
    );
  });
});
