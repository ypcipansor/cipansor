import { test, expect, type Page } from "@playwright/test";
import { id } from "../src/locales/id";
import { en } from "../src/locales/en";
import { ar } from "../src/locales/ar";
import { LOCALE_COOKIE } from "../src/locales";

/**
 * Public chatbot widget.
 *
 * These run against a stack with no chatbot provider configured, which is the
 * default and the state production is in until credentials are added. That is
 * the behaviour worth pinning: the widget must be COMPLETELY absent, not
 * present-but-broken. A launcher that opens onto an assistant which errors on
 * the first question is worse than no launcher, because the visitor has already
 * decided to trust it by then.
 *
 * The answering path itself is covered by the API unit tests, which drive it
 * through a deterministic stub provider — an e2e test cannot assert on model
 * output without either a paid API call per run or a fake that proves nothing
 * the unit tests do not already prove.
 */

const LAUNCHER = "button[aria-label='Buka asisten informasi']";

/**
 * Arm the status wait BEFORE navigating, so an absence assertion is real.
 *
 * `toHaveCount(0)` passes the instant the count is zero — including the moment
 * before the status query resolves, when the widget has not rendered yet. On a
 * stack that DOES have a provider configured that turns "stays hidden" into a
 * false pass.
 *
 * The wait must be armed before `page.goto`, not after the footer appears: the
 * status request is fired as soon as the widget mounts, which can be before the
 * footer is visible, and a listener attached afterwards would miss it. Missing
 * it used to be swallowed by a `.catch`, so the assertion could still pass
 * before availability had settled — and cost the full 15s timeout each time.
 * Returning the promise (no catch) means a status response that never arrives
 * fails the test loudly instead of passing on a race.
 */
function whenStatusSettles(page: Page) {
  return page.waitForResponse(
    (r) => r.url().includes("/chatbot/public/status"),
    { timeout: 15000 },
  );
}

test.describe("public chatbot widget", () => {
  test("stays hidden on the homepage when no provider is configured", async ({
    page,
  }) => {
    const settled = whenStatusSettles(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The footer is the widget's mount point, so waiting for it proves the page
    // rendered far enough for the widget to have appeared if it were going to.
    //
    // Located by element, not by the `contentinfo` role: the root layout nests
    // `<footer>` inside `<main>`, and a footer inside a landmark has no
    // implicit contentinfo role. The role-based locator timed out here.
    await expect(page.locator("footer")).toBeVisible({ timeout: 30000 });
    await settled;
    await expect(page.locator(LAUNCHER)).toHaveCount(0);
  });

  test("stays hidden on the public SPMB page", async ({ page }) => {
    const settled = whenStatusSettles(page);
    await page.goto("/public/spmb", { waitUntil: "domcontentloaded" });

    await expect(page).not.toHaveURL(/.*login.*/, { timeout: 15000 });
    await expect(page.locator("footer")).toBeVisible({ timeout: 30000 });
    await settled;
    await expect(page.locator(LAUNCHER)).toHaveCount(0);
  });

  test("never mounts inside the authenticated app shell", async ({ page }) => {
    // The widget talks only to the anonymous public endpoint. Following a
    // logged-in user into the app would invite exactly the confusion the design
    // rules out: an assistant that looks like it can see their data and cannot.
    // `MainLayout` does not render `LandingFooter`, so this is structural —
    // this test is what keeps it that way.
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator(LAUNCHER)).toHaveCount(0);
  });
});

/**
 * The positive path, with the API intercepted.
 *
 * The tests above pass trivially against any build that lacks the widget
 * entirely, so on their own they prove nothing about this feature. These
 * exercise the widget as a visitor meets it, with the contract stubbed at the
 * network boundary — which is also the only honest way to e2e a feature whose
 * real backend costs money per request and answers non-deterministically.
 */
const ANSWER =
  "Pendaftaran dibuka sampai 7 September 2026 dengan biaya Rp 350.000.";

