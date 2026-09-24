import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { galleryItems, galleryThumb } from "./site";
import { siteTextFor } from "./site.i18n";
import type { Locale } from "@/locales";

/**
 * Guards for the pesantren's own photographs.
 *
 * Google for Nonprofits declined cipansor.or.id in August 2026 because the
 * site "relies on generic stock images". What the audit actually found was
 * thinner than that: the photographs were real, there were just nineteen of
 * them, and eleven of the twelve public page types showed none at all — a
 * heading, a paragraph, and a row of icons. A school website that never shows
 * the school fails the same test whether the missing pictures were bought or
 * simply absent.
 *
 * These are source and filesystem guards rather than render tests because the
 * failure mode is a page quietly losing its photograph, or a locale's alt-text
 * array falling out of step with the pictures it describes — neither of which
 * a component test would notice.
 */

const APP = path.join(__dirname, "..", "app");
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const LOCALES: Locale[] = ["id", "en", "ar"];

describe("gallery photographs — the files actually exist", () => {
  it("every photograph and its thumbnail is on disk", () => {
    const missing: string[] = [];
    for (const album of galleryItems) {
      for (const photo of album.photos) {
        for (const rel of [photo.src, galleryThumb(photo.src)]) {
          if (!fs.existsSync(path.join(PUBLIC_DIR, rel))) missing.push(rel);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("there are photographs to guard in the first place", () => {
    // Without this, every assertion above passes vacuously the day someone
    // empties the album.
    expect(galleryItems.length).toBe(3);
    expect(galleryItems.flatMap((a) => a.photos).length).toBe(18);
  });

  it("the thumbnail is genuinely smaller than the full file", () => {
    // galleryThumb exists because the production image optimiser is a
    // pass-through; a thumbnail that is not actually smaller would leave the
    // gallery page as heavy as it was while looking like it had been fixed.
    for (const album of galleryItems) {
      for (const photo of album.photos) {
        const full = fs.statSync(path.join(PUBLIC_DIR, photo.src)).size;
        const thumb = fs.statSync(
          path.join(PUBLIC_DIR, galleryThumb(photo.src)),
        ).size;
        expect(thumb, photo.src).toBeLessThan(full);
      }
    }
  });

  it("the album cover is one of the album's own photographs", () => {
    for (const album of galleryItems) {
      expect(
        album.photos.map((p) => p.src),
        album.slug,
      ).toContain(album.image);
    }
  });
});

describe("gallery photographs — alt text describes the picture", () => {
  it("every locale describes exactly as many photographs as there are", () => {
    const drift: string[] = [];
    for (const locale of LOCALES) {
      const alts = siteTextFor(locale).galleryAlts;
      for (const album of galleryItems) {
        const n = alts[album.slug]?.length ?? 0;
        if (n !== album.photos.length) {
          drift.push(
            `${locale}/${album.slug}: ${n} alts for ${album.photos.length} photos`,
          );
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it("no alt text is the placeholder the photographs arrived with", () => {
    // Alt text must describe each specific photograph rather than generic
    // repetitions of "Pesantren Cipansor".
    for (const locale of LOCALES) {
      const alts = siteTextFor(locale).galleryAlts;
      for (const album of galleryItems) {
        for (const alt of alts[album.slug] ?? []) {
          expect(alt.trim().toLowerCase(), `${locale}/${album.slug}`).not.toBe(
            "pesantren cipansor",
          );
          expect(
            alt.length,
            `${locale}/${album.slug}: "${alt}"`,
          ).toBeGreaterThan(15);
        }
      }
    }
  });

  it("no two photographs in an album share a description", () => {
    for (const locale of LOCALES) {
      const alts = siteTextFor(locale).galleryAlts;
      for (const album of galleryItems) {
        const list = alts[album.slug] ?? [];
        expect(new Set(list).size, `${locale}/${album.slug}`).toBe(list.length);
      }
    }
  });
});

describe("public pages — each one shows the pesantren", () => {
  /**
   * Pages that carry photography of their own rather than a `heroImage`, with
   * the reason. An entry here is a claim that the page shows the pesantren by
   * some other means; it is not a licence to show nothing.
   */
  const OWN_PHOTOGRAPHY: Record<string, string> = {
    "profil/pimpinan/page.tsx": "six leadership portraits",
    "berita/[slug]/page.tsx": "the article's own cover photograph",
    "galeri/page.tsx": "the page is the photographs",
    "wakaf-infaq/page.tsx": "passes `photo` into the DonationPortal hero",
  };

  const PUBLIC_PAGES = [
    "profil/page.tsx",
    "profil/pimpinan/page.tsx",
    "profil/legalitas/page.tsx",
    "program-unggulan/page.tsx",
    "unit/page.tsx",
    "unit/[slug]/page.tsx",
    "berita/page.tsx",
    "berita/[slug]/page.tsx",
    "galeri/page.tsx",
    "wakaf-infaq/page.tsx",
    "kontak/page.tsx",
  ];

  it("every listed public page exists (the guard cannot pass by scanning nothing)", () => {
    for (const rel of PUBLIC_PAGES) {
      expect(fs.existsSync(path.join(APP, rel)), rel).toBe(true);
    }
  });

  it("every public page leads with a photograph", () => {
    const bare: string[] = [];
    for (const rel of PUBLIC_PAGES) {
      if (rel in OWN_PHOTOGRAPHY) continue;
      const src = fs.readFileSync(path.join(APP, rel), "utf8");
      if (!/heroImage=\{/.test(src)) bare.push(rel);
    }
    expect(bare).toEqual([]);
  });

  it("the pages claiming their own photography still reference an image", () => {
    for (const rel of Object.keys(OWN_PHOTOGRAPHY)) {
      const src = fs.readFileSync(path.join(APP, rel), "utf8");
      expect(
        /\bImage\b|\bphoto\b/.test(src),
        `${rel} (${OWN_PHOTOGRAPHY[rel]})`,
      ).toBe(true);
    }
  });
});

describe("public pages — a wrong slug is a 404, not a skeleton", () => {
  it("no root loading.tsx re-opens the streaming boundary", () => {
    /*
     * Measured on the built app, not assumed. With `app/loading.tsx` present,
     * /unit/zzz-bogus answered 200 with 48 KB of dashboard skeleton and the
     * title "Sistem Informasi Cipansor"; with it removed, 404 and the real
     * not-found page. A `loading.tsx` is a Suspense boundary, so Next commits
     * the status before `notFound()` is reached — putting the file back
     * restores the soft 404 without touching a single page. The full note is
     * in `app/not-found.tsx`.
     */
    expect(fs.existsSync(path.join(APP, "loading.tsx"))).toBe(false);
  });

  it("the not-found page exists to be reached", () => {
    expect(fs.existsSync(path.join(APP, "not-found.tsx"))).toBe(true);
  });

  for (const rel of ["unit/[slug]/page.tsx", "berita/[slug]/page.tsx"]) {
    it(`${rel} still refuses an unknown slug`, () => {
      const src = fs.readFileSync(path.join(APP, rel), "utf8");
      expect(src).toMatch(/notFound\(\)/);
      expect(src).toMatch(/generateStaticParams/);
    });
  }
});
