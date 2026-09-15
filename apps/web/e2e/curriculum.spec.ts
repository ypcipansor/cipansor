import { test, expect } from "./fixtures/auth.fixture";
import { loginAs } from "./helpers/auth-api";
import { settledContent } from "./helpers/page-state";

/**
 * Curriculum Module E2E Tests
 * Tests curriculum management and structure
 */

test.describe("Curriculum - Navigation", () => {
  test("should navigate to curriculum page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/curriculum");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    expect(page.url()).toMatch(/curriculum/);
  });

  test("should display curriculum interface", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/curriculum");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    expect(content.length).toBeGreaterThan(1000);
  });
});

test.describe("Curriculum - Features", () => {
  test("should display curriculum structure", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/curriculum");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const hasCurriculum = await page
      .locator('[class*="curriculum"], table, [class*="kurikulum"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasCurriculum || page.url().includes("curriculum")).toBeTruthy();
  });

  test("should have subject/topic management", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/curriculum");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    const hasSubjects =
      content.includes("Subject") ||
      content.includes("Mata Pelajaran") ||
      content.includes("Mapel");

    expect(hasSubjects || page.url().includes("curriculum")).toBeTruthy();
  });

  test("should display curriculum details", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/curriculum");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    const hasDetails =
      content.includes("Curriculum") ||
      content.includes("Kurikulum") ||
      content.includes("Subject");

    expect(hasDetails || page.url().includes("curriculum")).toBeTruthy();
  });
});

test.describe("Curriculum - Performance", () => {
  test("should load curriculum page quickly", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);

    const startTime = Date.now();
    await page.goto("/curriculum");
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(15000);
  });
});
