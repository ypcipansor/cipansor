import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";
import { gotoAuthedPage, waitForLoadingComplete } from "./helpers/page-helpers";

/**
 * TK Assessment evidence upload — drives the four-step wizard on
 * /tk/assessment/new and on /tk/assessment/[id]/edit to the evidence step,
 * uploads a file, then asserts the preview is rendered from the `blob:` URL
 * `objectUrlForFile` produces.
 *
 * Regression for CodeQL js/xss-through-dom (assessment edit/new previews): the
 * preview `src` used to be the raw `URL.createObjectURL` result; it must stay a
 * `blob:` URL and never become a `javascript:`/`data:` scheme. Both wizards
 * changed their preview handling, so both are covered here.
 */

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const comboboxes = (page: Page) => page.locator('button[role="combobox"]');

/**
 * Pick the first option of the nth combobox.
 *
 * The trigger renders before its data query resolves, so an option list can be
 * empty for a moment after the click. Sampling `count()` immediately and
 * bailing out there made the evidence test skip itself on a fully populated
 * stack; wait for the first option (or a real timeout) instead.
 */
async function pickFirstOption(page: Page, index: number): Promise<boolean> {
  const trigger = comboboxes(page).nth(index);
  const triggerReady = await trigger
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!triggerReady) return false;

  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();

  const firstOption = listbox.getByRole("option").first();
  const optionReady = await firstOption
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!optionReady) {
    await page.keyboard.press("Escape");
    return false;
  }

  await firstOption.click();
  await expect(listbox).toBeHidden();
  return true;
}

async function uploadAndAssertBlobPreview(page: Page, altPrefix: string) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "evidence.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });

  const preview = page.locator(`img[alt^="${altPrefix}"]`).first();
  await expect(preview).toBeVisible({ timeout: 5000 });
  const src = await preview.getAttribute("src");
  expect(src).toMatch(/^blob:/);
  expect(src).not.toMatch(/^\s*(javascript|data):/i);
}

test.describe("TK Assessment evidence upload", () => {
  test("creation wizard previews an uploaded file from a blob: URL", async ({
    page,
  }) => {
    await injectSession(page, await apiLogin(SEED_USERS.superAdmin));
    await gotoAuthedPage(page, "/tk/assessment/new", /tambah penilaian baru/i);
    await waitForLoadingComplete(page);

    // Step 1 needs a student and an academic year. The seed provides both; the
    // waits inside pickFirstOption skip only on a genuinely empty database.
    expect(
      await pickFirstOption(page, 0),
      "seed should provide at least one active student",
    ).toBe(true);
    expect(
      await pickFirstOption(page, 1),
      "seed should provide at least one academic year",
    ).toBe(true);
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

    await expect(page.getByText(/bukti & review akhir/i).first()).toBeVisible({
      timeout: 5000,
    });
    await uploadAndAssertBlobPreview(page, "Evidence");
  });

  test("edit wizard previews an uploaded file from a blob: URL", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);

    // Resolve a real active student + academic year and create an assessment to
    // edit. The page filters to active students, so the fixture must too, or
    // the prefilled student id would not be in the select's option list.
    const students = await apiRequest<{
      data: Array<{ id: string; unitId: string }>;
    }>(session, "GET", "/students?status=active&limit=20");
    const student = students.data?.[0];
    expect(student, "seed should provide a student").toBeTruthy();

    const years = await apiRequest<{
      data: Array<{ id: string; isActive: boolean }>;
    }>(session, "GET", "/academic-years");
    const year = years.data?.find((y) => y.isActive) ?? years.data?.[0];
    expect(year, "seed should provide an academic year").toBeTruthy();
    if (!student || !year) return;

    const created = await apiRequest<{ data: { id: string } }>(
      session,
      "POST",
      "/paud-assessment/assessments",
      {
        studentId: student.id,
        unitId: student.unitId,
        academicYearId: year.id,
        semester: "GANJIL",
        periodType: "HARIAN",
        periodDate: new Date().toISOString(),
        aspect: "NAM",
        achievementLevel: "BSH",
        narrativeText: "e2e preview fixture",
      },
    );
    const assessmentId = created.data.id;

    await injectSession(page, session);
    await gotoAuthedPage(
      page,
      `/tk/assessment/${assessmentId}/edit`,
      /edit penilaian tk/i,
    );
    await waitForLoadingComplete(page);

    // The form resets from the fetched assessment in an effect, so wait until
    // the student select is prefilled (its trigger stops showing the
    // placeholder) before walking the steps — clicking "Lanjut" on a still-empty
    // form fails validation and never advances.
    await expect(comboboxes(page).first()).not.toContainText(/pilih siswa/i, {
      timeout: 10000,
    });

    // Steps 1-3 are prefilled from the created assessment, so walk straight to
    // the evidence step.
    for (let step = 1; step <= 3; step++) {
      await page.getByRole("button", { name: /lanjut/i }).click();
    }
    await expect(page.getByText(/bukti & review akhir/i).first()).toBeVisible({
      timeout: 10000,
    });
    await uploadAndAssertBlobPreview(page, "Preview");
  });
});
