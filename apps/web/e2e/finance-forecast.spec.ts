import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test("Finance Cash Flow Forecast Page", async ({ page }) => {
  test.setTimeout(60000);

  // Unit admin with an assigned unit — the forecast endpoint is unit-scoped
  await loginAs(page, "adminSdit");

  // Navigate to forecast page. Firefox occasionally aborts this navigation
  // (NS_BINDING_ABORTED) when the previous page still has requests in
  // flight — retry once.
  await page
    .goto("/finance/reports/cash-flow-forecast")
    .catch(() => page.goto("/finance/reports/cash-flow-forecast"));

  // Verify structure rendered from the real forecast endpoint (amounts are
  // data-dependent, so assert Rp formatting rather than fixed values)
  await expect(page.locator("text=Proyeksi Arus Kas")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator("text=Net Perubahan Kas")).toBeVisible();
  await expect(page.getByText(/Rp\s?[\d.,]+/).first()).toBeVisible();

  // Verify Chart presence (Recharts renders svg/div)
  await expect(page.locator(".recharts-responsive-container")).toHaveCount(2);

  // The projection table renders one row per forecast month
  const table = page.locator("table");
  await expect(table).toBeVisible();
  expect(await table.locator("tbody tr").count()).toBeGreaterThan(0);
});
