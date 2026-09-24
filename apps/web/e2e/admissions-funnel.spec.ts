import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test.describe("Unified Admissions Funnel", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
  });

  test("should display unified admissions dashboard", async ({ page }) => {
    await page.goto("/admissions");

    await expect(page.getByText("Unified Admissions Management")).toBeVisible();

    // Real seeded admission period and registrant.
    //
    // Matched by shape, not by literal. The seed used to hardcode
    // "PSB 2024/2025 Gelombang 1", so this assertion pinned the test to the
    // year the seed was written and broke the moment the calendar started
    // being derived from the clock. Asserting the shape keeps what this test
    // is actually for — the dashboard renders the real seeded period rather
    // than an empty state — without either side having to know the year.
    //
    // Deliberately not recomputing the expected name from the seed's own
    // helper: a test that derives its expectation the same way the code does
    // passes happily when both are wrong.
    await expect(
      page.getByText(/SPMB \d{4}\/\d{4} Gelombang 1/).first(),
    ).toBeVisible({
      timeout: 15000,
    });
    // Registrants render by registration number in the "Pendaftar Terbaru" list
    await expect(page.getByText(/REG-\d{4}-\d{4}/).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
