import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test("Finance Accounting Page - Trial Balance and Reports", async ({
  page,
}) => {
  test.setTimeout(60000);

  await loginAs(page, "superAdmin");

  // 1. Navigate directly to the accounting page.
  await page.goto("/finance/accounting");

  // 2. Open the reports tab ("Ringkasan Laporan").
  await page.getByRole("tab", { name: /Ringkasan Laporan/i }).click();

  // 3. The trial balance report renders from the real journal data.
  await expect(page.getByText("Neraca Saldo (Trial Balance)")).toBeVisible({
    timeout: 15000,
  });
});
