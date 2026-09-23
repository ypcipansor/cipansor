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

/**
 * The printed number: only a final `No: CPN/...`, never the placeholder.
 *
 * The page renders the certificate twice — a visible preview and the hidden
 * `printRef` subtree the print handler copies — so both carry the test id; the
 * first is the visible one and both always show the same value.
 */
function previewNumber(page: import("@playwright/test").Page) {
  return page.getByTestId("certificate-number").first();
}

/**
 * Wait for the post-mount number. The hook's initial state is a deterministic
 * placeholder shared by the server and the first client render (that is what
 * removes the hydration mismatch), so the final number only appears after the
 * client effect runs — every read must wait for it rather than race it.
 */
async function waitForFinalNumber(page: import("@playwright/test").Page) {
  const number = previewNumber(page);
  await expect(number).toHaveText(/^No: [A-Z]+\/[A-Z]{3}\/\d{6}\/\d{4}$/, {
    timeout: 15_000,
  });
  return number;
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

    // The number is random and must not be drawn during render: a server and
    // client that each drew one would render different markup and React would
    // log a hydration mismatch. Fail the spec if that regresses.
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydrat|did not match|mismatch/i.test(message.text())
      ) {
        hydrationErrors.push(message.text());
      }
    });

    await loginAs(page, "superAdmin");
    await page.goto("/students/certificates");
    await waitForLoadingComplete(page);
    await expect(
      page.getByRole("heading", { name: /Generator Sertifikat/i }),
    ).toBeVisible();

    await pickFirstStudent(page);
    await pickTemplate(page, /Ijazah \/ Surat Kelulusan/i);

    // The final number is minted after mount; wait for it before asserting.
    const number = await waitForFinalNumber(page);
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
    const second = (await (await waitForFinalNumber(page)).textContent())?.trim();
    expect(second).not.toBe(first);
    expect(second).toMatch(/\/TAH\//);

    expect(hydrationErrors).toEqual([]);
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

    const number = await waitForFinalNumber(page);
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

  test("memilih siswa lain menghasilkan nomor baru, dan preview/print tetap sinkron", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);

    await loginAs(page, "superAdmin");
    await page.goto("/students/certificates");
    await waitForLoadingComplete(page);

    const studentCards = page.locator("div.cursor-pointer.rounded-lg.border");
    // Need at least two seeded students to exercise the transition.
    await expect(studentCards.nth(1)).toBeVisible({ timeout: 60_000 });

    await studentCards.nth(0).click();
    await pickTemplate(page, /Ijazah \/ Surat Kelulusan/i);

    const number = await waitForFinalNumber(page);
    const studentANumber = (await number.textContent())?.trim();

    // Walk back to the type step (the "Ganti Siswa" action lives there), then
    // pick a *different* student with the same certificate type and unit.
    // Before the identity fix this reused student A's number.
    await page.getByRole("button", { name: /^Kembali$/ }).click();
    await page.getByRole("button", { name: /Ganti Siswa/i }).click();
    await expect(studentCards.nth(1)).toBeVisible({ timeout: 60_000 });
    await studentCards.nth(1).click();
    await pickTemplate(page, /Ijazah \/ Surat Kelulusan/i);

    // BUG GUARD: the first frame for student B must never show student A's
    // number. `waitForFinalNumber` waits for a final-shaped number, so an
    // immediate read must not equal A's.
    const immediate = (await number.textContent())?.trim();
    expect(immediate).not.toBe(studentANumber);

    const studentBNumber = (await waitForFinalNumber(page)).textContent();
    const finalB = (await studentBNumber)?.trim();
    expect(finalB).not.toBe(studentANumber);
    expect(finalB).toMatch(/^No: [A-Z]+\/[A-Z]{3}\/\d{6}\/\d{4}$/);

    // Preview and print must still agree for student B.
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
      finalB!,
    );
  });
});
