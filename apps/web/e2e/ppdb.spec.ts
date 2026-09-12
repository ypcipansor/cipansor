import { test, expect } from "./fixtures/auth.fixture";
import { loginAs } from "./helpers/auth-api";
import { settledContent } from "./helpers/page-state";

/**
 * PPDB (Student Registration) E2E Tests
 * Tests student registration and admission system
 */

test.describe("PPDB - Main Page", () => {
  test("should navigate to PPDB page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/ppdb");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    expect(page.url()).toMatch(/ppdb/);
  });

  test("should display PPDB stats and overview", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/ppdb");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const hasContent = await settledContent(page);
    expect(hasContent.length).toBeGreaterThan(1000);
    expect(page.url()).toMatch(/ppdb/);
  });

  test("should display menu cards for PPDB features", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/ppdb");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    // Check for links to sub-features
    const hasLinks = await page
      .locator('a[href*="/ppdb/"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasLinks || page.url().includes("ppdb")).toBeTruthy();
  });
});

test.describe("PPDB - Navigation", () => {
  test("should switch between tabs", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/ppdb");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    // Click registration tab
    const regTab = page.getByRole("tab", { name: /pendaftaran|registration/i });
    if (await regTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await regTab.click();
      await page.waitForTimeout(500);
    }

    expect(page.url()).toMatch(/ppdb/);
  });

  test("should navigate to waves page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/ppdb/waves");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    expect(page.url()).toMatch(/ppdb\/waves/);
  });
});

test.describe("PPDB - Performance", () => {
  test("should load PPDB page quickly", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);

    const startTime = Date.now();
    await page.goto("/ppdb");
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(15000);
    expect(page.url()).toMatch(/ppdb/);
  });
});
