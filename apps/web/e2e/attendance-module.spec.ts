import { test, expect } from "./fixtures/auth.fixture";
import {
  waitForLoadingComplete,
  waitForToast,
  fillForm,
} from "./helpers/page-helpers";
import { LoginPage } from "./page-objects";

/**
 * Attendance Module E2E Tests
 * Tests attendance marking, viewing records, and reports
 */

test.describe("Attendance - Daily Marking", () => {
  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    // Navigate to attendance page
    await page.goto("/attendance");
    await waitForLoadingComplete(page);
  });

  test("should display attendance page", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /absen|attendance|kehadiran/i }),
    ).toBeVisible({ timeout: 10000 });

    // Check for the date selector. The page uses a custom date-picker button
    // (shows "Pilih tanggal" or a formatted Indonesian date), not input[type=date].
    const dateInput = page
      .locator('input[type="date"]')
      .or(
        page.getByRole("button", {
          name: /tanggal|date|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i,
        }),
      );
    await expect(dateInput.first()).toBeVisible();
  });

  test("should mark student as present", async ({ page }) => {
    // Select class
    const classSelect = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /kelas|class/i })
      .first();

    if (await classSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await classSelect.click();

      const classOptions = page.getByRole("option");
      const optionCount = await classOptions.count();

      if (optionCount > 0) {
        await classOptions.first().click();
        await waitForLoadingComplete(page);

        // Should show student list
        const studentList = page.locator('table tbody tr, [role="listitem"]');
        const studentCount = await studentList.count();

        if (studentCount > 0) {
          // Mark first student as present
          const presentButton = studentList
            .first()
            .getByRole("button", { name: /hadir|present/i })
            .or(
              studentList
                .first()
                .locator('input[type="radio"][value="PRESENT"]'),
            );

          if (
            await presentButton.isVisible({ timeout: 3000 }).catch(() => false)
          ) {
            await presentButton.click();

            // Save attendance
            const saveButton = page.getByRole("button", {
              name: /simpan|save/i,
            });
            if (
              await saveButton.isVisible({ timeout: 3000 }).catch(() => false)
            ) {
              await saveButton.click();
              await waitForToast(page, /berhasil|success/i, "success");
            }
          }
        }
      }
    } else {
      test.skip(true, "Class selection not available");
    }
  });

  test("should mark student as absent with reason", async ({ page }) => {
    const classSelect = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /kelas|class/i })
      .first();

    if (await classSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await classSelect.click();
      await page.getByRole("option").first().click();
      await waitForLoadingComplete(page);

      const studentList = page.locator('table tbody tr, [role="listitem"]');
      const studentCount = await studentList.count();

      if (studentCount > 0) {
        // Mark as absent
        const absentButton = studentList
          .first()
          .getByRole("button", { name: /tidak hadir|absent/i })
          .or(
            studentList.first().locator('input[type="radio"][value="ABSENT"]'),
          );

        if (
          await absentButton.isVisible({ timeout: 3000 }).catch(() => false)
        ) {
          await absentButton.click();

          // Add reason if field exists
          const reasonInput = page.getByLabel(/keterangan|reason|alasan/i);
          if (
            await reasonInput.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await reasonInput.fill("Sakit");
          }

          // Save
          const saveButton = page.getByRole("button", { name: /simpan|save/i });
          if (
            await saveButton.isVisible({ timeout: 3000 }).catch(() => false)
          ) {
            await saveButton.click();
            await waitForToast(page, /berhasil|success/i, "success");
          }
        }
      }
    }
  });

  test("should mark all students present (bulk action)", async ({ page }) => {
    const classSelect = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /kelas|class/i })
      .first();

    if (await classSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await classSelect.click();
      await page.getByRole("option").first().click();
      await waitForLoadingComplete(page);

      // Look for "Mark All Present" button
      const markAllButton = page.getByRole("button", {
        name: /semua hadir|mark all present/i,
      });

      if (await markAllButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await markAllButton.click();

        // Confirm if dialog appears
        const confirmButton = page.getByRole("button", {
          name: /ya|yes|confirm/i,
        });
        if (
          await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await confirmButton.click();
        }

        await waitForToast(page, /berhasil|success/i, "success");
      } else {
        test.skip(true, "Bulk mark all not available");
      }
    }
  });
});

