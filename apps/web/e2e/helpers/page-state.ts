import type { Page } from "@playwright/test";

/**
 * Read the page HTML once the document has stopped moving.
 *
 * `page.content()` throws "Unable to retrieve content because the page is
 * navigating and changing the content" when it is called while a navigation is
 * in flight. That is not hypothetical here: the app shell redirects to /login
 * for a beat before the zustand store rehydrates, so a spec that goes straight
 * from `goto()` to `page.content()` reads the DOM exactly during that bounce.
 * It passes on a quiet machine and fails under CI load — the flake that has
 * reddened one arbitrary spec per run.
 *
 * Retrying is what makes it honest: a page that genuinely never settles still
 * throws, and a page that settles on /login still fails the caller's URL
 * assertion. Nothing here weakens an assertion; it only stops reading the DOM
 * at a moment Playwright cannot serve.
 */
export async function settledContent(page: Page, timeout = 15_000): Promise<string> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;

  for (;;) {
    try {
      return await page.content();
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) break;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(250);
    }
  }

  throw lastError;
}