async function stubChatRoutes(
  page: Page,
  { refused = false }: { refused?: boolean } = {},
) {
  await page.route("**/chatbot/public/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { available: true } }),
    }),
  );
  await page.route("**/chatbot/public/ask", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          answer: ANSWER,
          sources: [
            {
              id: "spmb-gelombang-aktif",
              title: "Info SPMB terkini",
              kind: "live",
            },
            {
              id: "spmb-cara-daftar",
              title: "Cara mendaftar",
              url: "/public/spmb",
              kind: "kb",
            },
          ],
          refused,
        },
      }),
    }),
  );
}

/** The public site is id/en/ar on every page; the widget must follow. */
const DICTS = { id, en, ar } as const;

/** Matches `playwright.config.ts`'s baseURL, so the cookie lands on the host. */
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

/**
 * Pick a language the way a visitor's first page load does — through the
 * `app-locale` cookie the root layout reads server-side. Setting it before the
 * first navigation is what makes the widget itself render in that language,
 * rather than flipping after a client-side refresh.
 */
async function setLocale(page: Page, locale: keyof typeof DICTS) {
  await page
    .context()
    .addCookies([{ name: LOCALE_COOKIE, value: locale, url: BASE_URL }]);
}

test.describe("public chatbot widget, assistant available", () => {
  test.beforeEach(async ({ page }) => {
    await stubChatRoutes(page);
  });

  test("answers a question and shows where the answer came from", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.locator(LAUNCHER).click();
    await page
      .getByRole("textbox", { name: "Pertanyaan" })
      .fill("Berapa biaya pendaftaran?");
    await page.getByRole("button", { name: "Kirim" }).click();

    await expect(page.getByText(ANSWER)).toBeVisible({ timeout: 15000 });

    // Sources are displayed, not merely collected. A visitor deciding where to
    // send their child must be able to open the page a claim came from.
    await expect(page.getByText("Sumber:")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Cara mendaftar" }),
    ).toHaveAttribute("href", "/public/spmb");
  });

  test("states plainly that it cannot see personal data", async ({ page }) => {
    // The disclaimer is not decoration. A visitor who believes the widget can
    // look up their child's records will type their child's details into it.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(LAUNCHER).click();

    await expect(
      page.getByText(/tidak memiliki akses ke data pribadi/i),
    ).toBeVisible();
  });
});

/**
 * The same flow, in the other two languages the public site serves.
 *
 * Before this, the en/ar tests stopped at opening the widget: they proved the
 * greeting translated and nothing about submitting a question or escalating.
 * A localized flow that breaks after the first click — a label the widget
 * cannot find, a question that reaches the wrong endpoint — would have shipped
 * unseen. The suggestion chip is the interesting one: it sends its own
 * localized text as the question, which is exactly the path that used to lose
 * every Arabic character in the answer cache.
 */
for (const locale of ["en", "ar"] as const) {
  const dict = DICTS[locale].public.chatbot;

  test.describe(`public chatbot widget in ${locale}`, () => {
    test("submits a localized suggestion and shows the localized answer", async ({
      page,
    }) => {
      await setLocale(page, locale);
      await stubChatRoutes(page);
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await page.getByRole("button", { name: dict.launcherOpen }).click();
      await page.getByRole("button", { name: dict.suggestions.fee }).click();

      await expect(page.getByText(ANSWER)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(dict.sourcesLabel)).toBeVisible();
    });

    test("offers escalation in the visitor's language on a refusal", async ({
      page,
    }) => {
      await setLocale(page, locale);
      await stubChatRoutes(page, { refused: true });
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await page.getByRole("button", { name: dict.launcherOpen }).click();
      await page.getByRole("button", { name: dict.suggestions.fee }).click();

      // The escalation offer only mounts when the API says `refused`. Asserting
      // its localized wording is what proves a refusal in this language is
      // recognized as one.
      await expect(page.getByText(dict.escalation.offerQuestion)).toBeVisible({
        timeout: 15000,
      });
    });
  });
}
