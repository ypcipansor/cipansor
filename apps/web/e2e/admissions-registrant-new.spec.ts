import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test.describe("Internal Alumni Re-enrollment — /admissions/registrants/new", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
  });

  test("renders the registrant creation form with the internal-alumni lookup", async ({
    page,
  }) => {
    await page.goto("/admissions/registrants/new");

    await expect(
      page.getByRole("heading", { name: "Registrasi Baru" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Jika calon adalah alumni internal, cari lewat NISN/NIK untuk mengisi data re-enrollment secara otomatis.",
      ),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Masukkan NISN atau NIK")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Cari Alumni/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Simpan Registrasi/ }),
    ).toBeEnabled({ timeout: 15000 });
  });

  test("shows a not-found message when the identifier has no alumnus", async ({
    page,
  }) => {
    await page.goto("/admissions/registrants/new");

    await page.getByPlaceholder("Masukkan NISN atau NIK").fill("0000000000");
    await page.getByRole("button", { name: /Cari Alumni/ }).click();

    await expect(
      page.getByText(
        /Alumni internal tidak ditemukan untuk identifier tersebut/,
      ),
    ).toBeVisible({ timeout: 15000 });
  });

  test("validates required fields before submitting", async ({ page }) => {
    await page.goto("/admissions/registrants/new");

    const submit = page.getByRole("button", { name: /Simpan Registrasi/ });
    await expect(submit).toBeEnabled({ timeout: 15000 });
    await submit.click();

    await expect(
      page.getByText("Nama lengkap minimal 2 karakter"),
    ).toBeVisible();
  });
});
