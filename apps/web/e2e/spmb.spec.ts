import { test, expect } from "./fixtures/auth.fixture";
import { loginAs } from "./helpers/auth-api";
import { settledContent } from "./helpers/page-state";

/**
 * SPMB (penerimaan murid baru) — halaman pengelola.
 *
 * The previous version of this file navigated to `/ppdb` and then asserted only
 * that the URL still matched `/(spmb|ppdb)/`. That passes for a 404: Next serves
 * its not-found page at the requested URL, so "the URL is right" says nothing
 * about whether a page exists. Its "navigate to waves page" case did exactly
 * that — `/spmb/waves` has never been built, and the test was green anyway.
 *
 * So every case here asserts something the app had to render: the response
 * status, and a heading that only the real page produces.
 */

test.describe("SPMB — portal pengelola", () => {
  test("portal renders its own heading, not a not-found page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    const res = await page.goto("/spmb");
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: /SPMB/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("the old /ppdb address still reaches it", async ({ page }) => {
    // #439 renamed the pages; next.config.ts keeps a permanent redirect so
    // bookmarks and printed links survive the rename.
    await loginAs(page, "superAdmin");

    await page.goto("/ppdb");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    expect(new URL(page.url()).pathname).toBe("/spmb");
  });

  test("portal shows the intake figures and links that exist", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.goto("/spmb");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const content = await settledContent(page);
    expect(content.length).toBeGreaterThan(1000);

    await expect(page.getByText("Total Pendaftar")).toBeVisible();

    // Every link the hub offers must resolve to a built page. The hub used to
    // advertise /spmb/waves and /spmb/selections, which were never built — and
    // Next prefetches these, so each one cost a 404 on every render.
    const hrefs = await page
      .getByRole("main")
      .locator("a[href^='/']")
      .evaluateAll((els) => [
        ...new Set(els.map((e) => (e.getAttribute("href") || "").split("?")[0])),
      ]);
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      const res = await page.request.get(href);
      expect(res.status(), `tautan mati di portal SPMB: ${href}`).toBeLessThan(400);
    }
  });
});

test.describe("SPMB — pendaftar", () => {
  test("registrant list renders and honours the status filter in the URL", async ({ page }) => {
    await loginAs(page, "superAdmin");

    const res = await page.goto("/spmb/registrations?status=ACCEPTED");
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    await expect(
      page.getByRole("main").getByRole("heading", { name: /Pendaftar/i }).first(),
    ).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain("status=ACCEPTED");
  });
});
