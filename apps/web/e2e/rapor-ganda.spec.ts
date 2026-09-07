import { test, expect } from "@playwright/test";
import { apiLogin, apiRequest, injectSession, SEED_USERS } from "./helpers/auth-api";

test.describe("End-to-End: Rapor Ganda (Unified Raport) Generation", () => {
  test("should load dropdowns, select a student, and generate the unified raport", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Resolve the real active year + a class that contains a student with a
    // computable unified raport.
    const years = await apiRequest<{ data: Array<{ id: string; name: string }> }>(
      session,
      "GET",
      "/academic-years?isActive=true",
    );
    const year = years.data[0];
    const classes = await apiRequest<{ data: Array<{ id: string; name: string }> }>(
      session,
      "GET",
      "/classes?limit=50",
    );

    let picked:
      | { className: string; studentName: string; nis: string; subjectName: string; homeroom: string }
      | undefined;
    outer: for (const cls of classes.data) {
      const students = await apiRequest<{
        data: Array<{ id: string; nis: string; user?: { name: string }; name?: string }>;
      }>(session, "GET", `/students?classId=${cls.id}&limit=100`);
      for (const s of (students.data as Array<any>) ?? []) {
        const raport = await apiRequest<{
          data: {
            academic?: { intrakurikuler?: { kelompokUmum?: Array<{ subjectName: string }> } };
            signatures?: { homeroomTeacher?: string };
          };
        }>(
          session,
          "GET",
          `/assessment/unified-raport/students/${s.id}?academicYearId=${year.id}&semester=1`,
        ).catch(() => null);
        const subject = raport?.data?.academic?.intrakurikuler?.kelompokUmum?.[0]?.subjectName;
        if (subject) {
          picked = {
            className: cls.name,
            studentName: s.user?.name ?? s.name ?? "",
            nis: s.nis ?? s.nisn ?? s.nik ?? "",
            subjectName: subject,
            homeroom: raport!.data.signatures?.homeroomTeacher ?? "",
          };
          break outer;
        }
      }
    }
    expect(picked, "seed should provide a student with a unified raport").toBeTruthy();
    if (!picked) return;

    await page.goto("/assessment/unified-raport");
    await expect(page.getByRole("heading", { name: /Unified SD IT Raport/i })).toBeVisible();

    const pickOption = async (index: number, name: string | RegExp) => {
      const trigger = page.getByRole("combobox").nth(index);
      const option = page.getByRole("option", { name }).first();
      // The select becomes enabled and its options populate from React Query
      // asynchronously (e.g. the student list loads only after a class is
      // chosen). Wait for the trigger to be actionable, then reopen until the
      // target option shows.
      await expect(trigger).toBeEnabled({ timeout: 20000 });
      await expect(async () => {
        await trigger.click();
        await expect(option).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 20000 });
      await option.click({ force: true });
    };

    // Year, Class, Student, Semester
    await pickOption(0, year.name);
    await pickOption(1, picked.className);
    await pickOption(2, `${picked.studentName} (${picked.nis})`);
    await pickOption(3, /Semester 1/i);

    await page.getByRole("button", { name: /Generate Report/i }).click();

    // The real report renders
    await expect(page.getByText("LAPORAN HASIL BELAJAR (RAPOR)")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(new RegExp(`Nama:\\s*${picked.studentName}`, "i"))).toBeVisible();

    // Academic section from the real aggregator
    await expect(page.getByRole("cell", { name: picked.subjectName }).first()).toBeVisible();

    // Islamic/Tahfidz section header
    await expect(page.getByText("Tahfidz Al-Qur'an")).toBeVisible();

    // Homeroom teacher signature
    if (picked.homeroom) {
      await expect(page.getByText(picked.homeroom).first()).toBeVisible();
    }
  });
});
