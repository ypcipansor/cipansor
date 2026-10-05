import { test, expect } from "@playwright/test";

// Verifies the app is a functioning installable PWA: the manifest, its icons,
// the service worker, and the offline fallback are all served and well-formed,
// and the manifest is linked from the document head.
//
// These run against localhost, where the PWA is deliberately ON — see
// `pwaEnabledForHost` in src/lib/host-split.ts. Only the two public-site names
// switch it off, so the *absence* of the manifest on cipansor.or.id cannot be
// asserted from a single-origin e2e run; that half is covered by the unit tests
// in src/lib/host-split.test.ts and re-checked against the live hosts after
// deploy. If this file ever starts failing with a missing manifest, check
// whether the polarity of that predicate was inverted.
test.describe("PWA assets", () => {
  test("serves a valid web app manifest with resolvable icons", async ({
    request,
  }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBe("Cipansor");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);

    // A 192 and a 512 icon (the installability minimums) must resolve.
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");

    for (const src of ["/icons/icon-192.png", "/icons/icon-512.png"]) {
      const icon = await request.get(src);
      expect(icon.status(), `${src} should resolve`).toBe(200);
      expect(icon.headers()["content-type"]).toContain("image/png");
    }
  });

  test("ships maskable icons separate from the full-bleed ones", async ({
    request,
  }) => {
    const manifest = await (await request.get("/manifest.json")).json();
    const maskable = manifest.icons.filter((i: { purpose?: string }) =>
      (i.purpose ?? "").split(/\s+/).includes("maskable"),
    );
    // A masked launcher must have a safe-zone rendering; the full-bleed artwork
    // alone gets clipped. Both installability sizes need one.
    const maskableSizes = maskable.map((i: { sizes: string }) => i.sizes);
    expect(maskableSizes).toContain("192x192");
    expect(maskableSizes).toContain("512x512");
    for (const icon of maskable) {
      const res = await request.get(icon.src);
      expect(res.status(), `${icon.src} should resolve`).toBe(200);
    }
  });

  test("declares screenshots for the richer install UI, one aspect per factor", async ({
    request,
  }) => {
    const manifest = await (await request.get("/manifest.json")).json();
    expect(Array.isArray(manifest.screenshots)).toBe(true);
    expect(manifest.screenshots.length).toBeGreaterThan(0);

    const ratios = new Map<string, Set<number>>();
    for (const shot of manifest.screenshots) {
      const res = await request.get(shot.src);
      expect(res.status(), `${shot.src} should resolve`).toBe(200);
      expect(["wide", "narrow"]).toContain(shot.form_factor);
      const [w, h] = shot.sizes.split("x").map(Number);
      const set = ratios.get(shot.form_factor) ?? new Set<number>();
      set.add(Math.round((w / h) * 100));
      ratios.set(shot.form_factor, set);
    }
    // Chrome requires every screenshot of one form factor to share an aspect
    // ratio, or it drops them all from the install sheet.
    for (const [, set] of ratios) expect(set.size).toBe(1);
  });

  test("does not lock orientation", async ({ request }) => {
    const manifest = await (await request.get("/manifest.json")).json();
    expect(manifest.orientation).toBeUndefined();
  });

  test("serves the service worker and offline fallback", async ({
    request,
  }) => {
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("addEventListener");
    // The worker script must not be HTTP-cached: a stale copy in an
    // intermediary cache pins every client to the old worker until it expires.
    // The browser's own update check revalidates, so `max-age=0` is correct.
    expect(sw.headers()["cache-control"]).toContain("max-age=0");

    const offline = await request.get("/offline.html");
    expect(offline.status()).toBe(200);
    expect(await offline.text()).toContain("Tidak ada koneksi");
  });

  test("ships a monochrome notification badge the worker points at", async ({
    request,
  }) => {
    // Android tints the badge by its alpha channel only, so a full-colour (or
    // opaque) image renders as a solid blob — the badge must be its own asset,
    // distinct from the colour icon, and the worker must reference it.
    const badge = await request.get("/icons/badge-96.png");
    expect(badge.status()).toBe(200);
    expect(badge.headers()["content-type"]).toContain("image/png");

    const sw = await (await request.get("/sw.js")).text();
    expect(sw).toContain('badge: "/icons/badge-96.png"');
    expect(sw).not.toContain('badge: "/icons/maskable-192.png"');
  });

  test("links the manifest from the document head", async ({ page }) => {
    await page.goto("/login");
    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    expect(manifestHref).toContain("manifest.json");
  });
});
