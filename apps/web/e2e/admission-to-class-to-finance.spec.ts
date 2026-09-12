import { test, expect } from "@playwright/test";
import { apiLogin, apiRequest, injectSession, SEED_USERS } from "./helpers/auth-api";

test.describe("End-to-End: PPDB Registration to Finance & Medical", () => {
  test("should execute the integrated student onboarding orchestrator", async ({ page }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Resolve a real admission period + its unit, then create a throwaway
    // ACCEPTED registrant to onboard for real.
    const periods = await apiRequest<{
      data: Array<{ id: string; unitId: string }>;
    }>(session, "GET", "/admissions/periods");
    const period = periods.data?.[0];
    expect(period, "seed should provide an admission period").toBeTruthy();
    if (!period) return;

    // Unique parent contact per run — onboarding provisions a parent account,
    // so reused contact details would collide across runs.
    const stamp = Date.now();
    const fullName = `Budi Onboard E2E ${stamp}`;
    const created = await apiRequest<{ data: { id: string; registrationNo: string } }>(
      session,
      "POST",
      "/admissions/registrants",
      {
        admissionPeriodId: period.id,
        fullName,
        gender: "MALE",
        birthPlace: "Tasikmalaya",
        birthDate: "2015-05-01T00:00:00.000Z",
        address: "Jl. Pendaftaran E2E No. 1",
        fatherName: `Bapak Budi ${stamp}`,
        motherName: `Ibu Budi ${stamp}`,
        parentName: `Bapak Budi ${stamp}`,
        parentPhone: `0813${String(stamp).slice(-8)}`,
        parentEmail: `wali.e2e.${stamp}@example.com`,
        email: `budi.e2e.${stamp}@example.com`,
      },
    );
    const registrantId = created.data.id;
    // The integrated onboarding button only shows for ACCEPTED registrants.
    await apiRequest(session, "PATCH", `/admissions/registrants/${registrantId}/status`, {
      status: "ACCEPTED",
    });

    // Acceptance is an academic decision, not daftar ulang. Enrolment is gated
    // on the fee being settled, so record it — this is the step a clerk does
    // at the front desk before onboarding.
    await apiRequest(
      session,
      "PATCH",
      `/admissions/registrants/${registrantId}/registration-fee`,
      { note: "Lunas via E2E" },
    );

    try {
      // Admin opens the registration listing, finds the registrant, opens detail.
      // /ppdb was renamed to /spmb in #439 (next.config.ts still redirects the
      // old path, but a test should name the route it means).
      await page.goto("/spmb/registrations");
      await expect(page.getByRole("heading", { name: /Pendaftar/i })).toBeVisible();

      await page.getByPlaceholder(/cari|search/i).first().fill(fullName).catch(() => {});
      await page.getByRole("link", { name: fullName }).first().click();

      await expect(page.getByRole("heading", { name: fullName })).toBeVisible({ timeout: 15000 });

      // The integrated onboarding button is present because status is ACCEPTED.
      const onboardButton = page.getByRole("button", {
        name: /Jalankan Onboarding Terpadu/i,
      });
      await expect(onboardButton).toBeVisible();

      // Execute the real orchestrator (creates a student/user, enrolls, sets
      // the registrant to ENROLLED).
      await onboardButton.click();

      await expect(
        page.getByText("Siswa berhasil di-Onboard secara terpadu!"),
      ).toBeVisible({ timeout: 20000 });

      // Verify the workflow persisted: the registrant is now ENROLLED and a
      // student record exists.
      const detail = await apiRequest<{
        data: { status: string; studentId?: string | null };
      }>(session, "GET", `/admissions/registrants/${registrantId}`);
      expect(detail.data.status).toBe("ENROLLED");
      expect(detail.data.studentId, "onboarding should link a created student").toBeTruthy();
    } finally {
      // Best-effort cleanup of the throwaway registrant (the created student is
      // cleared by the next full-suite reseed).
      await apiRequest(session, "DELETE", `/admissions/registrants/${registrantId}`).catch(() => {});
    }
  });
});
