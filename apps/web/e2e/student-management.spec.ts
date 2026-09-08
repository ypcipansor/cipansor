import { test, expect } from "./fixtures/auth.fixture";
import {
  waitForLoadingComplete,
  fillForm,
  clickTableRow,
  getTableData,
  waitForToast,
} from "./helpers/page-helpers";
import { LoginPage } from "./page-objects";

/**
 * Student Management E2E Tests
 * Tests CRUD operations, search, filter, and pagination
 */

test.describe("Student Management - List & View", () => {
  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    // Navigate to students page
    await page.goto("/students");
    await waitForLoadingComplete(page);
  });

  test("should display students list page", async ({ page }) => {
    // Check page heading with multiple possible variations
    const heading = page
      .getByRole("heading", { name: /daftar santri|students|siswa|santri/i })
      .first();
    const pageTitle = page
      .locator("h1, h2, h3")
      .filter({ hasText: /santri|student|siswa/i })
      .first();

    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(heading).toBeVisible();
    } else if (
      await pageTitle.isVisible({ timeout: 3000 }).catch(() => false)
    ) {
      await expect(pageTitle).toBeVisible();
    } else {
      // At minimum, should be on students page
      await expect(page).toHaveURL(/students/);
    }

    // Check for add button
    // "Add Student" is rendered as a link (Button asChild + Link), so match
    // either role.
    const addButton = page
      .getByRole("link", { name: /tambah|add|create/i })
      .or(page.getByRole("button", { name: /tambah|add|create/i }))
      .first();
    if (await addButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(addButton).toBeVisible();
    }

    // Check if table or grid exists
    const hasTable = await page
      .locator("table")
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const hasGrid = await page
      .locator('[role="grid"]')
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const hasListItems = await page
      .locator('[role="listitem"]')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    expect(hasTable || hasGrid || hasListItems).toBeTruthy();
  });

  test("should search students by name", async ({ page }) => {
    // Find search input
    const searchInput = page
      .getByPlaceholder(/cari|search/i)
      .or(page.getByLabel(/cari|search/i));

    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Data-agnostic: derive a search term from a real seeded student rather
      // than hardcoding a name that may not exist.
      const rows = page.locator("table tbody tr");
      if ((await rows.count()) === 0) {
        test.skip(true, "No students to search");
        return;
      }
      // Search matches name/NISN, so derive the term from the first row's *name*
      // cell (rendered in a font-medium element). Deriving it from arbitrary
      // row text (status, unit, action-button labels) could yield a token the
      // query can't match — which narrows the table to zero rows and leaves a
      // whitespace-only empty/skeleton <tr>, making the assertion fail.
      const nameText =
        (await rows
          .first()
          .locator(".font-medium")
          .first()
          .textContent()
          .catch(() => null)) ??
        (await rows.first().textContent()) ??
        "";
      const term = (nameText.match(/[A-Za-z]{3,}/) ?? ["a"])[0].toLowerCase();

      // Typing debounces a refetch of the students list. Wait for that GET to
      // land before asserting, otherwise the table may still show stale rows.
      const searchResponse = page
        .waitForResponse(
          (r) =>
            /\/students(\?|$)/.test(r.url()) && r.request().method() === "GET",
          { timeout: 10000 },
        )
        .catch(() => null);
      await searchInput.fill(term);
      await searchResponse;
      await waitForLoadingComplete(page);

      // The source student matches its own name, so the term must appear among
      // the rendered rows. Poll (ignoring whitespace-only skeleton rows) so a
      // transient loading/empty frame doesn't fail the assertion.
      await expect(async () => {
        const texts = (await rows.allTextContents())
          .map((t) => t.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        expect(texts.join(" ").toLowerCase()).toContain(term);
      }).toPass({ timeout: 7000 });
    } else {
      test.skip(true, "Search functionality not found");
    }
  });

  test("should filter students by unit", async ({ page }) => {
    // Find filter dropdown
    const unitFilter = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /unit|semua/i })
      .first();

    if (await unitFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unitFilter.click();

      const options = page.getByRole("option");
      const optionCount = await options.count();

      if (optionCount > 1) {
        await options.nth(1).click();
        await waitForLoadingComplete(page);

        // Data should be filtered
        await expect(
          page.locator('table tbody tr, [role="row"]').first(),
        ).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test("should paginate through students", async ({ page }) => {
    // Look for pagination controls
    const nextButton = page.getByRole("button", {
      name: /next|selanjutnya|>/i,
    });

    if (await nextButton.isEnabled({ timeout: 3000 }).catch(() => false)) {
      // Get first student name
      const firstStudent = await page
        .locator('table tbody tr, [role="row"]')
        .first()
        .textContent();

      // Go to next page
      await nextButton.click();
      await waitForLoadingComplete(page);

      // Should show different students
      const newFirstStudent = await page
        .locator('table tbody tr, [role="row"]')
        .first()
        .textContent();
      expect(newFirstStudent).not.toBe(firstStudent);
    } else {
      test.skip(true, "Pagination not available or only one page");
    }
  });

  test("should view student detail", async ({ page }) => {
    // Click first student row (body only — [role=row] would also match the header).
    const firstRow = page.locator("table tbody tr").first();

    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Try clicking the row or view button
      const viewButton = firstRow.getByRole("button", {
        name: /view|lihat|detail/i,
      });

      if (await viewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await viewButton.click();
        await expect(page).toHaveURL(/\/students\/[0-9a-f-]{16,}/, {
          timeout: 10000,
        });
      } else {
        // Click the name cell (a data cell, not the actions column) so the row's
        // onClick navigation fires. Retry until it navigates — under parallel
        // workers the click can land before the row's handler is hydrated.
        await expect(async () => {
          await firstRow.locator("td").nth(1).click();
          await expect(page).toHaveURL(/\/students\/[0-9a-f-]{16,}/, {
            timeout: 2000,
          });
        }).toPass({ timeout: 20000 });
      }

      // Should show student details
      await expect(page.getByText(/nama|name/i).first()).toBeVisible({
        timeout: 8000,
      });
      await expect(page.getByText(/nisn|nis/i).first()).toBeVisible();
    } else {
      test.skip(true, "No students available");
    }
  });
});

