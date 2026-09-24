import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";

interface TahfidzSummaryResponse {
  data: {
    summary: {
      totalAyahMemorized: number;
      juzCoveredCount: number;
      surahCoveredCount: number;
    };
    surahCovered: Array<{ surahNumber: number; surahName: string }>;
  };
}

test.describe("Tahfidz Transcript", () => {
  test("should display tahfidz summary from the real backend", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Find a real student that has tahfidz records to assert against
    const students = await apiRequest<{
      data: Array<{ id: string; user?: { name: string }; name?: string }>;
    }>(session, "GET", "/students?limit=40");

    let target:
      { name: string; surahName: string; totalAyah: number } | undefined;
    for (const s of students.data ?? []) {
      const summary = await apiRequest<TahfidzSummaryResponse>(
        session,
        "GET",
        `/tahfidz/summary/${s.id}`,
      ).catch(() => null);
      const surah = summary?.data?.surahCovered?.[0];
      if (surah) {
        target = {
          name: s.user?.name ?? s.name ?? "",
          surahName: surah.surahName,
          totalAyah: summary!.data.summary.totalAyahMemorized,
        };
        break;
      }
    }
    expect(
      target,
      "seed should provide a student with tahfidz records",
    ).toBeTruthy();
    if (!target) return;

    await page.goto("/students/transcript");

    // Student list is populated from the real API
    await expect(page.getByText(target.name).first()).toBeVisible({
      timeout: 15000,
    });
    await page.getByText(target.name).first().click();

    // Transcript tabs appear once a student is selected
    await expect(
      page.locator('button[role="tab"]:has-text("Tahfidz")'),
    ).toBeVisible();
    await page.click('button[role="tab"]:has-text("Tahfidz")');

    // Real tahfidz summary values render
    await expect(
      page.getByText(String(target.totalAyah)).first(),
    ).toBeVisible();
    await expect(page.getByText(target.surahName).first()).toBeVisible();
  });
});
