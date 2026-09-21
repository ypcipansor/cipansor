import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";
import { waitForLoadingComplete } from "./helpers/page-helpers";

/**
 * Akademik › Students › Certificates — nomor sertifikat.
 *
 * `useCertificateNumber` exists because `generateCertificateNumber` is random:
 * drawing it in the component body minted a new number on every render, so an
 * unrelated state update redrew the printed certificate under a number the
 * student never received. The hook ties the value to `type` + `unitCode`, and
 * this spec pins that contract against the real page — not just the hook —
 * because the failure mode was an integration one (the page re-rendering).
 *
 * Sample numbers are random by design, so nothing here asserts a literal; it
 * asserts stability and change-of-input.
 */

/** The certificate number as it appears in the preview: "No: CPN/...". */
function previewNumber(page: import("@playwright/test").Page) {
  return page.locator("text=/No: [A-Z]+\\//").first();
}

async function pickFirstStudent(page: import("@playwright/test").Page) {
  const card = page.locator("div.cursor-pointer.rounded-lg.border").first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.click();
}

async function pickTemplate(
  page: import("@playwright/test").Page,
  label: RegExp,
) {
  const card = page
    .locator("div.cursor-pointer")
    .filter({ hasText: label })
    .first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
}

test.describe("Generator Sertifikat — stabilitas nomor", () => {
  test("nomor tetap setelah re-render yang tidak mengubah type, dan berubah saat type berubah", async ({
    page,
  }) => {
    // Seeded data has to arrive (units → students), slower than the default
    // action budget.
    test.setTimeout(120_000);

    await loginAs(page, "superAdmin");
    await page.goto("/students/certificates");
    await waitForLoadingComplete(page);
    await expect(
      page.getByRole("heading", { name: /Generator Sertifikat/i }),
    ).toBeVisible();

    await pickFirstStudent(page);
    await pickTemplate(page, /Ijazah \/ Surat Kelulusan/i);

    const number = previewNumber(page);
    await expect(number).toBeVisible({ timeout: 15_000 });
    const first = (await number.textContent())?.trim();
    expect(first).toMatch(/^No: [A-Z]+\/[A-Z]{3}\/\d{6}\/\d{4}$/);

    // An unrelated state change (the optional description) must redraw the
    // certificate without minting a new number. The label is not bound to the
    // textarea, so target it by placeholder.
    await page.getByPlaceholder(/Tambahkan keterangan/i).fill("catatan uji");
    await page.waitForTimeout(200);
    await expect(number).toHaveText(first!);

    // Changing the certificate type is the one input that must produce a new
    // number (and a new type segment).
    await page.getByRole("button", { name: /^Kembali$/ }).click();
    await pickTemplate(page, /Syahadah Tahfidz/i);
    const second = (await previewNumber(page).textContent())?.trim();
    expect(second).not.toBe(first);
    expect(second).toMatch(/\/TAH\//);
  });

  test("preview dan dokumen cetak memakai nomor yang sama", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);

    await loginAs(page, "superAdmin");
    await page.goto("/students/certificates");
    await waitForLoadingComplete(page);
    await pickFirstStudent(page);
    await pickTemplate(page, /Ijazah \/ Surat Kelulusan/i);

    const number = previewNumber(page);
    await expect(number).toBeVisible({ timeout: 15_000 });
    const previewText = (await number.textContent())?.trim();

    // The print handler builds the document with `document.write` and calls
    // `print()` after 500ms; stub `print` so the popup stays open long enough
    // to read the number it was handed.
    await context.addInitScript(() => {
      window.print = () => {};
    });

    const popupPromise = context.waitForEvent("page");
    await page
      .getByRole("button", { name: /Cetak Sertifikat/i })
      .first()
      .click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");

    await expect(popup.locator("text=/No: [A-Z]+\\//").first()).toHaveText(
      previewText!,
    );
  });
});
