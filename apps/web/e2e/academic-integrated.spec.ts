import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test.describe("Academic Integrated Flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
  });

  test("should display Tahfidz Progress Chart on Takhosus Dashboard", async ({ page }) => {
    await page.goto("/takhosus", { waitUntil: "domcontentloaded" });

    // Ensure we are not redirected to login
    await expect(page).not.toHaveURL(/.*login.*/, { timeout: 15000 });

    const heading = page.getByRole("heading", { name: "Program Takhosus" });
    await expect(heading).toBeVisible({ timeout: 30000 });

    // The tahfidz progress chart card renders from real analytics data —
    // either the chart itself or its explicit empty state, never an error.
    const chartTitle = page.getByText("Kurva Capaian Tahfidz");
    await expect(chartTitle).toBeVisible({ timeout: 45000 });

    const chartOrEmpty = page
      .locator(".recharts-responsive-container")
      .or(page.getByText("Belum ada data progres hafalan."));
    await expect(chartOrEmpty.first()).toBeVisible();
  });

  test("should display Succession Planning recommendations", async ({ page }) => {
    // Was /hr/talenta's "Succession Planning" tab. That page and
    // /hr/talenta/succession were merged into /talenta/succession, which now
    // carries the search, the org-chart jabatan picker, and the statement of
    // how the score is computed — no tab to click first.
    await page.goto("/talenta/succession");

    // Assert the control the test is actually about, not a card title. It used
    // to assert "AI-Driven Succession Recommendations", a string #410 removed
    // on purpose because a weighted sum is not AI.
    await expect(page.locator('input[placeholder*="Masukkan nama jabatan"]')).toBeVisible();

    // Search for a position against the real suggestion engine. The query is
    // debounced and fires on its own once the text is longer than 2 chars.
    await page.fill('input[placeholder*="Masukkan nama jabatan"]', "Kepala Sekolah");

    // The real API answers with either candidate recommendations (seeded
    // talent profiles) or the explicit no-candidates state.
    await expect(
      page
        .getByText("Kandidat Suksesi: Kepala Sekolah")
        .or(page.getByText("Tidak ada kandidat potensial yang ditemukan untuk posisi ini."))
        .first(),
    ).toBeVisible({ timeout: 20000 });
  });
});
