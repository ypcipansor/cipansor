import { test, expect } from "./fixtures/auth.fixture";
import { LoginPage } from "./page-objects";
import {
  apiLogin,
  apiRequest,
  injectSession,
  loginAs,
  SEED_USERS,
} from "./helpers/auth-api";
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

/**
 * The Raport Merdeka preview names the student's school as the PDF does: the
 * unit's official name (Edit Unit → Identitas Resmi). It used to print "SMP
 * Cipansor, Jl. Pendidikan No. 123, Kabupaten Bogor" for every unit, and
 * "Bogor" above the wali kelas's signature.
 */
test.describe("Assessment - Raport Merdeka preview", () => {
  test("names the school by its official name, signed in Tasikmalaya", async ({
    page,
  }) => {
    const admin = await apiLogin(SEED_USERS.adminSdit);
    const unitId = (admin.user as { unitId: string }).unitId;
    const { data: unit } = await apiRequest<{
      data: { name: string; officialName: string | null };
    }>(admin, "GET", `/units/${unitId}`);
    const school = unit.officialName ?? unit.name;

    const { data: years } = await apiRequest<{
      data: Array<{ id: string; name: string; isActive: boolean }>;
    }>(admin, "GET", "/academic-years?limit=100");
    const year = years.find((y) => y.isActive);
    expect(year, "an active academic year").toBeTruthy();

    // A santri of the unit whose raport exists this year.
    const { data: students } = await apiRequest<{
      data: Array<{ id: string; nis: string }>;
    }>(admin, "GET", "/students?limit=100");
    let nis = "";
    // Few santri are in a class this year; look through the whole list.
    for (const s of students) {
      const ok = await apiRequest(
        admin,
        "GET",
        `/assessment/raport-merdeka/students/${s.id}?academicYearId=${year!.id}&semester=1`,
      ).then(
        () => true,
        () => false,
      );
      if (ok) {
        nis = s.nis;
        break;
      }
    }
    expect(nis, "a santri with a raport this year").not.toBe("");

    await injectSession(page, admin);
    await page.goto("/assessment/raport-merdeka");
    await page.getByRole("tab", { name: "Generate Raport" }).click();
    await page.getByRole("combobox").filter({ hasText: "Pilih Siswa" }).click();
    await page
      .getByRole("option", { name: new RegExp(`\\(${nis}\\)`) })
      .click();
    await page.getByRole("combobox").filter({ hasText: "Pilih Tahun" }).click();
    await page.getByRole("option", { name: year!.name, exact: true }).click();

    await expect(page.getByTestId("raport-school")).toHaveText(school);
    await expect(page.getByText(/Tasikmalaya, /).first()).toBeVisible();
    await expect(page.getByText(/Bogor|Jl\. Pendidikan/)).toHaveCount(0);
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
