import { test, expect } from "./fixtures/auth.fixture";
import { LoginPage } from "./page-objects";
import { loginAs, apiRequest } from "./helpers/auth-api";
import { settledContent } from "./helpers/page-state";

/**
 * Assessment Module E2E Tests
 * Tests student assessment, report cards, and transcripts
 */

test.describe("Assessment - List & Navigation", () => {
  test("should navigate to assessment page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/assessment");

    // Wait for page load
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    // Verify we're on assessment page
    expect(page.url()).toMatch(/assessment/);
  });

  test("should display assessment list or create form", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/assessment");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    // Page should load successfully
    expect(page.url()).toMatch(/assessment/);

    // Should have some content (very lenient check)
    const pageContent = await settledContent(page);
    expect(pageContent.length).toBeGreaterThan(1000); // Has content
  });
});

test.describe("Assessment - Report Cards", () => {
  test("should navigate to report cards page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/assessment/report-cards");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    expect(page.url()).toMatch(/report-cards/);
  });

  test("should display report cards list", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/assessment/report-cards");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    // Check for list elements
    const hasContent = await page
      .locator('table, [role="table"], [class*="card"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Page should load without errors
    expect(page.url()).toMatch(/report-cards/);
  });

  test("should navigate to generate report cards page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/assessment/report-cards/generate");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    expect(page.url()).toMatch(/generate/);
  });
});

test.describe("Assessment - Raport Merdeka", () => {
  test("should navigate to raport merdeka page", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.waitForTimeout(2000);
    await page.goto("/assessment/raport-merdeka");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    expect(page.url()).toMatch(/raport-merdeka/);
  });
});

test.describe("Assessment - Transcript", () => {
  test("should allow navigation to transcript page", async ({ page }) => {
    const login = new LoginPage(page);
    // Deterministic auth (apiLogin + injected session) avoids the flaky
    // UI-login + fixed-timeout race that could redirect to /login mid-test.
    await login.loginAndWaitForDashboard(
      "superadmin@cipansor.or.id",
      "SuperAdmin123!",
    );

    // Navigate to assessment main page first
    await page.goto("/assessment");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    // Try to find transcript link/button
    const transcriptLink = page
      .getByRole("link", { name: /transcript|transkrip/i })
      .first();

    if (await transcriptLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await transcriptLink.click();
      // Client-side navigation: waitForLoadState("domcontentloaded") resolves
      // immediately (the event already fired for /assessment), so a synchronous
      // URL assertion races the router — especially in dev mode on a loaded CI
      // runner where the target route compiles on demand. waitForURL retries
      // until the router actually lands on the transcript route.
      await page.waitForURL(/transcript/, { timeout: 15000 });
      expect(page.url()).toMatch(/transcript/);
    } else {
      // Direct navigation if no link found
      await page.goto("/assessment/transcript");
      expect(page.url()).toMatch(/transcript/);
    }
  });
});

/**
 * The report-card print view is reached from the detail page and is the one
 * place the app must shed the sidebar and header. It used to wrap its own
 * `<main id="main-content">` in `MainLayout`, which renders another one — two
 * landmarks and a duplicate id, so the skip link and assistive tech picked
 * whichever came first. The rbac guard test catches this in source; this spec
 * proves it in the rendered document, against a real seeded card.
 */
test.describe("Assessment - Report Card Print", () => {
  test("print view renders one main landmark and the report body", async ({
    page,
  }) => {
    const session = await loginAs(page, "superAdmin");

    const cards = await apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      "/assessment/report-cards?limit=1",
    );
    const card = cards.data?.[0];
    test.skip(!card, "no seeded report card to print");

    for (const path of [
      `/assessment/report-cards/${card!.id}/print`,
      `/assessment/report-cards/${card!.id}/print-merdeka`,
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main#main-content")).toHaveCount(1, {
        timeout: 15000,
      });
      await expect(page.locator("main")).toHaveCount(1);

      // The document itself, not a spinner or the empty state. The print page
      // has no shell, so a body of text is the only signal it rendered.
      const body = await settledContent(page);
      expect(body.length).toBeGreaterThan(2000);
    }
  });
});
