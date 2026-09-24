import { test, expect } from "./fixtures/auth.fixture";
import { loginAs } from "./helpers/auth-api";

test.describe("GRC Integration Flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
  });

  test("should load the Executive GRC Dashboard", async ({ page }) => {
    await page.goto("/grc-dashboard");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    // Check main headers
    await expect(page.locator("text='Executive GRC Dashboard'")).toBeVisible();

    // Check key metrics are present
    await expect(page.locator("text='Strategic Plans'")).toBeVisible();
    await expect(page.locator("text='Critical Risks'")).toBeVisible();
    await expect(page.locator("text='Audit Findings'")).toBeVisible();
    await expect(
      page.locator("text='Sharia Compliance'").first(),
    ).toBeVisible();

    // Check chart presence
    await expect(page.locator("text='GRC Performance Overview'")).toBeVisible();
    await expect(
      page.locator("text='Risk Profile Distribution'"),
    ).toBeVisible();
  });

  test("should display Risk Factors and Audit Trails in Strategic Plan Detail", async ({
    page,
  }) => {
    // Mock the API response to render the page content properly without depending on real DB seeding
    await page.route("**/api/perencanaan/*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: {
            success: true,
            data: {
              id: "123e4567-e89b-12d3-a456-426614174000",
              title: "Strategic Plan E2E Test",
              type: "RENSTRA",
              status: "ACTIVE",
              description: "Testing GRC integration tabs",
              progress: 50,
              budget: 10000000,
              startDate: "2025-01-01",
              endDate: "2025-12-31",
              objectives: [],
              risks: [{ id: "risk-1", riskLevel: "HIGH", status: "OPEN" }],
              internalAudits: [{ id: "audit-1", status: "IN_PROGRESS" }],
            },
          },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/perencanaan/123e4567-e89b-12d3-a456-426614174000");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    // Verify the mock data rendered and page loaded
    await expect(page.locator("text='Strategic Plan E2E Test'")).toBeVisible({
      timeout: 15000,
    });

    // Click Risk Factors tab and verify contents
    await page.click("text='Faktor Risiko'");
    await expect(
      page.locator("text='Identifikasi & Pemetaan Risiko'"),
    ).toBeVisible();
    await expect(page.locator("text='HIGH'")).toBeVisible();

    // Click Audit Trails tab and verify contents
    await page.click("text='Jejak Audit & Temuan'");
    await expect(
      page.locator("text='Rekam Jejak Audit Internal'"),
    ).toBeVisible();
    await expect(page.locator("text='IN_PROGRESS'")).toBeVisible();
  });
});
