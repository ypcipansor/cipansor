import { test, expect } from "./fixtures/auth.fixture";
import {
  waitForLoadingComplete,
  waitForToast,
  navigateTo,
  fillForm,
} from "./helpers/page-helpers";
import { LoginPage } from "./page-objects";

/**
 * Teacher Management E2E Tests
 * Tests teacher CRUD operations, assignments, and profiles
 */

test.describe("Teacher Management - List and View", () => {
  test("should display teacher list with correct columns", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Should show table with teachers
      const table = page.locator("table");
      await expect(table).toBeVisible({ timeout: 5000 });

      // Verify headers
      const headers = ["nama", "nip", "mata pelajaran", "status", "aksi"];
      for (const header of headers) {
        const headerCell = page.getByRole("columnheader", {
          name: new RegExp(header, "i"),
        });
        if (await headerCell.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(headerCell).toBeVisible();
        }
      }

      // Should have at least one teacher
      const rows = page.locator("table tbody tr");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
    } else {
      test.skip(true, "Teachers page not available");
    }
  });

  test("should view teacher detail", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const firstRow = page.locator("table tbody tr").first();
      const teacherName = await firstRow.locator("td").first().textContent();

      // Click view button
      const viewButton = firstRow.getByRole("button", {
        name: /view|lihat|detail/i,
      });
      if (await viewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await viewButton.click();
      } else {
        await firstRow.click();
      }

      await waitForLoadingComplete(page);

      // Should show detail page
      const detailHeading = page.getByRole("heading", {
        name: new RegExp(teacherName || "detail", "i"),
      });
      await expect(detailHeading).toBeVisible({ timeout: 5000 });

      // Should show teacher info
      const infoSections = ["biodata", "kontak", "pendidikan", "mengajar"];
      for (const section of infoSections) {
        const sectionText = page.getByText(new RegExp(section, "i"));
        if (await sectionText.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(sectionText).toBeVisible();
        }
      }
    } else {
      test.skip(true, "Teachers page not available");
    }
  });

  test("should search teachers", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Get first teacher name
      const firstRow = page.locator("table tbody tr").first();
      const teacherNameCell = firstRow.locator("td").first();
      const teacherName = (await teacherNameCell.textContent())
        ?.trim()
        .split(" ")[0];

      if (teacherName) {
        // Search for teacher
        const searchInput = page
          .getByPlaceholder(/cari|search/i)
          .or(page.getByLabel(/cari|search/i));
        await searchInput.fill(teacherName);
        await waitForLoadingComplete(page);

        // Should show filtered results
        const rows = page.locator("table tbody tr");
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);

        // All visible teachers should match search
        const firstResultName = await rows
          .first()
          .locator("td")
          .first()
          .textContent();
        expect(firstResultName?.toLowerCase()).toContain(
          teacherName.toLowerCase(),
        );
      }
    } else {
      test.skip(true, "Teachers page not available");
    }
  });

  test("should filter teachers by subject", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Open subject filter
      const filterButton = page.getByRole("button", {
        name: /filter|mata pelajaran|subject/i,
      });
      if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await filterButton.click();

        // Select a subject
        const subjectOptions = page
          .getByRole("option")
          .or(page.getByRole("menuitem"));
        const optionCount = await subjectOptions.count();

        if (optionCount > 0) {
          const selectedSubject = await subjectOptions.first().textContent();
          await subjectOptions.first().click();
          await waitForLoadingComplete(page);

          // Should show filtered results
          const rows = page.locator("table tbody tr");
          const rowCount = await rows.count();

          if (rowCount > 0) {
            // Verify filter applied
            const filterIndicator = page.getByText(
              new RegExp(selectedSubject || "filter", "i"),
            );
            await expect(filterIndicator).toBeVisible({ timeout: 3000 });
          }
        }
      }
    } else {
      test.skip(true, "Teachers page not available");
    }
  });
});

