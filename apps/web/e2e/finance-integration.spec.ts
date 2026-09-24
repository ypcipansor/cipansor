import { test, expect } from "@playwright/test";

test.describe("Finance & Billing Integration", () => {
  // Use a real authenticated session so the finance pages (MainLayout +
  // ProtectedRoute, real API data) actually render.
  test.use({ storageState: ".auth/superAdmin.json" });

  test("Billing & Arrears (Tunggakan) management page", async ({ page }) => {
    // /finance/billing was a second billing screen that overlapped /finance and
    // disagreed with it on the outstanding total. It is now the Tunggakan tab
    // of /finance, and the old path redirects so existing links still work —
    // this asserts both halves of that.
    await page.goto("/finance/billing");
    await expect(page).toHaveURL(/\/finance$/);

    await expect(
      page.getByRole("heading", { name: "Tagihan & SPP", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("tab", { name: "Tunggakan" }).click();

    // Outstanding summary card and the unit filter are present (the arrears
    // list itself requires picking a unit first).
    await expect(page.getByText("Total Outstanding (Unit)")).toBeVisible();
    await expect(page.getByText("Filter Data Tunggakan")).toBeVisible();

    // Core action exists.
    await expect(page.getByRole("button", { name: /Refresh/i })).toBeVisible();
  });

  test("Update Student Wallet from Payment (Mocked Flow)", async ({ page }) => {
    // Navigate to a specific student profile that we know exists in DB
    // Currently testing the UI layout in Student Profile -> Finance tab
    await page.goto("/students");

    // Click the first student in the list
    await page.getByRole("row").nth(1).click();

    // Go to Finance tab
    await page.getByRole("tab", { name: "Finance" }).click();

    // Verify new finance cards exist
    await expect(page.locator("text=Wallet (Uang Saku)")).toBeVisible();
    await expect(page.locator("text=Tagihan & Tunggakan")).toBeVisible();

    // Check action buttons
    await expect(
      page.getByRole("link", { name: /Kelola Saldo/i }),
    ).toBeVisible();
  });

  test("Finance Dashboard Analytics", async ({ page }) => {
    await page.goto("/finance");

    // Verify dashboard metrics exist
    await expect(page.locator("text=Total Tagihan").first()).toBeVisible();
    await expect(page.locator("text=Terbayar").first()).toBeVisible();
    await expect(page.locator("text=Belum Dibayar").first()).toBeVisible();
    await expect(page.locator("text=Jatuh Tempo").first()).toBeVisible();

    // Verify our new injected Collection Ratio card exists
    await expect(page.locator("text=Collection Ratio")).toBeVisible();
    await expect(page.locator("text=Persentase Terkumpul")).toBeVisible();
  });
});
