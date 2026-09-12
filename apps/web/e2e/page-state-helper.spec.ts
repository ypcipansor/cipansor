import { test, expect } from "@playwright/test";
import { settledContent } from "./helpers/page-state";

/**
 * Pins the contract of `settledContent` — the reason 28 call sites stopped
 * calling `page.content()` directly. Without the helper, one arbitrary spec per
 * CI run died on "Unable to retrieve content because the page is navigating":
 * the app bounces to /login until the auth store rehydrates, and under load the
 * read lands inside that bounce. Here the bounce is forced (no session at all),
 * so the failure is reproducible instead of load-dependent.
 */
test.describe("e2e helper: settledContent", () => {
  test("reading the DOM straight through a redirect is what breaks", async ({ page }) => {
    const nav = page.goto("/inventory", { waitUntil: "commit" });
    let error: unknown;
    try {
      // One of these lands mid-navigation; which one is a matter of timing,
      // which is exactly why the specs could not do this.
      for (let i = 0; i < 40; i += 1) await page.content();
    } catch (caught) {
      error = caught;
    }
    await nav.catch(() => {});

    expect(error, "page.content() should fail during a navigation").toBeDefined();
  });

  test("settledContent reads the same moment without failing", async ({ page }) => {
    const nav = page.goto("/inventory", { waitUntil: "commit" });
    const html = await settledContent(page);
    await nav.catch(() => {});

    expect(html.length).toBeGreaterThan(100);
  });
});
