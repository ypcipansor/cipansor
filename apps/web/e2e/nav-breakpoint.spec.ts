import { test, expect } from "@playwright/test";
import { id } from "../src/locales/id";

/** Hamburger label, from the default-locale dictionary (see landing.spec.ts). */
const MENU_LABEL = id.public.nav.toggleMenu;

/**
 * The landing header has broken twice in the same way, so it is pinned by
 * geometry rather than by asserting a class name.
 *
 * What makes it fragile: the row is a `justify-between` flex inside Tailwind's
 * `container`, which caps its width at the *active breakpoint* rather than the
 * viewport. Between 1024px and 1279px the row is 1024px wide however wide the
 * window is, so a breakpoint chosen by measuring at 1280px silently overflows
 * the whole band — the brand ends up underneath the first nav link.
 *
 * These tests therefore measure the rendered boxes: the brand must not touch
 * the nav, and the nav must not scroll inside itself.
 *
 * Two things were added when the language switcher reached the public header.
 *
 * First, the sweep runs in all three locales. The row is sized by the *words*
 * in it, and the menu is translated now: the first English labels needed
 * 1027px and the Arabic ones 1088px inside a 960px row, while Indonesian fit
 * in 908px. A sweep that only speaks Indonesian measures one of three layouts.
 *
 * Second, it asserts the brand is not clipped. That is how the overflow
 * actually presented — flex shrank the brand rather than pushing the nav past
 * it, so the boxes never overlapped and the nav never scrolled. Both original
 * assertions passed at 1024px with the brand's text visibly cut off, which is
 * the bug. Measuring `scrollWidth > clientWidth` on the brand is what caught
 * it.
 */

/** Widths where the desktop nav must be laid out, and why each is here. */
const DESKTOP_WIDTHS = [
  { width: 1024, note: "lg — container caps the row at 960px of content" },
  { width: 1152, note: "middle of the capped band" },
  { width: 1279, note: "last pixel before the container grows" },
  { width: 1280, note: "1920x1080 at 150% Windows scaling" },
  { width: 1265, note: "the same laptop once the scrollbar is counted" },
  { width: 1536, note: "2xl" },
  { width: 1920, note: "unscaled full HD" },
];

/** The locales the public header renders in, each with its own text metrics. */
const LOCALES = ["id", "en", "ar"] as const;

for (const locale of LOCALES) {
  for (const { width, note } of DESKTOP_WIDTHS) {
    test(`landing header fits at ${width}px in ${locale} (${note})`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 800 });

      // Load once to learn the origin, set the cookie, then load again. The
      // cookie has to be in place *before* the render being measured, because
      // the root layout reads it server-side to stamp <html lang dir> — a
      // client-side switch afterwards would measure a different paint than the
      // one a visitor arrives on. The origin is taken from the page rather
      // than hardcoded so this follows baseURL.
      await page.goto("/");
      await context.addCookies([
        { name: "app-locale", value: locale, url: new URL(page.url()).origin },
      ]);
      await page.goto("/");

      const brand = page.locator("header a[href='/']").first();
      const nav = page.locator("header nav");

      await expect(nav).toBeVisible();

      const brandBox = await brand.boundingBox();
      const navBox = await nav.boundingBox();
      if (!brandBox || !navBox) throw new Error("header not laid out");

      // Arabic lays the row out right-to-left, so "nav starts after the brand
      // ends" is only the LTR half of the rule. Asserting the raw coordinates
      // would fail every Arabic case for being correct.
      const isRtl = locale === "ar";
      const gap = isRtl
        ? brandBox.x - (navBox.x + navBox.width)
        : navBox.x - (brandBox.x + brandBox.width);
      expect(
        gap,
        `brand and nav overlap in ${locale} at ${width}px`,
      ).toBeGreaterThanOrEqual(0);

      // An overflowing nav scrolls internally instead of visibly colliding,
      // which is the quieter half of the same bug.
      const overflows = await nav.evaluate(
        (el) => el.scrollWidth > el.clientWidth + 1,
      );
      expect(overflows).toBe(false);

      // The half that both assertions above missed: the row runs out of space,
      // flex shrinks the brand, and its name is cut off mid-word while every
      // box still lines up.
      const brandClipped = await brand.evaluate(
        (el) => el.scrollWidth > el.clientWidth + 1,
      );
      expect(
        brandClipped,
        `the brand is clipped in ${locale} at ${width}px — the header needs ` +
          `more room than the container gives it, usually because a nav label ` +
          `grew. Shorten the label; the long form belongs on the page.`,
      ).toBe(false);
    });
  }
}

test("hamburger replaces the nav below lg, and never doubles up", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1023, height: 800 });
  await page.goto("/");

  await expect(page.locator("header nav")).toBeHidden();
  await expect(page.getByRole("button", { name: MENU_LABEL })).toBeVisible();
});

test("exactly one of nav and hamburger is shown, at every width", async ({
  page,
}) => {
  // Both visible means three flex items share the row, and justify-between
  // eats the gap between brand and nav without either one overflowing — how
  // the collision hid from a class-name assertion in the first place.
  //
  // Asserted per width rather than by comparing two booleans. The first
  // version read them with `isVisible()`, which is documented as not waiting:
  // it returned false for *both* before the header had rendered, and the test
  // failed reporting "Expected: not false" — a true statement about an empty
  // page, not about the layout. `toBeVisible`/`toBeHidden` retry, and saying
  // which one is expected at each width means a failure names the real
  // problem.
  for (const width of [1023, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    const nav = page.locator("header nav");
    const burger = page.getByRole("button", { name: MENU_LABEL });

    if (width < 1024) {
      await expect(burger).toBeVisible();
      await expect(nav).toBeHidden();
    } else {
      await expect(nav).toBeVisible();
      await expect(burger).toBeHidden();
    }
  }
});
