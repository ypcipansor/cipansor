import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";
import { findStrategicPlan } from "./helpers/seed-data";

test.describe("Perencanaan & Risk Management Integration", () => {
  test("can navigate to create risk from a strategic plan", async ({
    page,
  }) => {
    const session = await loginAs(page, "superAdmin");
    const plan = await findStrategicPlan(session);

    await page.goto(`/perencanaan/${plan.id}`);

    // Verify we are on the detail page for the real seeded plan
    await expect(page.locator("h1")).toContainText(plan.title);

    // Click on the 'Faktor Risiko' tab
    await page.getByRole("tab", { name: /Faktor Risiko/ }).click();

    // Verify the tab content is visible
    await expect(
      page.locator("text=Identifikasi & Pemetaan Risiko"),
    ).toBeVisible();

    // Click on the 'Identifikasi Risiko Baru' button
    const identifyBtn = page.getByRole("button", {
      name: "Identifikasi Risiko Baru",
    });
    await expect(identifyBtn).toBeVisible();
    await identifyBtn.click();

    // Check that we navigated to the correct URL, carrying the plan id
    await expect(page).toHaveURL(
      new RegExp(`/risk-management/create\\?strategicPlanId=${plan.id}`),
    );

    // Verify the alert indicating the risk will be linked to a strategic plan
    await expect(
      page.locator("text=Ditautkan ke Perencanaan Strategis"),
    ).toBeVisible();
  });
});
