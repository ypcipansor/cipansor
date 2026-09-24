import { test, expect } from "./fixtures/auth.fixture";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";
import { findStrategicPlan } from "./helpers/seed-data";

test.describe("Integration - Perencanaan to Finance linkage", () => {
  const ACTIVITY_TITLE = `Kegiatan Terintegrasi E2E ${Date.now()}`;

  test.afterAll(async () => {
    // Remove the activity the UI flow created (find it via the plan detail)
    const session = await apiLogin(SEED_USERS.superAdmin);
    const plan = await findStrategicPlan(session);
    const detail = await apiRequest<{
      data: {
        objectives: Array<{ activities: Array<{ id: string; title: string }> }>;
      };
    }>(session, "GET", `/perencanaan/${plan.id}`).catch(() => null);
    for (const objective of detail?.data.objectives ?? []) {
      for (const activity of objective.activities ?? []) {
        if (activity.title === ACTIVITY_TITLE) {
          await apiRequest(
            session,
            "DELETE",
            `/perencanaan/activities/${activity.id}`,
          ).catch(() => {});
        }
      }
    }
  });

  test("should allow linking a planning activity to a finance budget", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Real seeded plan with its objective; budgets and users come from the
    // real API in the dialog selects.
    const plan = await findStrategicPlan(session);

    // Navigate to Plan Detail. Firefox occasionally aborts this navigation
    // (NS_BINDING_ABORTED) when the previous page still has requests in
    // flight — retry once.
    await page
      .goto(`/perencanaan/${plan.id}`)
      .catch(() => page.goto(`/perencanaan/${plan.id}`));
    await page.waitForLoadState("domcontentloaded");

    // Switch to Activities tab
    await page.getByRole("tab", { name: /Program & Kegiatan/i }).click();
    await expect(page.getByText("Daftar Program & Kegiatan")).toBeVisible();

    // Open Create Activity Dialog on the first objective. The objectives load
    // async from the plan detail API after the tab activates, so wait for the
    // add button rather than clicking immediately (flaky on slow CI runners).
    const addActivityButton = page
      .getByRole("button", { name: /\+ Tambah Kegiatan/i })
      .first();
    await addActivityButton.waitFor({ state: "visible", timeout: 15000 });
    await addActivityButton.click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
    // Scope to the dialog heading — "Tambah Kegiatan" also appears on the
    // "+ Tambah Kegiatan" trigger button.
    await expect(
      page.getByRole("heading", { name: "Tambah Kegiatan" }),
    ).toBeVisible();

    // Fill the form including the finance budget linkage
    await page.getByLabel(/Nama Kegiatan/i).fill(ACTIVITY_TITLE);

    // Radix select options animate in; on starved CI runners (webkit
    // especially) they never pass Playwright's "stable" check within the
    // timeout — click with force once visible.
    const pickFirstOption = async () => {
      const option = page.getByRole("option").first();
      await option.waitFor({ state: "visible" });
      await option.click({ force: true });
    };

    // Select priority
    await page.getByLabel(/Prioritas/i).click();
    const priorityOption = page.getByRole("option", { name: /Tinggi/i });
    await priorityOption.waitFor({ state: "visible" });
    await priorityOption.click({ force: true });

    // Select PIC from the real users list
    await page.getByLabel(/Penanggung Jawab/i).click();
    await pickFirstOption();

    // Link to a real seeded finance budget
    await page.getByLabel(/Link ke Anggaran Keuangan/i).click();
    await pickFirstOption();

    // Submit — persists through the real API
    await page.click('button[type="submit"]:has-text("Simpan")');

    // Verify success toast and the new activity rendered in the plan
    await expect(page.locator('text="Kegiatan berhasil dibuat"')).toBeVisible();
    await expect(page.getByText(ACTIVITY_TITLE).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