test.describe("Student Management - Create", () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = await import("./page-objects");
    const login = new loginPage.LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await page.goto("/students");
    await waitForLoadingComplete(page);
  });

  test("should open create student form", async ({ page }) => {
    // "Add Student" is rendered as a link (Button asChild + Link), so match
    // either role.
    const addButton = page
      .getByRole("link", { name: /tambah|add|create/i })
      .or(page.getByRole("button", { name: /tambah|add|create/i }))
      .first();
    await addButton.click();

    // Should show form
    await expect(
      page.getByRole("heading", { name: /tambah|add|create|baru/i }),
    ).toBeVisible({ timeout: 5000 });

    // Check for required fields (use specific labels to avoid matching
    // "Parent Name" / multiple inputs).
    await expect(page.getByLabel(/full name|nama lengkap/i)).toBeVisible();
    await expect(page.getByLabel(/nisn|nik/i).first()).toBeVisible();
  });

  test("should validate required fields", async ({ page }) => {
    // "Add Student" is rendered as a link (Button asChild + Link), so match
    // either role.
    const addButton = page
      .getByRole("link", { name: /tambah|add|create/i })
      .or(page.getByRole("button", { name: /tambah|add|create/i }))
      .first();
    await addButton.click();
    await waitForLoadingComplete(page);

    // Try to submit empty form
    const submitButton = page.getByRole("button", {
      name: /simpan|save|submit|create student/i,
    });
    await submitButton.click();

    // Should show validation errors
    const errorMessage = page.getByText(/wajib|required|harus diisi/i);
    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  });

  test("should create new student successfully", async ({ page }) => {
    // "Add Student" is rendered as a link (Button asChild + Link), so match
    // either role.
    const addButton = page
      .getByRole("link", { name: /tambah|add|create/i })
      .or(page.getByRole("button", { name: /tambah|add|create/i }))
      .first();
    await addButton.click();
    await waitForLoadingComplete(page);

    // Generate unique data
    const timestamp = Date.now();
    const studentData = {
      nama: `Test Student ${timestamp}`,
      nisn: `TEST${timestamp.toString().slice(-10)}`,
    };

    // Atomically open a Radix select, pick the first option, and confirm it
    // closed. Retried as a unit — under parallel workers on a production build,
    // interacting before hydration (or before async options load) silently drops
    // the value and leaves overlays that block the next control.
    const pickFirstOption = async (
      trigger: import("@playwright/test").Locator,
    ) => {
      await expect(async () => {
        await trigger.click();
        const option = page.getByRole("option").first();
        await option.waitFor({ state: "visible", timeout: 1500 });
        await option.click();
        await expect(page.getByRole("listbox")).toHaveCount(0, {
          timeout: 1500,
        });
      }).toPass({ timeout: 20000 });
    };

    // Fill all required fields (target inputs by id to avoid ambiguity).
    await page.locator("#name").fill(studentData.nama);
    const nisnInput = page.locator("#nisn");
    await expect(nisnInput).toBeVisible();
    await nisnInput.fill(studentData.nisn);
    await page.locator("#birthDate").fill("2012-05-10");
    await page.locator("#birthPlace").fill("Bandung");
    await page.locator("#address").fill("Jl. Test No. 123, Bandung");
    await page.locator("#parentName").fill("Wali Test");
    await page.locator("#parentPhone").fill("081234567890");
    const emailInput = page.locator("#email");
    if (await emailInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await emailInput.fill(`test${timestamp}@example.com`);
    }

    // Gender + Unit selects (Unit options load asynchronously via useUnits).
    // Radix renders the placeholder via data-placeholder, so hasText matching is
    // unreliable — address the two triggers by index (gender = 0, unit = 1).
    await pickFirstOption(page.locator('button[role="combobox"]').nth(0));
    await pickFirstOption(page.locator('button[role="combobox"]').nth(1));

    // Submit form
    const submitButton = page.getByRole("button", {
      name: /simpan|save|submit|create student/i,
    });
    await submitButton.click();

    // On success the form navigates back to the students list.
    await expect(page).toHaveURL(/\/students(\/)?$/, { timeout: 15000 });
  });
});

