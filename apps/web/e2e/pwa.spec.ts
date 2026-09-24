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

  test("serves the service worker and offline fallback", async ({
    request,
  }) => {
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("addEventListener");

    const offline = await request.get("/offline.html");
    expect(offline.status()).toBe(200);
    expect(await offline.text()).toContain("Tidak ada koneksi");
  });

  test("links the manifest from the document head", async ({ page }) => {
    await page.goto("/login");
    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    expect(manifestHref).toContain("manifest.json");
  });
});
