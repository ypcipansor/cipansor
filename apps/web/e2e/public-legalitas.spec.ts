import { test, expect } from "@playwright/test";
import { LOCALE_COOKIE, type Locale } from "../src/locales";
import { publicContentFor } from "../src/config/content.i18n";

/**
 * *Profil → Legalitas* says how the yayasan is governed once, under its own
 * heading. The legal-identity block it reuses from /profil used to close with
 * the same paragraph, so a reader met it twice a screen apart — in every
 * language. /profil, which has no governance section, keeps the closing note.
 * Read-only: nothing is written, so it runs against any environment.
 */

// A visitor: no session.
test.use({ storageState: { cookies: [], origins: [] } });

for (const locale of ["id", "en", "ar"] as Locale[]) {
  test(`Legalitas states the governance note once (${locale})`, async ({
    page,
    context,
    baseURL,
  }) => {
    const url = new URL(baseURL ?? "http://localhost:3000");
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, domain: url.hostname, path: "/" },
    ]);
    const note = publicContentFor(locale).legalIdentity.governance;

    await page.goto("/profil/legalitas");
    const governance = page.locator('section[aria-labelledby="tata-kelola"]');
    await expect(governance).toContainText(note);
    await expect(page.getByText(note, { exact: true })).toHaveCount(1);

    // The profile page has no governance section of its own; the block's
    // closing note is how it says it there.
    await page.goto("/profil");
    await expect(page.getByText(note, { exact: true })).toHaveCount(1);
  });
}
