import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test.describe("Business Unit & Integrated Flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
  });

  test("should manage business units and show in canteen", async ({ page }) => {
    // 1. Visit Business Unit management — seeded units come from the real API
    await page.goto("/unit-usaha", { waitUntil: "domcontentloaded" });
    const heading = page.locator('h1:has-text("Unit Usaha")');
    await expect(heading).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Koperasi & Kantin Pesantren").first()).toBeVisible({
      timeout: 15000,
    });

    // 2. Visit Canteen POS
    await page.goto("/canteen", { waitUntil: "domcontentloaded" });
    await expect(page.locator('h1:has-text("Kantin")')).toBeVisible({ timeout: 15000 });
  });

  test("should show Strategy Map in Perencanaan", async ({ page }) => {
    await page.goto("/perencanaan/strategy-map", { waitUntil: "domcontentloaded" });
    await expect(page.locator('h1:has-text("Peta Strategi")')).toBeVisible({ timeout: 15000 });
  });

  test("should show Executive Dashboard with consolidated data", async ({ page }) => {
    await page.goto("/foundation/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator('h1:has-text("Executive Dashboard")')).toBeVisible({
      timeout: 15000,
    });
  });
});
