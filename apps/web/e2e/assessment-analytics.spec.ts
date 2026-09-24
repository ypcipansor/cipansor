import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";

test.describe("Assessment Analytics", () => {
  test("should render analytics statistics and chart", async ({ page }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Use a real seeded GRADED exam and its real analytics
    const exams = await apiRequest<{
      data: Array<{ id: string; title: string; status: string }>;
    }>(session, "GET", "/assessment/exams?limit=50");
    const exam = exams.data?.find((e) => e.status === "GRADED");
    expect(exam, "seed should provide a graded exam").toBeTruthy();
    if (!exam) return;

    const analytics = await apiRequest<{
      data: {
        highestScore: number;
        lowestScore: number;
        topStudents: Array<{ studentName: string }>;
      };
    }>(session, "GET", `/assessment/exams/${exam.id}/analytics`);

    await page.goto(`/assessment/${exam.id}`);

    // Wait for header to ensure page loaded
    await expect(page.getByRole("heading", { name: exam.title })).toBeVisible();

    // Click Statistics Tab
    await page.getByRole("tab", { name: /Statistik/i }).click();

    // Summary cards render the real analytics values
    await expect(
      page.getByText("Nilai Tertinggi", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Nilai Terendah", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Rata-rata", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Persentase Lulus", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("paragraph")
        .filter({ hasText: String(analytics.data.highestScore) })
        .first(),
    ).toBeVisible();

    // Verify chart visibility
    await expect(page.locator(".recharts-responsive-container")).toBeVisible();

    // Verify top students section shows the real best performer
    await expect(
      page.getByText("Santri Nilai Tertinggi", { exact: true }).first(),
    ).toBeVisible();
    const topStudent = analytics.data.topStudents?.[0]?.studentName;
    expect(topStudent, "analytics should report a top student").toBeTruthy();
    await expect(page.getByText(topStudent!).first()).toBeVisible();
  });
});