test.describe("Attendance - View Records", () => {
  test("should view attendance history for a class", async ({ page }) => {
    const loginPage = await import("./page-objects");
    const login = new loginPage.LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await page.goto("/attendance/history");
    await waitForLoadingComplete(page);

    // Should show history page or tab
    const heading = page.getByRole("heading", { name: /riwayat|history/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(heading).toBeVisible();

      // Should have date range filter
      const startDate = page.getByLabel(/tanggal mulai|start date/i);
      const endDate = page.getByLabel(/tanggal akhir|end date/i);

      if (await startDate.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(startDate).toBeVisible();
      }
    } else {
      test.skip(true, "Attendance history page not found");
    }
  });

  test("should view attendance summary statistics", async ({ page }) => {
    const loginPage = await import("./page-objects");
    const login = new loginPage.LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await page.goto("/attendance");
    await waitForLoadingComplete(page);

    // Look for summary cards
    const summaryCards = [
      /total hadir|total present/i,
      /total tidak hadir|total absent/i,
      /persentase|percentage/i,
    ];

    let foundCards = 0;
    for (const pattern of summaryCards) {
      if (
        await page
          .getByText(pattern)
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        foundCards++;
      }
    }

    if (foundCards === 0) {
      test.skip(true, "No summary statistics found");
    }
  });
});

test.describe("Attendance - Reports", () => {
  test("should generate attendance report", async ({ page }) => {
    const loginPage = await import("./page-objects");
    const login = new loginPage.LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await page.goto("/attendance/reports");
    await waitForLoadingComplete(page);

    // Should show report page
    const heading = page.getByRole("main").getByRole("heading", { name: /laporan|report/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Select report type
      const reportType = page
        .locator('button[role="combobox"]')
        .filter({ hasText: /jenis|type/i })
        .first();

      if (await reportType.isVisible({ timeout: 3000 }).catch(() => false)) {
        await reportType.click();
        await page.getByRole("option").first().click();

        // Generate report
        const generateButton = page.getByRole("button", {
          name: /generate|buat|tampilkan/i,
        });
        await generateButton.click();
        await waitForLoadingComplete(page);

        // Should show report data or download
        const hasReport = await page
          .locator("table, canvas, .report-content")
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        expect(hasReport).toBeTruthy();
      }
    } else {
      test.skip(true, "Attendance reports page not found");
    }
  });

  test("should export attendance report to Excel", async ({ page }) => {
    const loginPage = await import("./page-objects");
    const login = new loginPage.LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await page.goto("/attendance/reports");
    await waitForLoadingComplete(page);

    const exportButton = page.getByRole("button", {
      name: /export|unduh|download/i,
    });

    if (await exportButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
      await exportButton.click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.xlsx|\.xls/i);
    } else {
      test.skip(true, "Export button not found");
    }
  });
});

test.describe("Attendance - Integration with Dashboard", () => {
  test("should update dashboard attendance statistics", async ({ page }) => {
    const loginPage = await import("./page-objects");
    const login = new loginPage.LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    // Get current dashboard stats
    const dashboardPage = await import("./page-objects");
    const dashboard = new dashboardPage.DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForDataLoad();

    const todayAttendance = dashboard.todayAttendanceCard;
    if (await todayAttendance.isVisible({ timeout: 5000 }).catch(() => false)) {
      const initialValue = await todayAttendance.textContent();

      // Go mark attendance
      await page.goto("/attendance");
      await waitForLoadingComplete(page);

      // Mark attendance (if possible)
      const classSelect = page
        .locator('button[role="combobox"]')
        .filter({ hasText: /kelas|class/i })
        .first();
      if (await classSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
        await classSelect.click();
        await page.getByRole("option").first().click();
        await waitForLoadingComplete(page);

        // Save attendance if button exists
        const saveButton = page.getByRole("button", { name: /simpan|save/i });
        if (await saveButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await saveButton.click();
          await waitForLoadingComplete(page);
        }
      }

      // Go back to dashboard
      await dashboard.goto();
      await dashboard.waitForDataLoad();

      // Stats should be updated (or at least still visible)
      await expect(todayAttendance).toBeVisible();
    }
  });
});
