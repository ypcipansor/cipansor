import { test, expect, type Page } from "@playwright/test";
import { spmbFormContentFor } from "../src/config/spmb-form.i18n";
import { spmbContentFor } from "../src/config/spmb.i18n";
import type { Locale } from "../src/locales";

/**
 * The public SPMB form in the reader's language.
 *
 * The public site is Indonesian, English and Arabic on every page
 * (decisions/istilah-dan-penamaan.md), and since SPMB S4 the intakes above the
 * form were — but the form itself, its status lookup and its upload fields
 * stayed Indonesian whatever the switcher said. A parent reading in Arabic met
 * "Formulir Pendaftaran" and "Selanjutnya", laid out left to right.
 *
 * Read-only: it opens the form and walks no further than the first step, so
 * it needs only an open intake, which the base seed provides (SMP IT's).
 */

async function openIn(page: Page, locale: Locale) {
  // The public pages read the language from the `app-locale` cookie on the
  // server (lib/server-locale.ts).
  await page.goto("/");
  await page
    .context()
    .addCookies([
      { name: "app-locale", value: locale, url: new URL(page.url()).origin },
    ]);
  await page.goto("/public/spmb");
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

for (const locale of ["en", "ar"] as const) {
  test(`the form speaks ${locale}`, async ({ page }) => {
    const t = spmbFormContentFor(locale);
    const intakes = spmbContentFor(locale);
    await openIn(page, locale);

    await expect(page.getByRole("tab", { name: t.tabs.info })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: t.banner.title }),
    ).toBeVisible();

    // Start from a unit's intake, as a parent does.
    await page
      .getByTestId("public-intake-register")
      .filter({ hasText: intakes.register })
      .first()
      .click();
    await expect(
      page.getByText(t.student.fullName, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: t.actions.next }),
    ).toBeVisible();
    // Nothing from the Indonesian form is left on the page.
    const body = page.locator("body");
    for (const word of [
      "Formulir Pendaftaran",
      "Selanjutnya",
      "Lengkapi data berikut",
      "Butuh Bantuan?",
    ]) {
      await expect(body).not.toContainText(word);
    }

    // Radix writes dir="ltr" on its own roots unless told otherwise
    // (lessons/radix-direction-defaults-ltr): every tabs root follows the
    // page — the form's own and the intakes' inside it, both mounted while
    // the first tab is open.
    const dirs = await page
      .locator('[data-slot="tabs"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("dir")));
    expect(dirs.length).toBeGreaterThan(1);
    expect(new Set(dirs)).toEqual(new Set([locale === "ar" ? "rtl" : "ltr"]));

    // The status lookup too.
    await page.getByRole("tab", { name: t.tabs.check }).click();
    await expect(
      page.getByText(t.tracker.registrationNo, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: t.tracker.search }),
    ).toBeVisible();
  });
}
