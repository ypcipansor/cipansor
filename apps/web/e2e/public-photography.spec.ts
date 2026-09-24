import { test, expect } from "@playwright/test";
import { galleryItems } from "../src/config/site";

/**
 * The public site must show the pesantren, and must answer a wrong URL with a
 * 404.
 *
 * Google for Nonprofits declined cipansor.or.id in August 2026 because the
 * site "relies on generic stock images", and asked for two things: genuine
 * photographs of the organisation, and a site that is fully functional. Both
 * are measured here rather than asserted from source, because both had source
 * that looked correct while the rendered site did not:
 *
 *   - every public page was wrapped in chrome that *could* take a photograph
 *     and none passed one, so eleven of twelve page types showed a heading, a
 *     paragraph and a row of icons;
 *   - `/unit/[slug]` and `/berita/[slug]` both called `notFound()`, and both
 *     still answered **200** with a dashboard-shaped skeleton, because a root
 *     `loading.tsx` flushed the shell before the page could object.
 *
 * A source guard catches neither. These assertions look at what is served.
 */

/** Every public page a visitor (or a reviewer) can reach from the homepage. */
const PAGES_WITH_PHOTOGRAPHS = [
  "/profil",
  "/profil/pimpinan",
  "/program-unggulan",
  "/unit",
  "/unit/tkq",
  "/unit/sdit",
  "/unit/smpit",
  "/unit/sma-quran",
  "/unit/takhosus",
  "/berita",
  "/galeri",
  "/kontak",
  "/wakaf-infaq",
  "/public/spmb",
];

test.describe("public site — photographs of this pesantren", () => {
  for (const path of PAGES_WITH_PHOTOGRAPHS) {
    test(`${path} shows at least one photograph of the pesantren`, async ({
      page,
    }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      // The logo is chrome, not documentation, so it does not count. What
      // counts is a photograph: the gallery, or a leadership portrait, or an
      // article's own cover.
      const photos = page.locator(
        'img[src*="/images/galeri/"], img[src*="%2Fimages%2Fgaleri%2F"], ' +
          'img[src*="/images/people/"], img[src*="%2Fimages%2Fpeople%2F"], ' +
          'img[src*="berita-"]',
      );
      await expect(photos.first()).toBeVisible({ timeout: 20000 });
    });
  }

  test("/galeri shows every photograph in every album", async ({ page }) => {
    await page.goto("/galeri", { waitUntil: "domcontentloaded" });

    const expected = galleryItems.flatMap((a) => a.photos).length;
    // Thumbnails, one per photograph, plus the album headings.
    await expect(page.locator("figure img")).toHaveCount(expected);

    for (const album of galleryItems) {
      await expect(
        page.getByRole("heading", { level: 2, name: album.title }),
      ).toBeVisible();
    }
  });

  test("every gallery photograph has alt text that is not the album title", async ({
    page,
  }) => {
    await page.goto("/galeri", { waitUntil: "domcontentloaded" });

    const titles = new Set(galleryItems.map((a) => a.title));
    const alts = await page
      .locator("figure img")
      .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).alt));

    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) {
      expect(alt.trim().length).toBeGreaterThan(15);
      expect(alt).not.toBe("Pesantren Cipansor");
      expect(titles.has(alt)).toBe(false);
    }
    // Eighteen distinct photographs deserve eighteen distinct descriptions.
    expect(new Set(alts).size).toBe(alts.length);
  });
});

test.describe("public site — a wrong URL is a 404", () => {
  for (const path of [
    "/unit/zzz-bogus",
    "/unit/smaquran", // the slug is sma-quran; this near-miss used to answer 200
    "/berita/tidak-ada",
  ]) {
    test(`${path} answers 404`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
    });
  }

  for (const path of ["/unit/sma-quran", "/berita", "/galeri"]) {
    test(`${path} still answers 200`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
    });
  }
});
