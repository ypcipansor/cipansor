/**
 * The SPMB announcement on the public site: a banner under the header, and a
 * dialog that opens once, a few seconds in.
 *
 * What it says is derived from the units' intakes, so "a registration is open"
 * is the trigger. This spec creates its own open period (and deletes it), so it
 * does not depend on whatever the seed happens to have open on the day it runs.
 *
 * The component steps aside under browser automation (`navigator.webdriver`)
 * unless `localStorage["spmb-announcement-force"]` is "1", so the rest of the
 * e2e suite — which is not about this notice — is not raced by a dialog five
 * seconds into a page load. This spec sets that flag; one test proves the guard
 * itself.
 *
 * WRITES one period, then deletes it; skipped against a production API.
 */
import { test, expect, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";
import { apiLogin, apiRequest, type AuthSession } from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";

const SUPER = DEMO_ACCOUNTS.find((a) => a.roleCode === "SUPER_ADMIN")!;

/** A WIB calendar day, `offset` days from today. */
const wibDay = (offset: number) =>
  new Date(Date.now() + 7 * 3_600_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * Load the origin once, turn the notice back on for this context, and leave the
 * caller to navigate where it means to test. localStorage is per-origin, so the
 * flag set here is seen by the next `goto`.
 */
async function arm(page: Page) {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("spmb-announcement-force", "1"),
  );
}

test.describe("Pengumuman SPMB di situs publik", () => {
  test.describe.configure({ mode: "serial" });
  let admin: AuthSession;
  let periodId = "";
  const runId = `e2e-${Date.now()}`;

  test.beforeAll(async () => {
    test.skip(await isProductionApi(), "API produksi; uji ini menulis data");
    admin = await apiLogin(SUPER);
    const units = (
      await apiRequest<{ data: Array<{ id: string; type: string }> }>(
        admin,
        "GET",
        "/units",
      )
    ).data;
    const tk = units.find((u) => u.type === "TK_QURAN")!;
    const year = (
      await apiRequest<{ data: Array<{ id: string }> }>(
        admin,
        "GET",
        "/academic-years?limit=1",
      )
    ).data[0];
    const { data } = await apiRequest<{ data: { id: string } }>(
      admin,
      "POST",
      "/admissions/periods",
      {
        unitId: tk.id,
        academicYearId: year.id,
        name: `SPMB ${runId}`,
        startDate: wibDay(-1),
        endDate: wibDay(30),
        registrationFee: 0,
      },
    );
    periodId = data.id;
  });

  test.afterAll(async () => {
    if (!admin || !periodId) return;
    const period = await apiRequest<{ data: { waves: Array<{ id: string }> } }>(
      admin,
      "GET",
      `/admissions/periods/${periodId}`,
    ).catch(() => null);
    for (const w of period?.data.waves ?? []) {
      await apiRequest(admin, "DELETE", `/admissions/waves/${w.id}`).catch(
        () => undefined,
      );
    }
    await apiRequest(admin, "DELETE", `/admissions/periods/${periodId}`).catch(
      () => undefined,
    );
  });

  test("stays out of the way of unrelated runs under automation", async ({
    page,
  }) => {
    // No `arm`: this is the default a spec that is not about the notice sees.
    await page.goto("/");
    await expect(page.getByTestId("spmb-announcement-banner")).toHaveCount(0);
    // Past the dialog delay, and still nothing.
    await page.waitForTimeout(6000);
    await expect(page.getByTestId("spmb-announcement-dialog")).toHaveCount(0);
  });

  test("shows a banner under the header when a unit is open", async ({
    page,
  }) => {
    await arm(page);
    await page.goto("/");
    const banner = page.getByTestId("spmb-announcement-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Pendaftaran SPMB");
    await expect(
      banner.getByRole("link", { name: "Daftar sekarang" }),
    ).toHaveAttribute("href", "/public/spmb");
  });

  test("the banner clears the fixed navbar on the homepage and an inner page", async ({
    page,
  }) => {
    // Point 1 of the review: the banner is the first child of `<main>`, so on a
    // fresh (unscrolled) page its top must sit at or below the fixed navbar's
    // bottom edge — never behind it — on both the homepage and a `PublicPage`.
    await arm(page);
    for (const path of ["/", "/profil"]) {
      await page.goto(path);
      const banner = page.getByTestId("spmb-announcement-banner");
      await expect(banner).toBeVisible();
      const bannerBox = await banner.boundingBox();
      const navBox = await page.locator("header.fixed").first().boundingBox();
      expect(bannerBox, `banner box on ${path}`).not.toBeNull();
      expect(navBox, `navbar box on ${path}`).not.toBeNull();
      // 1px tolerance for sub-pixel rounding.
      expect(bannerBox!.y).toBeGreaterThanOrEqual(navBox!.height - 1);
    }
  });

  test("shows the banner on an inner public page too", async ({ page }) => {
    await arm(page);
    await page.goto("/profil");
    await expect(page.getByTestId("spmb-announcement-banner")).toBeVisible();
  });

  test("shows the banner — but no dialog — on the donation page", async ({
    page,
  }) => {
    // /wakaf-infaq builds its own chrome, so it mounts the banner by hand with
    // `withDialog={false}`: a five-second dialog must not interrupt giving.
    await arm(page);
    await page.goto("/wakaf-infaq");
    await expect(page.getByTestId("spmb-announcement-banner")).toBeVisible();
    await page.waitForTimeout(6000);
    await expect(page.getByTestId("spmb-announcement-dialog")).toHaveCount(0);
  });

  test("opens the dialog a few seconds in, not at once", async ({ page }) => {
    await arm(page);
    await page.goto("/");
    const dialog = page.getByTestId("spmb-announcement-dialog");
    await expect(dialog).toHaveCount(0);
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText("SPMB");
  });

  test("dismissing the banner keeps it hidden on the next visit", async ({
    page,
  }) => {
    await arm(page);
    await page.goto("/");
    const banner = page.getByTestId("spmb-announcement-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Tutup pengumuman" }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("spmb-announcement-banner")).toHaveCount(0);
  });

  test("dismissing the dialog keeps it from reopening", async ({ page }) => {
    await arm(page);
    await page.goto("/");
    const dialog = page.getByTestId("spmb-announcement-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "Nanti saja" }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("spmb-announcement-dialog")).toHaveCount(0);
  });

  test("the banner's link reaches the SPMB page", async ({ page }) => {
    await arm(page);
    await page.goto("/");
    await page
      .getByTestId("spmb-announcement-banner")
      .getByRole("link", { name: "Daftar sekarang" })
      .click();
    await expect(page).toHaveURL(/\/public\/spmb/);
  });
});
