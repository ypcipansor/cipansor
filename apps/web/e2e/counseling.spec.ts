import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";

test.describe("Counseling Module", () => {
  test("should load counseling dashboard correctly", async ({ page }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Real seeded counseling records + statistics
    const list = await apiRequest<{
      data: Array<{
        id: string;
        title: string;
        student?: { user?: { name: string } };
      }>;
    }>(session, "GET", "/counseling?limit=10");
    const stats = await apiRequest<{ data: { totalSessions: number } }>(
      session,
      "GET",
      "/counseling/statistics",
    );
    const firstSession = list.data?.[0];

    await page.goto("/counseling");

    await expect(
      page.getByRole("heading", { name: "Bimbingan Konseling" }),
    ).toBeVisible();
    await expect(page.getByText("Total Sesi")).toBeVisible();
    await expect(
      page
        .locator("p.text-2xl", { hasText: String(stats.data.totalSessions) })
        .first(),
    ).toBeVisible();

    // The seeded session renders in the list
    if (firstSession) {
      await expect(page.getByText(firstSession.title).first()).toBeVisible({
        timeout: 15000,
      });
      const studentName = firstSession.student?.user?.name;
      if (studentName) {
        await expect(page.getByText(studentName).first()).toBeVisible();
      }
    }
  });

  test("should navigate to create session page", async ({ page }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);
    await page.goto("/counseling");

    await page.getByRole("link", { name: "Buat Sesi" }).click();
    await expect(page).toHaveURL(/\/counseling\/new/);
  });
});
