import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";

test.describe("Student Lifecycle Integration", () => {
  test("should display lead scoring in marketing dashboard", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Real high-priority leads scored by the marketing service
    const leads = await apiRequest<{
      data: Array<{ id: string; fullName: string; leadScore: number }>;
    }>(session, "GET", "/marketing/leads/high-priority");
    const top = leads.data?.[0];
    expect(top, "seed should provide a scored lead").toBeTruthy();

    await page.goto("/marketing");

    // The Lead Scoring widget renders the real top lead
    await expect(page.getByText("Prioritas Tindak Lanjut")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(top!.fullName).first()).toBeVisible();
    await expect(
      page.getByText(`Score: ${top!.leadScore}`).first(),
    ).toBeVisible();
  });

  test("should display boarding harmony and holistic radar in Student 360", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    const years = await apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      "/academic-years?isActive=true",
    );
    const academicYearId = years.data?.[0]?.id;
    expect(
      academicYearId,
      "an active academic year must be seeded",
    ).toBeTruthy();

    // Find a boarding student that has both a room assignment and computable
    // holistic analytics.
    const students = await apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      "/students?limit=30",
    );

    let target:
      { id: string; holisticScore: number; harmonyScore: number } | undefined;
    for (const s of students.data ?? []) {
      const assignment = await apiRequest<{
        data: Array<{ roomId: string }>;
      }>(
        session,
        "GET",
        `/dormitories/assignments/list?studentId=${s.id}&isActive=true&limit=1`,
      ).catch(() => null);
      const roomId = assignment?.data?.[0]?.roomId;
      if (!roomId) continue;

      const holistic = await apiRequest<{
        data: { holisticScore: number };
      }>(
        session,
        "GET",
        `/assessment/students/${s.id}/holistic?academicYearId=${academicYearId}`,
      ).catch(() => null);
      const social = await apiRequest<{
        data: { harmonyScore: number };
      }>(session, "GET", `/dormitories/rooms/${roomId}/social-analytics`).catch(
        () => null,
      );
      if (
        holistic?.data?.holisticScore != null &&
        social?.data?.harmonyScore != null
      ) {
        target = {
          id: s.id,
          holisticScore: holistic.data.holisticScore,
          harmonyScore: social.data.harmonyScore,
        };
        break;
      }
    }

    expect(
      target,
      "seed should provide a boarding student with holistic data",
    ).toBeTruthy();
    if (!target) return;

    await page.goto(`/students/${target.id}/360`);

    // Holistic radar card renders the real computed score
    await expect(
      page.getByText("Analisis Perkembangan Holistik").first(),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByText(String(target.holisticScore)).first(),
    ).toBeVisible();

    // Boarding tab. Radix tab triggers animate; on WebKit under CI load they
    // never pass Playwright's "stable" gate within the timeout — force-click
    // once visible.
    const boardingTab = page.getByRole("tab", { name: /Asrama/i });
    await boardingTab.waitFor({ state: "visible" });
    await boardingTab.click({ force: true });

    await expect(page.getByText("Dinamika Sosial Kamar")).toBeVisible();
    await expect(
      page.getByText(`${target.harmonyScore}%`).first(),
    ).toBeVisible();
  });
});
