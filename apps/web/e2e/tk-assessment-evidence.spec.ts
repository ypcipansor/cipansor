import { test, expect } from "./fixtures/auth.fixture";
import { LoginPage } from "./page-objects";
import { gotoAuthedPage, waitForLoadingComplete } from "./helpers/page-helpers";

/**
 * TK Assessment evidence upload — drives the four-step wizard on
 * /tk/assessment/new to the evidence step and uploads a file, then asserts the
 * preview is rendered from the `blob:` URL `objectUrlForFile` produces.
 *
 * Regression for CodeQL js/xss-through-dom (assessment edit/new previews): the
 * preview `src` used to be the raw `URL.createObjectURL` result; it must stay a
 * `blob:` URL and never become a `javascript:`/`data:` scheme.
 */

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: import("@playwright/test").Page) {
  const lp = new LoginPage(page);
  await lp.goto();
  await lp.loginAndWaitForDashboard(
    "superadmin@cipansor.or.id",
    "SuperAdmin123!",
  );
}

const comboboxes = (page: import("@playwright/test").Page) =>
  page.locator('button[role="combobox"]');

async function pickFirstOption(
  page: import("@playwright/test").Page,
  index: number,
): Promise<boolean> {
  const trigger = comboboxes(page).nth(index);
  if (!(await trigger.isVisible({ timeout: 5000 }).catch(() => false))) {
    return false;
  }
  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  const option = listbox.getByRole("option");
  if ((await option.count()) === 0) {
    await page.keyboard.press("Escape");
    return false;
  }
  await option.first().click();
  await expect(listbox).toBeHidden();
  return true;
}

test.describe("TK Assessment evidence upload", () => {
  test("previews an uploaded file from a blob: URL", async ({ page }) => {
    await login(page);
    await gotoAuthedPage(page, "/tk/assessment/new", /tambah penilaian baru/i);
    await waitForLoadingComplete(page);

    // Step 1 needs a student and an academic year; skip when the seed has none.
    if (!(await pickFirstOption(page, 0))) {
      test.skip(true, "No students available for testing");
      return;
    }
    if (!(await pickFirstOption(page, 1))) {
      test.skip(true, "No academic years available for testing");
      return;
    }
    await page.getByRole("button", { name: /lanjut/i }).click();

    // Step 2: pick a development aspect and an achievement level via labels
    // (the Radix radios are `sr-only`; the label is the click target).
    const aspectLabel = page.locator('label[for^="aspect-"]').first();
    await expect(aspectLabel).toBeVisible({ timeout: 5000 });
    await aspectLabel.click();
    await page.locator('label[for="BSH"]').click();
    await page.getByRole("button", { name: /lanjut/i }).click();

    // Step 3 narrative fields are optional.
    await page.getByRole("button", { name: /lanjut/i }).click();

    // Step 4: upload evidence and assert the preview comes from a blob: URL.
    await expect(page.getByText(/bukti & review akhir/i).first()).toBeVisible({
      timeout: 5000,
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: "evidence.png",
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });

    const preview = page.locator('img[alt^="Evidence"]').first();
    await expect(preview).toBeVisible({ timeout: 5000 });
    const src = await preview.getAttribute("src");
    expect(src).toMatch(/^blob:/);
    expect(src).not.toMatch(/^\s*(javascript|data):/i);
  });
});
