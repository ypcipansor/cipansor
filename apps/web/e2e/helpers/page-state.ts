import type { Page } from "@playwright/test";

/**
 * The document a browser serves before the first byte of a navigation's HTML
 * arrives. `page.content()` does NOT throw at that instant — it happily returns
 * this placeholder, which is why `settledContent` returned ~39 characters on
 * Firefox and WebKit and reddened `page-state-helper.spec.ts` deterministically
 * (Chromium happened to have parsed the document by the time the read landed).
 * An empty body is the signal that the document has not settled yet.
 */
const hasEmptyBody = (html: string): boolean =>
  /<body[^>]*>\s*<\/body>/i.test(html);

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
 * Two states are "not settled yet" and both are retried: the throw above, and
 * the empty placeholder `page.content()` returns instead of throwing when the
 * read lands on a navigation that has committed but not yet delivered HTML.
 * Retrying is what makes it honest: a page that genuinely never settles still
 * throws or returns an empty document, and a page that settles on /login still
 * fails the caller's URL assertion. Nothing here weakens an assertion; it only
 * stops reading the DOM at a moment Playwright cannot serve.
 */
export async function settledContent(
  page: Page,
  timeout = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  let lastContent = "";

  for (;;) {
    try {
      const html = await page.content();
      if (html && !hasEmptyBody(html)) return html;
      lastContent = html;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(250);
  }

  if (lastError) throw lastError;
  return lastContent;
}
