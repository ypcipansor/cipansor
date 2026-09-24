import { test, expect } from "@playwright/test";
import { id } from "../src/locales/id";
import { en } from "../src/locales/en";
import { ar } from "../src/locales/ar";
import { LOCALE_LABELS, type Locale } from "../src/locales";
import { publicContentFor } from "../src/config/content.i18n";

/**
 * Language switching on the public site.
 *
 * The public pages are server components: they read the `app-locale` cookie
 * through lib/server-locale.ts rather than the client `useI18n` hook. That
 * split is the interesting part, and it is where this broke — setting React
 * state and a cookie flips the navbar, which is a client component, while the
 * article underneath it goes on being server-rendered in the previous
 * language until something asks the server again.
 *
 * So these tests assert both halves in one action: after picking a language,
 * the menu *and* the prose must have changed, without a manual reload.
 */

/** Open the header's language menu, pick a locale, and wait for it to land. */
async function switchTo(page: import("@playwright/test").Page, locale: Locale) {
  const pathname = new URL(page.url()).pathname;

  // Found by test id, not by accessible name: the name is translated, so a
  // test that switches language more than once would look for the trigger by
  // the label of the language it just left. Both the desktop and mobile
  // switchers are in the DOM at every width; one is hidden by CSS, so filter
  // to the visible one.
  await page
    .getByTestId("language-switcher")
    .filter({ visible: true })
    .first()
    .click();

  // `setLocale` writes the cookie and then calls `router.refresh()`, which
  // refetches this route's RSC payload. The client-side half — `html[lang]`,
  // the dictionary — flips immediately, so waiting on that proves nothing
  // about the server half having arrived.
  //
  // It matters because the refresh re-renders the header the menu lives in.
  // Reopening the menu while the refresh is still in flight puts it inside a
  // subtree that is about to be replaced, so it closes before an item can be
  // picked. That is what made the one test that switches twice fail on CI
  // while passing at human speed locally. Registering the wait *before* the
  // click is deliberate: the response can arrive before the next statement.
  const refreshed = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname === pathname &&
        url.searchParams.has("_rsc") &&
        response.ok()
      );
    },
    { timeout: 15_000 },
  );
  await page.getByRole("menuitem", { name: LOCALE_LABELS[locale] }).click();
  await refreshed;
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

test("the public header offers a language switcher at all", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page
    .getByTestId("language-switcher")
    .filter({ visible: true })
    .first();
  await expect(trigger).toBeVisible();
  // The accessible name is the translated word for "language" — the default
  // locale is Indonesian, so it reads "Bahasa" on first paint.
  await expect(trigger).toHaveAccessibleName(id.common.language);
});

test("switching language changes the menu and the server-rendered prose", async ({
  page,
}) => {
  await page.goto("/profil");

  // Indonesian to begin with.
  await expect(
    page.getByRole("heading", {
      name: publicContentFor("id").profilePage.title,
    }),
  ).toBeVisible();

  await switchTo(page, "en");

  // The client half: the navbar re-renders from the dictionary.
  await expect(
    page.getByRole("link", { name: en.public.nav.units, exact: true }).first(),
  ).toBeVisible();

  // The server half. This is the assertion that fails if the refresh after the
  // cookie write is dropped — the heading comes from a server component, so
  // nothing but a new server render can change it.
  await expect(
    page.getByRole("heading", {
      name: publicContentFor("en").profilePage.title,
    }),
  ).toBeVisible();

  // And the document direction, which the root layout stamps server-side.
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("Arabic switches the document to RTL and translates the prose", async ({
  page,
}) => {
  await page.goto("/profil");
  await switchTo(page, "ar");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(
    page.getByRole("heading", {
      name: publicContentFor("ar").profilePage.title,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: ar.public.nav.news, exact: true }).first(),
  ).toBeVisible();
});

test("the choice survives a reload and follows to another page", async ({
  page,
}) => {
  await page.goto("/profil");
  await switchTo(page, "en");
  await expect(
    page.getByRole("heading", {
      name: publicContentFor("en").profilePage.title,
    }),
  ).toBeVisible();

  // A cookie, not component state: a fresh document must come back in English.
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: publicContentFor("en").profilePage.title,
    }),
  ).toBeVisible();

  await page.goto("/");
  await expect(
    page.getByRole("link", { name: en.public.nav.news, exact: true }).first(),
  ).toBeVisible();
});

test("facts on the legal documents are not translated", async ({ page }) => {
  // The decree number and the registered ID are transcriptions of an issued
  // document. A "translated" identifier is a wrong identifier, and Google for
  // Nonprofits checks this page against the real one.
  const DECREE = "AHU-3039.AH.01.04.Tahun 2022";
  const NPWP = "31.512.635.9-425.000";

  await page.goto("/profil");
  for (const locale of ["en", "ar"] as const) {
    await switchTo(page, locale);
    // Prove the page really is in that language before claiming its untranslated
    // parts survived — the two identifiers below read the same in every locale,
    // so on their own they would pass even if the switch had never happened.
    await expect(
      page.getByRole("heading", {
        name: publicContentFor(locale).profilePage.title,
      }),
    ).toBeVisible();
    await expect(page.getByText(DECREE).first()).toBeVisible();
    await expect(page.getByText(NPWP).first()).toBeVisible();
  }
});