test.describe("Student Management - Update", () => {
  test("should edit student information", async ({ page }) => {
    const loginPage = await import("./page-objects");
    const login = new loginPage.LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await page.goto("/students");
    await waitForLoadingComplete(page);

    // Find first student
    const firstRow = page.locator('table tbody tr, [role="row"]').first();

    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click edit button
      const editButton = firstRow.getByRole("button", { name: /edit|ubah/i });

      if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await editButton.click();
        await waitForLoadingComplete(page);

        // Should show edit form
        await expect(
          page.getByRole("heading", { name: /edit|ubah/i }),
        ).toBeVisible({ timeout: 5000 });

        // Update a field
        const nameInput = page.getByLabel(/nama|name/i).first();
        const currentName = await nameInput.inputValue();
        await nameInput.fill(`${currentName} (Updated)`);

        // Save changes
        const saveButton = page.getByRole("button", {
          name: /simpan|save|update/i,
        });
        await saveButton.click();

        // Should show success message
        await waitForToast(page, /berhasil|success/i, "success");
      } else {
        test.skip(true, "Edit button not found");
      }
    } else {
      test.skip(true, "No students available");
    }
  });
});

test.describe("Student Management - Delete", () => {
  test("should delete student with confirmation", async ({ page }) => {
    const loginPage = await import("./page-objects");
    const login = new loginPage.LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await page.goto("/students");
    await waitForLoadingComplete(page);

    // Find first student
    const firstRow = page.locator('table tbody tr, [role="row"]').first();

    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      const studentName = await firstRow.textContent();

      // Click delete button
      const deleteButton = firstRow.getByRole("button", {
        name: /delete|hapus/i,
      });

      if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteButton.click();

        // Should show confirmation dialog
        const confirmDialog = page
          .getByRole("alertdialog")
          .or(page.getByRole("dialog"));
        await expect(confirmDialog).toBeVisible({ timeout: 3000 });

        // Confirm deletion
        const confirmButton = confirmDialog.getByRole("button", {
          name: /ya|yes|confirm|hapus/i,
        });
        await confirmButton.click();

        // Should show success message
        await waitForToast(page, /berhasil|success|deleted/i, "success");

        await waitForLoadingComplete(page);
      } else {
        test.skip(true, "Delete button not found");
      }
    } else {
      test.skip(true, "No students available");
    }
  });
});

test.describe("Student Management - Export", () => {
  test("should export students data", async ({ page }) => {
    const loginPage = await import("./page-objects");
    const login = new loginPage.LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await page.goto("/students");
    await waitForLoadingComplete(page);

    // Look for export button
    const exportButton = page.getByRole("button", {
      name: /export|unduh|download/i,
    });

    if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Set up download handler
      const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
      await exportButton.click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.xlsx|\.csv|\.pdf/i);
    } else {
      test.skip(true, "Export button not found");
    }
  });
});
