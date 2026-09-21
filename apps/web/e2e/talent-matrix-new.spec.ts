import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test.describe("Talent Management Enhancements", () => {
  test("should render the 9-box talent matrix grid", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/talenta/matrix");

    // Wait for the page to load - check for header text (regex because it might be longer)
    await expect(page.getByText(/Talent Matrix/i).first()).toBeVisible();

    // Summary card fed by the real /api/talenta/analytics endpoint
    await expect(page.getByText(/Total Talenta/i).first()).toBeVisible();

    // 9-box cell labels
    await expect(page.getByText("High Potential").first()).toBeVisible();
    await expect(page.getByText("Key Talent").first()).toBeVisible();

    // The seeded HIGH_POTENTIAL profile (Ustadz Ahmad) renders as initials "UA"
    await expect(page.getByText("UA", { exact: true }).first()).toBeVisible();
  });
});
