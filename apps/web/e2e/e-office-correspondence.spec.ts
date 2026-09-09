import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test.describe("E-Office correspondence flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
  });

  test("inbox renders the search and status filters", async ({ page }) => {
    await page.goto("/e-office/inbox");

    // The LetterList filter toolbar is the surface users use to triage mail.
    await expect(page.getByLabel("Cari surat")).toBeVisible();
    await expect(page.getByLabel("Saring menurut status")).toBeVisible();
  });

  test("archive renders the archived-letter list and its filters", async ({ page }) => {
    await page.goto("/e-office/archive");

    await expect(page.getByRole("heading", { name: "Arsip Surat" })).toBeVisible();
    await expect(page.getByLabel("Cari surat")).toBeVisible();
    await expect(page.getByLabel("Saring menurut status")).toBeVisible();
  });

  test("create page renders the letter-creation form", async ({ page }) => {
    await page.goto("/e-office/create");

    await expect(page.getByRole("heading", { name: "Buat Surat Baru" })).toBeVisible();
    await expect(page.getByPlaceholder("Contoh: Undangan Rapat Wali Murid")).toBeVisible();
    await expect(page.getByPlaceholder("Pilih unit penerbit...")).toBeVisible();
  });
});
