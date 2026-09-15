import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";
import { findStrategicPlan } from "./helpers/seed-data";

test.describe("GRC Integrated Flow", () => {
  test("should show AI Audit Advisor suggestions on GRC Dashboard", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/grc-dashboard");

    // The AI Audit Advisor card renders from the real /api/analytics/grc data
    await expect(page.locator("text=AI Audit Advisor")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("text=Smart suggestions based on Risk module")).toBeVisible();
  });

  test("should display Financial Realization on Planning detail page", async ({ page }) => {
    const session = await loginAs(page, "superAdmin");
    const plan = await findStrategicPlan(session);

    await page.goto(`/perencanaan/${plan.id}`);
    await expect(page.locator("h1")).toContainText(plan.title);

    // Financial realization summary computed from real journal data. Assert the
    // FIGURE, not the label: this pinned the English gloss "(Financial
    // Realization)" that the Indonesian-copy pass had to delete, so it failed
    // on a change that made the page better rather than worse.
    const realisasi = page
      .locator("div", { has: page.getByText("Realisasi Anggaran", { exact: false }) })
      .last();
    await expect(realisasi.getByText(/%$/).first()).toBeVisible({ timeout: 20000 });

    // Activity-level realization under the Program & Kegiatan tab
    await page.click('button:has-text("Program & Kegiatan")');
    await expect(page.locator("text=Daftar Program & Kegiatan")).toBeVisible();
    await expect(page.getByText(/Realisasi:/).first()).toBeVisible();
  });
});
