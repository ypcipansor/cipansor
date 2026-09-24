import { test, expect } from "@playwright/test";
import { siteConfig, addressLines } from "../src/config/site";
import { id } from "../src/locales/id";

/**
 * The hamburger's accessible name, read from the default-locale dictionary
 * rather than hardcoded. It used to be the literal "Toggle menu", the one
 * untranslated string left in a header that now offers three languages.
 */
const MENU_LABEL = id.public.nav.toggleMenu;

/**
 * These assertions read from src/config/site.ts rather than repeating the
 * pesantren's name, address and unit list as string literals. The previous
 * version of this file hardcoded content that no longer existed — a
 * "Tentang Kami" nav link, a "Santri"/"Alumni"/"Pengajar" stats block, and the
 * placeholder address "Jl. Pesantren No. 123" — so it went on asserting a
 * homepage that had been replaced. Reading the config means a copy change
 * updates the test with the page, and only a genuine regression fails it.
 */
test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display hero section with main title", async ({ page }) => {
    const hero = page.locator("#hero");
    // The <h1> is built from two config values with a line break between them,
    // so match on the accessible name rather than a single text node.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      siteConfig.legalName,
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      siteConfig.tagline,
    );
    await expect(hero.getByRole("link", { name: "Daftar SPMB" })).toBeVisible();
    await expect(
      hero.getByRole("link", { name: "Profil Pesantren" }),
    ).toBeVisible();
  });

  test("should display navigation menu", async ({ page, isMobile }) => {
    if (isMobile) {
      await expect(
        page.getByRole("button", { name: MENU_LABEL }),
      ).toBeVisible();
      return;
    }
    const nav = page.locator("header");
    // From the dictionary, for the same reason the rest of this file reads
    // config: the menu is translated now, so a literal list here would pin the
    // Indonesian wording and fail on any rewording rather than on a real
    // regression.
    const { home, profile, programs, units, news, donate } = id.public.nav;
    for (const title of [home, profile, programs, units, news, donate]) {
      await expect(
        nav.getByRole("link", { name: title, exact: true }),
      ).toBeVisible();
    }
  });

  test("offers no way in to the portal", async ({ page, isMobile }) => {
    // This replaces a test that clicked a "Login Portal" button. The button is
    // gone on purpose: this site is for prospective families, and everyone who
    // can actually sign in is told portal.cipansor.or.id directly — a shorter
    // instruction, with fewer steps to get wrong, that has to be given either
    // way. The assertion is inverted rather than deleted so that putting the
    // link back is a decision someone has to make on purpose.
    if (isMobile) {
      await page.getByRole("button", { name: MENU_LABEL }).click();
    }

    await expect(page.getByRole("link", { name: /login|masuk/i })).toHaveCount(
      0,
    );
    await expect(page.locator('a[href="/login"]')).toHaveCount(0);
  });

  test("should navigate to the SPMB page", async ({ page }) => {
    const hero = page.locator("#hero");
    await hero.getByRole("link", { name: "Daftar SPMB" }).click();
    await expect(page).toHaveURL(/\/public\/spmb/);
  });

  test("should display stats section", async ({ page }) => {
    const stats = page.locator("#stats");
    // Enrollment and alumni counts are deliberately absent from this section —
    // see the note in stats.tsx. These four are the substantiable facts.
    await expect(
      stats.getByText("Berdiri Sejak", { exact: true }),
    ).toBeVisible();
    await expect(
      stats.getByText("Unit Pendidikan", { exact: true }),
    ).toBeVisible();
    await expect(
      stats.getByText("Program Unggulan", { exact: true }),
    ).toBeVisible();
    await expect(
      stats.getByText(String(siteConfig.establishedYear), { exact: true }),
    ).toBeVisible();
  });

  test("should display programs section", async ({ page }) => {
    const programs = page.locator("#programs");
    await expect(
      programs.getByRole("heading", { name: "Pembinaan Harian Santri" }),
    ).toBeVisible();
  });

  test("should display footer with contact info", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = page.locator("footer");
    await expect(footer.getByText(addressLines[0])).toBeVisible();

    const wakafLink = footer.getByRole("link", {
      name: "Wakaf & Infaq",
      exact: true,
    });
    await expect(wakafLink).toBeVisible();
    await expect(wakafLink).toHaveAttribute("href", "/wakaf-infaq");
  });

  test("should display the legal identity strip", async ({ page }) => {
    // Google for Nonprofits rejected the domain for not displaying the
    // registered ID, so its presence on the landing page is a requirement and
    // not decoration.
    const strip = page.locator('section[aria-labelledby="legalitas-ringkas"]');
    await expect(strip).toBeVisible();
    await expect(strip.getByText("31.512.635.9-425.000")).toBeVisible();
  });
});