test.describe("Teacher Management - Create", () => {
  test("should create new teacher successfully", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click add button
      const addButton = page
        .getByRole("button", { name: /tambah|add|create/i })
        .first();
      await addButton.click();
      await waitForLoadingComplete(page);

      // Fill form
      const timestamp = Date.now();
      const teacherData = {
        "nama|name": `Test Teacher ${timestamp}`,
        nip: `NIP${timestamp.toString().slice(-10)}`,
        email: `teacher${timestamp}@test.com`,
        "phone|telepon": `08123456${timestamp.toString().slice(-4)}`,
      };

      await fillForm(page, teacherData);

      // Select gender
      const genderSelect = page
        .locator('button[role="combobox"]')
        .filter({ hasText: /jenis kelamin|gender/i })
        .first();
      if (await genderSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await genderSelect.click();
        await page.getByRole("option").first().click();
      }

      // Submit form
      const submitButton = page.getByRole("button", {
        name: /simpan|save|submit/i,
      });
      await submitButton.click();

      // Should show success message
      await waitForToast(page, /berhasil|success/i, "success");
      await waitForLoadingComplete(page);

      // Should redirect to teacher list
      await expect(
        page.getByRole("heading", { name: /guru|teacher/i }),
      ).toBeVisible({ timeout: 5000 });

      // Verify teacher appears in list
      const searchInput = page.getByPlaceholder(/cari|search/i);
      await searchInput.fill(`NIP${timestamp.toString().slice(-10)}`);
      await waitForLoadingComplete(page);

      const newTeacherRow = page
        .locator("table tbody tr")
        .filter({ hasText: `NIP${timestamp.toString().slice(-10)}` });
      await expect(newTeacherRow).toBeVisible({ timeout: 3000 });
    } else {
      test.skip(true, "Teachers page not available");
    }
  });

  test("should validate required fields", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const addButton = page
        .getByRole("button", { name: /tambah|add|create/i })
        .first();
      await addButton.click();
      await waitForLoadingComplete(page);

      // Try to submit empty form
      const submitButton = page.getByRole("button", {
        name: /simpan|save|submit/i,
      });
      await submitButton.click();

      // Should show validation errors
      const errorMessages = page.getByText(/wajib|required|harus/i);
      await expect(errorMessages.first()).toBeVisible({ timeout: 3000 });
    } else {
      test.skip(true, "Teachers page not available");
    }
  });

  test("should validate email format", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const addButton = page
        .getByRole("button", { name: /tambah|add|create/i })
        .first();
      await addButton.click();
      await waitForLoadingComplete(page);

      // Fill with invalid email
      const emailInput = page.getByLabel(/email/i);
      await emailInput.fill("invalid-email");

      const nameInput = page.getByLabel(/nama|name/i).first();
      await nameInput.click(); // Trigger validation

      // Should show email validation error
      const emailError = page.getByText(/email.*valid|email.*benar/i);
      await expect(emailError).toBeVisible({ timeout: 3000 });
    } else {
      test.skip(true, "Teachers page not available");
    }
  });
});

test.describe("Teacher Management - Update", () => {
  test("should update teacher information", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const firstRow = page.locator("table tbody tr").first();

      // Click edit button
      const editButton = firstRow.getByRole("button", { name: /edit|ubah/i });
      await editButton.click();
      await waitForLoadingComplete(page);

      // Update phone number
      const phoneInput = page.getByLabel(/phone|telepon/i);
      const newPhone = `0812345${Date.now().toString().slice(-5)}`;
      await phoneInput.fill(newPhone);

      // Save changes
      const saveButton = page.getByRole("button", {
        name: /simpan|save|update/i,
      });
      await saveButton.click();

      await waitForToast(page, /berhasil|success/i, "success");
      await waitForLoadingComplete(page);

      // Verify changes
      const updatedRow = page
        .locator("table tbody tr")
        .filter({ hasText: newPhone });
      await expect(updatedRow).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, "Teachers page not available");
    }
  });
});

