import { test, expect } from "@playwright/test";
import { LoginPage } from "./page-objects";

test.describe("Alumni Outcome & Tracer Study", () => {
  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );
  });

  test("should display tracer study and outcome analysis tabs", async ({
    page,
  }) => {
    await page.goto("/alumni");

    // Tracer dashboard + outcome analysis are available as tabs.
    await expect(
      page.getByRole("tab", { name: "Dashboard Tracer" }),
    ).toBeVisible();
    const outcomeTab = page.getByRole("tab", { name: "Analisis Outcome" });
    await expect(outcomeTab).toBeVisible();

    // The outcome tab surfaces the outcome correlation analysis.
    await outcomeTab.click();
    await expect(page.getByText("Outcome Correlation Analysis")).toBeVisible();
  });

  test("should show career and education in alumni profile", async ({
    page,
  }) => {
    await page.goto("/alumni");

    // The default "Data Alumni" tab lists alumni; open the first one's detail.
    const firstDetail = page
      .locator("table tbody tr")
      .first()
      .getByRole("link", { name: /detail/i });
    await expect(firstDetail).toBeVisible({ timeout: 20000 });
    await firstDetail.click();

    // Detail page exposes the Biodata / Karir & Pendidikan / Prestasi tabs.
    // Generous timeout: the detail route compiles on first hit and fetches
    // the profile, which exceeds the default expect timeout on loaded CI.
    await expect(
      page.getByRole("tab", { name: /Karir & Pendidikan/i }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("tab", { name: /Biodata/i })).toBeVisible();
  });
});
