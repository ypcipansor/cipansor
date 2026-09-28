import { test, expect } from "@playwright/test";
import {
  SEED_USERS,
  apiLogin,
  apiRequest,
  injectSession,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { waitForLoadingComplete } from "./helpers/page-helpers";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";
import type {
  AttendancePatternItem,
  AttendanceRecorderScope,
} from "../../../packages/shared/src/schemas/attendance";

/**
 * Pola Kehadiran (decided 2026-09-28, decisions/absensi-harian.md): a santri
 * absent — Alpa, Sakit or Izin — on at least 10% of the days recorded this
 * semester (once 10 are recorded), or late three times in 30 days, is shown
 * to their wali kelas and their unit's guru BK (and a santri mukim's musyrif),
 * and to nobody else.
 *
 * The marks are written for days more than a week ago, so the Alpa follow-up
 * (7 days) and today's notices are not touched; they are removed afterwards.
 * The daily notice itself is covered by the API's job tests.
 */

test.describe.configure({ mode: "serial" });

const account = (email: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!found) throw new Error(`No demo account ${email}`);
  return { email: found.email, password: found.password };
};

const DAY_MS = 86_400_000;
/** A calendar day in WIB, `back` days before today. */
const daysAgo = (back: number) =>
  new Date(Date.now() - back * DAY_MS).toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });

type Row = { id: string; studentId: string; recordedBy?: { id: string } };
type Enrollment = { student: { id: string; user?: { name: string } } };

let waliSmp: AuthSession;
let bk: AuthSession;
let waliSd: AuthSession;
let admin: AuthSession;
let classId = "";
let late: { id: string; name: string };
let absent: { id: string; name: string };
/** The first day this spec may write: the semester's, or the year's. */
let firstDay = "";
const written: string[] = [];

const patternsOf = async (session: AuthSession) =>
  (
    await apiRequest<{ data: AttendancePatternItem[] }>(
      session,
      "GET",
      "/attendance/patterns",
    )
  ).data;

const mark = async (day: string, studentId: string, status: string) => {
  await apiRequest(waliSmp, "POST", "/attendance/bulk", {
    classId,
    date: day,
    records: [{ studentId, status }],
  });
  if (!written.includes(day)) written.push(day);
};

/** What this spec wrote, and only that: the wali kelas's marks for its two santri. */
const purge = async () => {
  const mine = (waliSmp.user as { id: string }).id;
  for (const day of written) {
    const rows = (
      await apiRequest<{ data: Row[] }>(
        admin,
        "GET",
        `/attendance?classId=${classId}&date=${day}&limit=100`,
      )
    ).data;
    for (const row of rows) {
      if (
        row.recordedBy?.id === mine &&
        [late.id, absent.id].includes(row.studentId)
      ) {
        await apiRequest(admin, "DELETE", `/attendance/${row.id}`);
      }
    }
  }
};

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini menulis absensi, jadi dilewati",
  );
  waliSmp = await apiLogin(account("smpit.walikelas@cipansor.or.id"));
  bk = await apiLogin(account("smpit.bk@cipansor.or.id"));
  waliSd = await apiLogin(account("sdit.walikelas@cipansor.or.id"));
  admin = await apiLogin(SEED_USERS.superAdmin);

  const scope = (
    await apiRequest<{ data: AttendanceRecorderScope }>(
      waliSmp,
      "GET",
      "/attendance/me/classes",
    )
  ).data;
  const own = scope.classes.find((c) => c.as === "HOMEROOM");
  expect(own, "the seed makes smpit.walikelas a wali kelas").toBeTruthy();
  classId = own!.id;

  const enrolled = (
    await apiRequest<{ data: Enrollment[] }>(
      waliSmp,
      "GET",
      `/classes/${classId}/enrollments`,
    )
  ).data;
  expect(enrolled.length, "the class has two pupils").toBeGreaterThan(1);
  const who = (e: Enrollment) => ({
    id: e.student.id,
    name: e.student.user?.name ?? "",
  });
  late = who(enrolled[0]);
  absent = who(enrolled[1]);

  // The semester starts on 1 January or on the year's first day.
  const year = (
    await apiRequest<{ data: { startDate: string } }>(
      admin,
      "GET",
      "/academic-years/active",
    )
  ).data;
  const yearStart = year.startDate.slice(0, 10);
  const january = `${daysAgo(0).slice(0, 4)}-01-01`;
  firstDay = january > yearStart ? january : yearStart;
});

