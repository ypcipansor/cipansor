import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  loginAs,
  SEED_USERS,
} from "./helpers/auth-api";
import { findStrategicPlan } from "./helpers/seed-data";

test.describe("GRC Integrated Workflow", () => {
  test("should trigger audit finding from low sharia audit score", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    const stamp = Date.now();
    const complianceTitle = `Zakat Management E2E ${stamp}`;
    // Reuse the seeded unit the strategic plan lives on
    const plan = await findStrategicPlan(session);

    // A PLANNED SYARIAH internal audit must exist for the auto-finding hook
    const internalAudit = await apiRequest<{ data: { id: string } }>(
      session,
      "POST",
      "/pengawasan",
      {
        title: `Audit Kepatuhan Syariah E2E ${stamp}`,
        auditType: "SYARIAH",
        plannedDate: new Date().toISOString(),
        unitId: plan.unitId,
      },
    );

    const compliance = await apiRequest<{ data: { id: string } }>(
      session,
      "POST",
      "/syariah",
      {
        category: "MUAMALAH",
        title: complianceTitle,
        description: "E2E: pemeriksaan pengelolaan zakat",
        unitId: plan.unitId,
      },
    );

    try {
      // Real workflow: a sharia audit scoring below 70 must auto-create a
      // MAJOR finding on the planned SYARIAH internal audit.
      await apiRequest(session, "POST", "/syariah/audits", {
        complianceId: compliance.data.id,
        auditDate: new Date().toISOString(),
        findings: "Skor kepatuhan rendah pada pengelolaan zakat (E2E).",
        score: 55,
      });

      // The compliance item renders on the syariah page
      await page.goto("/syariah");
      await expect(page.getByText(complianceTitle).first()).toBeVisible({
        timeout: 15000,
      });

      // ...and the auto-created finding renders under pengawasan
      await page.goto("/pengawasan");
      await expect(
        page.getByText(`Ketidakpatuhan Syariah: ${complianceTitle}`).first(),
      ).toBeVisible({ timeout: 15000 });
    } finally {
      // Remove the auto-created finding, then the audit + compliance rows
      const auditDetail = await apiRequest<{
        data: { findings?: Array<{ id: string }> };
      }>(session, "GET", `/pengawasan/${internalAudit.data.id}`).catch(
        () => null,
      );
      for (const finding of auditDetail?.data.findings ?? []) {
        await apiRequest(
          session,
          "DELETE",
          `/pengawasan/findings/${finding.id}`,
        ).catch(() => {});
      }
      await apiRequest(
        session,
        "DELETE",
        `/pengawasan/${internalAudit.data.id}`,
      ).catch(() => {});
      await apiRequest(
        session,
        "DELETE",
        `/syariah/${compliance.data.id}`,
      ).catch(() => {});
    }
  });

  test("should display detailed sharia breakdown in GRC dashboard", async ({
    page,
  }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/grc-dashboard");

    // The breakdown card aggregates the real seeded compliance data
    await expect(
      page.getByText("Sharia Compliance Detailed Breakdown"),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("Performance score by category")).toBeVisible();
    // Seeded compliance is MUAMALAH; its category row shows a percentage score
    await expect(page.getByText("MUAMALAH").first()).toBeVisible();
    await expect(page.getByText(/[\d.]+%/).first()).toBeVisible();
  });
});
