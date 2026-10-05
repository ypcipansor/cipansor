import { test, expect } from "@playwright/test";

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
 * Wait until the widget has had its answer, so an absence assertion is real.
 *
 * `toHaveCount(0)` passes the instant the count is zero — including the moment
 * before the status query resolves, when the widget has not rendered yet. On a
 * stack that DOES have a provider configured that turns "stays hidden" into a
 * false pass. Waiting for the status response first means the widget has already
 * decided, so a count of zero is the decision and not the gap before it.
 */
async function statusSettled(page: import("@playwright/test").Page) {
  await page
    .waitForResponse((r) => r.url().includes("/chatbot/public/status"), {
      timeout: 15000,
    })
    .catch(() => undefined);
}

test.describe("public chatbot widget", () => {
  test("stays hidden on the homepage when no provider is configured", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The footer is the widget's mount point, so waiting for it proves the page
    // rendered far enough for the widget to have appeared if it were going to.
    //
    // Located by element, not by the `contentinfo` role: the root layout nests
    // `<footer>` inside `<main>`, and a footer inside a landmark has no
    // implicit contentinfo role. The role-based locator timed out here.
    await expect(page.locator("footer")).toBeVisible({ timeout: 30000 });
    await statusSettled(page);
    await expect(page.locator(LAUNCHER)).toHaveCount(0);
  });

  test("stays hidden on the public SPMB page", async ({ page }) => {
    await page.goto("/public/spmb", { waitUntil: "domcontentloaded" });

    await expect(page).not.toHaveURL(/.*login.*/, { timeout: 15000 });
    await expect(page.locator("footer")).toBeVisible({ timeout: 30000 });
    await statusSettled(page);
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
test.describe("public chatbot widget, assistant available", () => {
  const ANSWER =
    "Pendaftaran dibuka sampai 7 September 2026 dengan biaya Rp 350.000.";

  test.beforeEach(async ({ page }) => {
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
            refused: false,
          },
        }),
      }),
    );
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

  test("names itself a test copy when the provider is a deterministic double", async ({
    page,
  }) => {
    // On staging the assistant answers from a copy of the real corpus, not a
    // model. The widget says so, so a walkthrough never mistakes a stub for a
    // release-ready assistant.
    await page.route("**/chatbot/public/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { available: true, testProvider: true },
        }),
      }),
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(LAUNCHER).click();

    await expect(page.getByTestId("chatbot-test-provider")).toBeVisible();
  });

  test("does not name itself a test copy when a real model answers", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(LAUNCHER).click();

    await expect(page.getByTestId("chatbot-test-provider")).toHaveCount(0);
  });
});
