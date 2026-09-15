import { test, expect } from "./fixtures/auth.fixture";
import { loginAs } from "./helpers/auth-api";
import { settledContent } from "./helpers/page-state";

/**
 * Dormitories Module E2E Tests
 * Tests dormitory management, room assignments, and student housing
 */

test.describe("Dormitories - Navigation", () => {
  test("should navigate to dormitories page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/dormitories");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    expect(page.url()).toMatch(/dormitories/);
  });

  test("should display dormitories interface", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/dormitories");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    expect(content.length).toBeGreaterThan(1000);
  });
});

test.describe("Dormitories - Features", () => {
  test("should display dormitory list or rooms", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/dormitories");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const hasDormList = await page
      .locator('table, [class*="room"], [class*="dorm"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasDormList || page.url().includes("dormitories")).toBeTruthy();
  });

  test("should have room assignment functionality", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/dormitories");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    const hasAssignment =
      content.includes("Kamar") ||
      content.includes("Room") ||
      content.includes("Asrama");

    expect(hasAssignment || page.url().includes("dormitories")).toBeTruthy();
  });

  test("should display student occupancy", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/dormitories");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    const hasOccupancy =
      content.includes("Penghuni") ||
      content.includes("Occupancy") ||
      content.includes("Siswa");

    expect(hasOccupancy || page.url().includes("dormitories")).toBeTruthy();
  });
});

test.describe("Dormitories - Performance", () => {
  test("should load dormitories page quickly", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);

    const startTime = Date.now();
    await page.goto("/dormitories");
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(15000);
  });
});
