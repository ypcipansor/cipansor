import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";
import { findStrategicPlan } from "./helpers/seed-data";

/**
 * True cross-module integration: create a risk linked to a strategic plan,
 * attach an internal-audit finding to that risk through the pengawasan API,
 * then verify the risk detail page renders both linkages.
 */
test("Risk - Audit Integration", async ({ page }) => {
  test.setTimeout(60000);

  const session = await apiLogin(SEED_USERS.superAdmin);
  await injectSession(page, session);

  const stamp = Date.now();
  const plan = await findStrategicPlan(session);

  const risk = await apiRequest<{ data: { id: string } }>(
    session,
    "POST",
    "/risk",
    {
      code: `RSK-E2E-${stamp}`,
      description: "E2E: potential cash leak in canteen operations",
      category: "FINANCIAL",
      likelihood: "POSSIBLE",
      impact: "MAJOR",
      unitId: plan.unitId,
      strategicPlanId: plan.id,
    },
  );

  const audit = await apiRequest<{ data: { id: string } }>(
    session,
    "POST",
    "/pengawasan",
    {
      title: `Audit Operasional E2E ${stamp}`,
      auditType: "OPERATIONAL",
      plannedDate: new Date().toISOString(),
      unitId: plan.unitId,
      riskId: risk.data.id,
    },
  );

  const finding = await apiRequest<{ data: { id: string } }>(
    session,
    "POST",
    "/pengawasan/findings",
    {
      auditId: audit.data.id,
      findingNumber: `FIND-E2E-${stamp}`,
      title: "Missing receipts",
      description: "Receipts absent for multiple canteen transactions.",
      severity: "MAJOR",
      category: "Keuangan",
      linkToRiskId: risk.data.id,
    },
  );

  try {
    await page.goto(`/risk-management/${risk.data.id}`);

    // Linked strategic objective
    await expect(page.locator("text=Strategic Objective")).toBeVisible();
    await expect(page.locator(`text=${plan.title}`)).toBeVisible();

    // Linked audit finding
    await expect(page.locator("text=Audit Findings")).toBeVisible();
    await expect(
      page.locator(`text=FIND-E2E-${stamp}: Missing receipts`).first(),
    ).toBeVisible();
    await expect(page.locator("text=MAJOR").first()).toBeVisible();
  } finally {
    // Leave the seeded data as we found it
    await apiRequest(
      session,
      "DELETE",
      `/pengawasan/findings/${finding.data.id}`,
    ).catch(() => {});
    await apiRequest(session, "DELETE", `/pengawasan/${audit.data.id}`).catch(
      () => {},
    );
    await apiRequest(session, "DELETE", `/risk/${risk.data.id}`).catch(
      () => {},
    );
  }
});
