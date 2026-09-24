import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test.describe("Marketing ROI & Boarding Command Center", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
  });

  test("should display Boarding Command Center metrics", async ({ page }) => {
    await page.goto("/musyrif/boarding-center");

    await expect(page.getByText("Boarding Command Center")).toBeVisible();
    await expect(page.getByText("All Zones Active")).toBeVisible();
    // Real seeded dormitory served by /api/dormitories
    await expect(page.getByText("Asrama Putra Al-Hikmah")).toBeVisible();
    await expect(
      page.getByText("Social Harmony Score", { exact: true }).first(),
    ).toBeVisible();
  });
});
