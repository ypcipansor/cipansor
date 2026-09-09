import { test, expect } from "@playwright/test";
import { apiLogin, apiRequest, injectSession, loginAs, SEED_USERS } from "./helpers/auth-api";

test.describe("Integrated School Management Flow", () => {
  test("Unified Raport - Access and Display Data", async ({ page }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Resolve a real student + academic year, then compare the page against
    // what the unified-raport API actually aggregates for them.
    const students = await apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      "/students?limit=20",
    );
    expect(students.data?.length, "seed should provide students").toBeGreaterThan(0);

    const years = await apiRequest<{ data: Array<{ id: string; isActive: boolean }> }>(
      session,
      "GET",
      "/academic-years",
    );
    const year = years.data?.find((y) => y.isActive) ?? years.data?.[0];
    expect(year, "seed should provide an academic year").toBeTruthy();

    // Not every student is enrolled in the active year — find one the
    // aggregation endpoint can actually build a raport for.
    type Raport = { data: { student: { name: string }; school: { name: string } } };
    let student: { id: string } | undefined;
    let raport: Raport | undefined;
    for (const candidate of students.data) {
      try {
        raport = await apiRequest<Raport>(
          session,
          "GET",
          `/assessment/unified-raport/students/${candidate.id}?academicYearId=${year.id}&semester=1`,
        );
        student = candidate;
        break;
      } catch {
        // Not enrolled in this year — try the next student
      }
    }
    expect(student, "seed should provide an enrolled student").toBeTruthy();
    if (!student || !raport) return;

    await page.goto(
      `/assessment/unified-raport/${student.id}?academicYearId=${year.id}&semester=1`,
    );

    // The page renders exactly what the aggregation endpoint returned
    await expect(page.getByText("Pratinjau Rapor Terpadu")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(raport.data.school.name).first()).toBeVisible();
    await expect(page.getByText(raport.data.student.name).first()).toBeVisible();
  });

  test("Talent Management - Display Talent Matrix", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/talenta");

    // Dikurung ke konten landmark (`main`), sehingga label submenu serupa di
    // bilah sisi tidak ikut cocok. Judul di konten sebenarnya adalah
    // "Matriks Talenta (9-Box Grid)", jadi pencocokan harus substring (bukan
    // exact) agar tidak terlewat.
    await expect(
      page.getByRole("main").getByText("Matriks Talenta", { exact: false }).first(),
    ).toBeVisible();

    // Scope to the content landmark and match the initials exactly. `text=UA`
    // is Playwright's unquoted engine — a case-insensitive *substring* — so it
    // also matched every sidebar item containing "ua" ("Konsolidasi Keuangan",
    // "Aduan & Aspirasi", "Pesan Orang Tua", …). Those come first in the DOM,
    // so once this page gained the app shell `.first()` resolved to a menu
    // button and the hover below never touched the avatar.
    const main = page.getByRole("main");

    // The seeded HIGH_POTENTIAL profile (Ustadz Ahmad) renders as initials "UA"
    const avatar = main.getByText("UA", { exact: true }).first();
    await expect(avatar).toBeVisible();

    // Hover to see the full name from the real analytics payload
    await avatar.hover();
    await expect(
      page.getByRole("tooltip").filter({ hasText: "Ustadz Ahmad" }).first(),
    ).toBeVisible();
  });
});
