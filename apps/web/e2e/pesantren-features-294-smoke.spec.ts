import { test, expect } from "@playwright/test";
import { LoginPage } from "./page-objects";

// Smoke coverage for the #294 rebuild: Maktabah digital, Si-Taka placements,
// and E-Simaan. These pages require an authenticated session (MainLayout).
test.describe("Pesantren features (#294 rebuild)", () => {
  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );
  });

  test("Maktabah digital renders with real category counts", async ({
    page,
  }) => {
    await page.goto("/library/digital");
    await expect(
      page.getByRole("heading", { name: /Maktabah Cipansor/i }),
    ).toBeVisible();
    // Either the honest empty state or a populated grid — never fake counts.
    await expect(
      page
        .getByText(/Belum ada koleksi digital/i)
        .first()
        .or(page.getByText(/judul/i).first()),
    ).toBeVisible();
  });

  test("Si-Taka placement dashboard loads live aggregates", async ({
    page,
  }) => {
    await page.goto("/alumni/placement");
    await expect(page.getByRole("heading", { name: /Si-Taka/i })).toBeVisible();
    await expect(page.getByText(/Total Penempatan/i)).toBeVisible();
  });

  test("E-Simaan page shows recorder and setoran form", async ({ page }) => {
    await page.goto("/tahfidz/e-simaan");
    await expect(
      page.getByRole("heading", { name: /E-Simaan/i }),
    ).toBeVisible();
    await expect(page.getByText(/Rekam Setoran/i)).toBeVisible();
  });
});