test.afterAll(async () => {
  if (admin && classId) await purge().catch(() => undefined);
});

test("late three times in 30 days: the wali kelas and the guru BK see it, SD does not", async ({
  page,
}) => {
  const days = [8, 9, 10].map(daysAgo);
  test.skip(days[2] < firstDay, "the semester is too young for this test");
  for (const day of days) await mark(day, late.id, "LATE");

  const seen = (await patternsOf(waliSmp)).find(
    (i) => i.student.id === late.id,
  );
  expect(seen?.kinds).toContain("LATE");
  expect(seen?.as).toContain("WALI_KELAS");
  expect(seen?.lateDays).toBeGreaterThanOrEqual(3);

  const counsellor = (await patternsOf(bk)).find(
    (i) => i.student.id === late.id,
  );
  expect(counsellor?.as).toEqual(["GURU_BK"]);

  expect((await patternsOf(waliSd)).some((i) => i.student.id === late.id)).toBe(
    false,
  );

  // Wali Kelas → Pola Kehadiran
  await injectSession(page, waliSmp);
  await page.goto("/homeroom");
  await page
    .getByRole("complementary", { name: "Menu utama" })
    .getByRole("link", { name: "Pola Kehadiran" })
    .click();
  await expect(page).toHaveURL(/\/attendance\/patterns$/);
  await expect(
    page.getByRole("heading", { name: "Pola Kehadiran" }),
  ).toBeVisible();
  await waitForLoadingComplete(page);
  const card = page.getByRole("article", {
    name: `Pola kehadiran ${late.name}`,
  });
  await expect(card).toContainText("Sering terlambat");
  await expect(card).toContainText(/Terlambat \d+ kali dalam 30 hari terakhir/);
  await expect(card).toContainText("Perwalian");
});

test("absent on 2 of 10 recorded days — Alpa and Sakit alike — is a pattern", async ({
  page,
}) => {
  const days = Array.from({ length: 10 }, (_, i) => daysAgo(8 + i));
  test.skip(days[9] < firstDay, "the semester is too young for this test");
  for (const [i, day] of days.entries()) {
    await mark(
      day,
      absent.id,
      i === 0 ? "ABSENT" : i === 1 ? "SICK" : "PRESENT",
    );
  }

  const seen = (await patternsOf(waliSmp)).find(
    (i) => i.student.id === absent.id,
  );
  expect(seen?.kinds).toContain("ABSENCE");
  expect(seen?.absence.alpa).toBeGreaterThanOrEqual(1);
  expect(seen?.absence.sakit).toBeGreaterThanOrEqual(1);
  expect(seen?.absence.recordedDays).toBeGreaterThanOrEqual(10);

  // Mengajar → Pola Kehadiran: a guru BK holds no Wali Kelas group.
  await injectSession(page, bk);
  await page.goto("/teacher");
  const sidebar = page.getByRole("complementary", { name: "Menu utama" });
  await sidebar.getByRole("link", { name: "Pola Kehadiran" }).click();
  await expect(page).toHaveURL(/\/attendance\/patterns$/);
  await expect(
    sidebar.getByRole("link", { name: "Pola Kehadiran" }),
  ).toHaveCount(1);
  await waitForLoadingComplete(page);
  const card = page.getByRole("article", {
    name: `Pola kehadiran ${absent.name}`,
  });
  await expect(card).toContainText(/Tidak hadir \d+%/);
  await expect(card).toContainText(/Alpa [1-9]\d*, Sakit [1-9]\d*, Izin \d+/);
  await expect(card).toContainText("Bimbingan konseling");
});
