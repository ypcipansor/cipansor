import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";

test.describe("Student Graduation Flow", () => {
  const suffix = Date.now();

  test("graduate an active student via the detail page", async ({ page }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Pick a real unit for the new student.
    const units = await apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      "/units",
    );
    const unitId = units.data?.[0]?.id;
    expect(unitId, "a unit must be seeded").toBeTruthy();

    // Create a fresh active student carrying a permanent identifier (NISN) so
    // the create-student contract (at least one of NISN/NIK) is satisfied.
    const nisn = `00${String(suffix).slice(-10)}`;
    const created = await apiRequest<{ data: { id: string; status: string } }>(
      session,
      "POST",
      "/students",
      {
        name: `Graduation Test ${suffix}`,
        unitId,
        nisn,
        nik: "",
        gender: "MALE",
        birthPlace: "Tasikmalaya",
        birthDate: "2011-05-17T00:00:00.000Z",
        address: "Jl. Graduation Test No. 1",
        parentName: "Bapak Graduation",
        parentPhone: "081234567890",
        enrollmentDate: new Date().toISOString(),
      },
    );
    const studentId = created.data?.id;
    expect(studentId, "student should be created").toBeTruthy();

    try {
      await page.goto(`/students/${studentId}`);
      const graduateButton = page.getByRole("button", {
        name: /Tandai Lulus/i,
      });
      await expect(graduateButton).toBeVisible({ timeout: 15000 });

      // The page confirms via window.confirm before graduating.
      page.once("dialog", (dialog) => dialog.accept());
      await graduateButton.click();

      // On success the mutation refreshes the route; the button disappears
      // because the student's status is now alumni/graduated.
      await expect(graduateButton).toBeHidden({ timeout: 15000 });

      const after = await apiRequest<{ data: { status: string } }>(
        session,
        "GET",
        `/students/${studentId}`,
      );
      expect(["alumni", "ALUMNI", "graduated", "GRADUATED"]).toContain(
        after.data?.status,
      );
    } finally {
      // Clean up the throwaway student so the shared dev DB stays tidy.
      await apiRequest(session, "DELETE", `/students/${studentId}`).catch(
        () => undefined,
      );
    }
  });
});
