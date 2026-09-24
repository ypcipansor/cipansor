import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test.describe("GRC Dashboard Live Data", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
  });

  test("should display aggregated GRC metrics correctly", async ({ page }) => {
    await page.goto("/grc-dashboard");

    // Cards aggregate real seeded data — counts are data-dependent, so assert
    // the rendered metric formats instead of fixed values.
    await expect(page.getByText(/\d+ Active/).first()).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByText(/Average Progress: [\d.]+%/).first(),
    ).toBeVisible();
    await expect(page.getByText(/\d+ Risks/).first()).toBeVisible();
    await expect(page.getByText(/\d+ Findings/).first()).toBeVisible();
    await expect(page.getByText(/\d+ Unresolved/).first()).toBeVisible();
    await expect(page.getByText(/\d+% Compliant/).first()).toBeVisible();

    // The 5x5 risk heatmaps render from the real risk-matrix endpoint
    await expect(page.getByText("Peta Risiko Inheren (5×5)")).toBeVisible();
    await expect(page.getByText("Peta Risiko Residual (5×5)")).toBeVisible();
  });

  test("should show loading state and handle errors", async ({ page }) => {
    // Deliberate failure injection: this test exercises the FE error state,
    // so the 500 on the GRC endpoint is the point (auth stays real).
    await page.route("**/api/analytics/grc*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "Internal Server Error",
        }),
      });
    });

    await page.goto("/grc-dashboard");

    // Check for error message
    await expect(page.locator("text=Gagal memuat data GRC")).toBeVisible();
  });
});
