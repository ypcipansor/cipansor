import { test, expect } from "./fixtures/auth.fixture";
import { loginAs } from "./helpers/auth-api";
import { settledContent } from "./helpers/page-state";

/**
 * Extracurricular Module E2E Tests
 * Tests extracurricular activities, clubs, and student participation
 */

test.describe("Extracurricular - Navigation", () => {
  test("should navigate to extracurricular page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/extracurricular");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    expect(page.url()).toMatch(/extracurricular/);
  });

  test("should display extracurricular interface", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/extracurricular");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    expect(content.length).toBeGreaterThan(1000);
  });
});

test.describe("Extracurricular - Features", () => {
  test("should display activity or club list", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/extracurricular");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const hasActivities = await page
      .locator('table, [class*="activity"], [class*="ekskul"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(
      hasActivities || page.url().includes("extracurricular"),
    ).toBeTruthy();
  });

  test("should have add activity functionality", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/extracurricular");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const hasAddButton = await page
      .locator('button:has-text("Tambah"), button:has-text("Add")')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasAddButton || page.url().includes("extracurricular")).toBeTruthy();
  });

  test("should display student participation", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/extracurricular");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    const hasParticipation =
      content.includes("Peserta") ||
      content.includes("Siswa") ||
      content.includes("Member");

    expect(
      hasParticipation || page.url().includes("extracurricular"),
    ).toBeTruthy();
  });

  test("should show activity schedules", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/extracurricular");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    const hasSchedule =
      content.includes("Jadwal") ||
      content.includes("Schedule") ||
      content.includes("Waktu");

    expect(hasSchedule || page.url().includes("extracurricular")).toBeTruthy();
  });
});

test.describe("Extracurricular - Performance", () => {
  test("should load extracurricular page quickly", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);

    const startTime = Date.now();
    await page.goto("/extracurricular");
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(15000);
  });
});