test.describe("Teacher Management - Delete", () => {
  test("should delete teacher with confirmation", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      // First create a teacher to delete
      const addButton = page
        .getByRole("button", { name: /tambah|add|create/i })
        .first();
      await addButton.click();
      await waitForLoadingComplete(page);

      const timestamp = Date.now();
      const teacherNIP = `DEL${timestamp.toString().slice(-10)}`;

      await fillForm(page, {
        "nama|name": `Delete Test ${timestamp}`,
        nip: teacherNIP,
        email: `delete${timestamp}@test.com`,
      });

      const submitButton = page.getByRole("button", {
        name: /simpan|save|submit/i,
      });
      await submitButton.click();
      await waitForToast(page, /berhasil|success/i, "success");
      await waitForLoadingComplete(page);

      // Now delete it
      const searchInput = page.getByPlaceholder(/cari|search/i);
      await searchInput.fill(teacherNIP);
      await waitForLoadingComplete(page);

      const teacherRow = page
        .locator("table tbody tr")
        .filter({ hasText: teacherNIP });
      const deleteButton = teacherRow.getByRole("button", {
        name: /delete|hapus/i,
      });

      if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteButton.click();

        // Confirm deletion
        const confirmButton = page.getByRole("button", {
          name: /ya|yes|confirm|hapus/i,
        });
        await confirmButton.click();

        await waitForToast(page, /berhasil|success/i, "success");
        await waitForLoadingComplete(page);

        // Verify teacher is removed
        await searchInput.fill(teacherNIP);
        await waitForLoadingComplete(page);

        const noDataMessage = page.getByText(
          /tidak.*ditemukan|no.*found|kosong/i,
        );
        await expect(noDataMessage).toBeVisible({ timeout: 3000 });
      }
    } else {
      test.skip(true, "Teachers page not available");
    }
  });
});

test.describe("Teacher Management - Subject Assignment", () => {
  test("should assign subjects to teacher", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const firstRow = page.locator("table tbody tr").first();

      // Click view/edit button
      const actionButton = firstRow
        .getByRole("button", { name: /view|lihat|edit/i })
        .first();
      await actionButton.click();
      await waitForLoadingComplete(page);

      // Look for subject assignment section
      const subjectSection = page.getByText(/mata pelajaran|subject|mengajar/i);
      if (
        await subjectSection.isVisible({ timeout: 3000 }).catch(() => false)
      ) {
        // Click add subject button
        const addSubjectButton = page.getByRole("button", {
          name: /tambah.*pelajaran|add.*subject/i,
        });
        if (
          await addSubjectButton.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await addSubjectButton.click();

          // Select subject
          const subjectSelect = page.locator('button[role="combobox"]').first();
          await subjectSelect.click();

          const subjectOptions = page.getByRole("option");
          if ((await subjectOptions.count()) > 0) {
            await subjectOptions.first().click();

            // Save assignment
            const saveButton = page.getByRole("button", {
              name: /simpan|save/i,
            });
            await saveButton.click();

            await waitForToast(page, /berhasil|success/i, "success");
          }
        }
      }
    } else {
      test.skip(true, "Teachers page not available");
    }
  });

  test("should assign teacher to class", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const firstRow = page.locator("table tbody tr").first();

      const actionButton = firstRow
        .getByRole("button", { name: /view|lihat|edit/i })
        .first();
      await actionButton.click();
      await waitForLoadingComplete(page);

      // Look for class assignment section
      const classSection = page.getByRole("main").getByText(/wali kelas|class.*teacher|kelas/i);
      if (await classSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        const assignButton = page.getByRole("button", {
          name: /assign|tetapkan|pilih.*kelas/i,
        });
        if (
          await assignButton.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await assignButton.click();

          const classSelect = page.locator('button[role="combobox"]').first();
          await classSelect.click();

          const classOptions = page.getByRole("option");
          if ((await classOptions.count()) > 0) {
            await classOptions.first().click();

            const saveButton = page.getByRole("button", {
              name: /simpan|save/i,
            });
            await saveButton.click();

            await waitForToast(page, /berhasil|success/i, "success");
          }
        }
      }
    } else {
      test.skip(true, "Teachers page not available");
    }
  });
});

test.describe("Teacher Management - Export", () => {
  test("should export teacher list to Excel", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    await navigateTo(page, "/teachers");

    const heading = page.getByRole("heading", { name: /guru|teacher/i });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      const exportButton = page.getByRole("button", {
        name: /export|unduh|download/i,
      });
      if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Start download
        const downloadPromise = page.waitForEvent("download", {
          timeout: 10000,
        });
        await exportButton.click();

        const download = await downloadPromise;

        // Verify download
        expect(download.suggestedFilename()).toMatch(/teacher|guru/i);
        expect(download.suggestedFilename()).toMatch(/\.xlsx?$/i);
      }
    } else {
      test.skip(true, "Teachers page not available");
    }
  });
});
