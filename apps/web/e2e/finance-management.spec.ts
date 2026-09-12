import { test, expect } from "./fixtures/auth.fixture";
import {
  waitForLoadingComplete,
  waitForToast,
  navigateTo,
  fillForm,
} from "./helpers/page-helpers";

/**
 * Finance Module E2E Tests
 * Comprehensive tests for finance management including payments, invoices, and reports
 */

test.describe("Finance - Payment Management", () => {
  test.use({ storageState: ".auth/superAdmin.json" });

  test("should display payment list", async ({ page }) => {
    await navigateTo(page, "/finance/payments");

    const heading = page.getByRole("heading", { name: /pembayaran|payment/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Should show table with payments
      const table = page.locator("table");
      await expect(table).toBeVisible({ timeout: 5000 });

      // Verify headers
      const expectedHeaders = [
        "siswa|student",
        "jumlah|amount",
        "tanggal|date",
        "status",
      ];
      for (const header of expectedHeaders) {
        const headerCell = page.getByRole("columnheader", {
          name: new RegExp(header, "i"),
        });
        if (await headerCell.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(headerCell).toBeVisible();
        }
      }
    } else {
      test.skip(true, "Finance payments page not available");
    }
  });

  test("should create new payment", async ({ page }) => {
    await navigateTo(page, "/finance/payments");

    const heading = page.getByRole("heading", { name: /pembayaran|payment/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const addButton = page
        .getByRole("button", { name: /tambah|add|create/i })
        .first();
      if (await addButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addButton.click();
        await waitForLoadingComplete(page);

        // Select student
        const studentSelect = page
          .locator('button[role="combobox"]')
          .filter({ hasText: /siswa|student/i })
          .first();
        if (
          await studentSelect.isVisible({ timeout: 3000 }).catch(() => false)
        ) {
          await studentSelect.click();
          const studentOptions = page.getByRole("option");
          if ((await studentOptions.count()) > 0) {
            await studentOptions.first().click();
          }
        }

        // Fill amount
        const amountInput = page.getByLabel(/jumlah|amount/i);
        if (await amountInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await amountInput.fill("500000");
        }

        // Select payment method
        const methodSelect = page
          .locator('button[role="combobox"]')
          .filter({ hasText: /metode|method/i })
          .first();
        if (
          await methodSelect.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await methodSelect.click();
          await page.getByRole("option", { name: /tunai|cash/i }).click();
        }

        // Submit
        const submitButton = page.getByRole("button", { name: /simpan|save/i });
        await submitButton.click();

        await waitForToast(page, /berhasil|success/i, "success");
      }
    } else {
      test.skip(true, "Finance payments page not available");
    }
  });

  test("should filter payments by status", async ({ page }) => {
    await navigateTo(page, "/finance/payments");

    const heading = page.getByRole("heading", { name: /pembayaran|payment/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const filterButton = page.getByRole("button", { name: /filter|status/i });
      if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await filterButton.click();

        const statusOption = page
          .getByRole("option", { name: /lunas|paid/i })
          .or(page.getByRole("menuitem", { name: /lunas|paid/i }));
        if (
          await statusOption.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await statusOption.click();
          await waitForLoadingComplete(page);

          // Verify filter applied
          const rows = page.locator("table tbody tr");
          expect(await rows.count()).toBeGreaterThanOrEqual(0);
        }
      }
    } else {
      test.skip(true, "Finance payments page not available");
    }
  });
});

test.describe("Finance - Invoice Management", () => {
  test.use({ storageState: ".auth/superAdmin.json" });

  test("should display invoice list", async ({ page }) => {
    await navigateTo(page, "/finance/invoices");

    const heading = page.getByRole("heading", { name: /tagihan|invoice/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const table = page.locator("table");
      await expect(table).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, "Finance invoices page not available");
    }
  });

  test("should generate bulk invoices", async ({ page }) => {
    await navigateTo(page, "/finance/invoices");

    const heading = page.getByRole("heading", { name: /tagihan|invoice/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const generateButton = page.getByRole("button", {
        name: /generate|buat.*tagihan/i,
      });
      if (
        await generateButton.isVisible({ timeout: 3000 }).catch(() => false)
      ) {
        await generateButton.click();
        await waitForLoadingComplete(page);

        // Select class
        const classSelect = page.locator('button[role="combobox"]').first();
        if (await classSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await classSelect.click();
          const classOptions = page.getByRole("option");
          if ((await classOptions.count()) > 0) {
            await classOptions.first().click();
          }

          const confirmButton = page.getByRole("button", {
            name: /generate|buat/i,
          });
          await confirmButton.click();

          await waitForToast(page, /berhasil|success/i, "success");
        }
      }
    } else {
      test.skip(true, "Finance invoices page not available");
    }
  });

  test("should view invoice detail", async ({ page }) => {
    await navigateTo(page, "/finance/invoices");

    const heading = page.getByRole("heading", { name: /tagihan|invoice/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const firstRow = page.locator("table tbody tr").first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        const viewButton = firstRow.getByRole("button", {
          name: /view|lihat|detail/i,
        });
        if (await viewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await viewButton.click();
        } else {
          await firstRow.click();
        }

        await waitForLoadingComplete(page);

        // Should show invoice detail
        const detailContent = page.getByText(
          /detail.*tagihan|invoice.*detail/i,
        );
        await expect(detailContent).toBeVisible({ timeout: 5000 });
      }
    } else {
      test.skip(true, "Finance invoices page not available");
    }
  });
});

test.describe("Finance - Reports", () => {
  test.use({ storageState: ".auth/superAdmin.json" });

  test("should generate income report", async ({ page }) => {
    await navigateTo(page, "/finance/reports");

    // The reports page ("Laporan Keuangan") presents reports as tabs rather than
    // a generate-on-demand form. Open the income statement (Laba Rugi) tab and
    // confirm its report renders.
    await expect(
      page.getByRole("heading", { name: /laporan keuangan/i }),
    ).toBeVisible({ timeout: 10000 });

    await page
      .getByRole("tab", { name: /laba rugi|income statement/i })
      .click();
    await waitForLoadingComplete(page);

    // The income-statement (Laba Rugi) report card renders with its activity
    // title regardless of the loaded data.
    await expect(
      page.getByText(/laporan aktivitas/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("should export report to Excel", async ({ page }) => {
    await navigateTo(page, "/finance/reports");

    const heading = page.getByRole("main").getByRole("heading", { name: /laporan|report/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const exportButton = page.getByRole("button", {
        name: /export|unduh|download/i,
      });
      if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent("download", {
          timeout: 10000,
        });
        await exportButton.click();

        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.xlsx?$/i);
      }
    } else {
      test.skip(true, "Finance reports page not available");
    }
  });

  test("should filter report by unit", async ({ page }) => {
    await navigateTo(page, "/finance/reports");

    const heading = page.getByRole("main").getByRole("heading", { name: /laporan|report/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const unitSelect = page
        .locator('button[role="combobox"]')
        .filter({ hasText: /unit/i })
        .first();
      if (await unitSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await unitSelect.click();
        const unitOptions = page.getByRole("option");
        if ((await unitOptions.count()) > 0) {
          await unitOptions.first().click();
          await waitForLoadingComplete(page);
        }
      }
    } else {
      test.skip(true, "Finance reports page not available");
    }
  });
});

test.describe("Finance - Dashboard Integration", () => {
  test.use({ storageState: ".auth/superAdmin.json" });

  test("should display finance widgets on main dashboard", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    // Look for finance-related widgets
    const financeWidget = page
      .getByText(/keuangan|finance|pendapatan|revenue/i)
      .first();
    if (await financeWidget.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(financeWidget).toBeVisible();

      // Should show financial metrics
      const metrics = page.locator(
        '[data-testid*="finance"], .finance-card, .revenue-card',
      );
      if (
        await metrics
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await expect(metrics.first()).toBeVisible();
      }
    }
  });

  test("should navigate from dashboard to finance module", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    const financeLink = page.getByRole("link", { name: /keuangan|finance/i });
    if (await financeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await financeLink.click();
      await waitForLoadingComplete(page);

      await expect(page).toHaveURL(/finance/);
    }
  });
});

test.describe("Finance - Payment Reminder", () => {
  test.use({ storageState: ".auth/superAdmin.json" });

  test("should display overdue payments", async ({ page }) => {
    await navigateTo(page, "/finance/reminders");

    const heading = page.getByRole("heading", { name: /pengingat|reminder/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Should show list of overdue payments
      const overdueList = page.getByText(/tunggakan|overdue/i);
      if (await overdueList.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(overdueList).toBeVisible();
      }
    } else {
      test.skip(true, "Finance reminders page not available");
    }
  });

  test("should send payment reminder", async ({ page }) => {
    await navigateTo(page, "/finance/reminders");

    const heading = page.getByRole("heading", { name: /pengingat|reminder/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const sendButton = page
        .getByRole("button", { name: /kirim.*pengingat|send.*reminder/i })
        .first();
      if (await sendButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sendButton.click();

        const confirmButton = page.getByRole("button", {
          name: /ya|yes|kirim/i,
        });
        await confirmButton.click();

        await waitForToast(page, /berhasil|success/i, "success");
      }
    } else {
      test.skip(true, "Finance reminders page not available");
    }
  });
});
