import { test, expect, type Page } from "@playwright/test";
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
  AttendanceRecorderScope,
  BulkAttendanceResult,
} from "../../../packages/shared/src/schemas/attendance";

/**
 * A class's daily register, taken by the people who take it (2026-09-27):
 *
 * - the wali kelas saves the day from *Mengajar → Absensi → Isi Absensi
 *   Harian*, and saving it again corrects it;
 * - *Wali Kelas → Absensi Harian* opens that same page, on their own class —
 *   one register, one page (the copy at /homeroom/attendance is gone, and
 *   its address answers with a 308);
 * - a teacher with a lesson in a class records it; a teacher with none cannot;
 * - the kepala sekolah reads the register and does not write it; another
 *   unit's teacher does not reach the class.
 *
 * Until then every one of these saves was refused: the write routes let
 * admins only, and this suite signed in as the super admin, so nobody saw it.
 *
 * One register per class per day, so the tests run in order; what the
 * accounts below wrote today is removed before and after.
 */

test.describe.configure({ mode: "serial" });

const account = (email: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!found) throw new Error(`No demo account ${email}`);
  return { email: found.email, password: found.password };
};

/** Today as the teacher's browser dates it (the config pins Asia/Jakarta). */
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

const statusOf = (call: Promise<unknown>) =>
  call.then(
    () => 200,
    (error: Error) => Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
  );

type Row = {
  id: string;
  studentId: string;
  status: string;
  recordedBy?: { id: string };
};
type Enrollment = { student: { id: string; user?: { name: string } } };

let wali: AuthSession;
let pengampu: AuthSession;
let guru: AuthSession;
let kepala: AuthSession;
let waliSmp: AuthSession;
let admin: AuthSession;
let class1A = "";
let class7A = "";
let pupil: { id: string; name: string };

const scopeOf = async (session: AuthSession) =>
  (
    await apiRequest<{ data: AttendanceRecorderScope }>(
      session,
      "GET",
      "/attendance/me/classes",
    )
  ).data;

const registerOf = async (classId: string, session = admin) =>
  (
    await apiRequest<{ data: Row[] }>(
      session,
      "GET",
      `/attendance?classId=${classId}&date=${today()}&limit=100`,
    )
  ).data;

/** Today's records of the two classes written by the accounts in this file. */
const purge = async () => {
  const writers = new Set(
    [wali, pengampu].map((s) => (s.user as { id: string }).id),
  );
  for (const classId of [class1A, class7A]) {
    for (const row of await registerOf(classId)) {
      if (row.recordedBy && writers.has(row.recordedBy.id)) {
        await apiRequest(admin, "DELETE", `/attendance/${row.id}`);
      }
    }
  }
};

const saved = (page: Page) =>
  page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      new URL(res.url()).pathname.endsWith("/attendance/bulk"),
  );

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini menulis absensi, jadi dilewati",
  );
  wali = await apiLogin(account("sdit.walikelas@cipansor.or.id"));
  pengampu = await apiLogin(account("smpit.guru@cipansor.or.id"));
  guru = await apiLogin(account("sdit.guru@cipansor.or.id"));
  kepala = await apiLogin(account("sdit.kepala@cipansor.or.id"));
  waliSmp = await apiLogin(account("smpit.walikelas@cipansor.or.id"));
  admin = await apiLogin(SEED_USERS.superAdmin);

  const own = (await scopeOf(wali)).classes.find((c) => c.as === "HOMEROOM");
  expect(
    own,
    "the seed makes sdit.walikelas the wali kelas of SD 1A",
  ).toBeTruthy();
  class1A = own!.id;
  const taught = (await scopeOf(pengampu)).classes.find(
    (c) => c.as === "TEACHER",
  );
  expect(taught, "the seed gives smpit.guru a lesson in SMP 7A").toBeTruthy();
  class7A = taught!.id;

  const enrolled = await apiRequest<{ data: Enrollment[] }>(
    wali,
    "GET",
    `/classes/${class1A}/enrollments`,
  );
  const first = enrolled.data[0]?.student;
  expect(first, "the seed enrols pupils in SD 1A").toBeTruthy();
  pupil = { id: first.id, name: first.user?.name ?? "" };

  await purge();
});

test.afterAll(async () => {
  if (admin) await purge().catch(() => undefined);
});

test("the wali kelas takes the register (Mengajar → Absensi → Isi Absensi Harian)", async ({
  page,
}) => {
  await injectSession(page, wali);
  await page.goto("/attendance");
  await page.getByRole("link", { name: "Isi Absensi Harian" }).click();
  await expect(page).toHaveURL(/\/attendance\/record/);
  await waitForLoadingComplete(page);

  // Their own class is chosen for them; there is no unit to pick.
  await expect(page.getByRole("combobox", { name: "Kelas" })).toContainText(
    "Wali Kelas",
  );
  await expect(page.getByRole("combobox", { name: "Unit" })).toHaveCount(0);

  const row = page.getByTestId(`attendance-row-${pupil.id}`);
  await row.getByRole("button", { name: "Sakit" }).click();
  await expect(row.getByRole("button", { name: "Sakit" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const response = saved(page);
  await page.getByRole("button", { name: "Simpan Kehadiran" }).click();
  const res = await response;
  expect(res.status(), await res.text()).toBe(201);
  const result = (await res.json()).data as BulkAttendanceResult;
  expect(result.updated).toBe(0);
  expect(result.created).toBeGreaterThan(0);
  await expect(page.getByText(/Kehadiran disimpan: \d+ baru/)).toBeVisible();
  // Back on the register, the pupil is named (the list read a field the API
  // does not send, and showed "-" for everyone).
  await expect(page).toHaveURL(/\/attendance$/);
  await expect(
    page.getByRole("cell", { name: pupil.name, exact: true }).first(),
  ).toBeVisible();

  const mine = (await registerOf(class1A)).find(
    (r) => r.studentId === pupil.id,
  );
  expect(mine?.status).toBe("SICK");
  expect(mine?.recordedBy?.id).toBe((wali.user as { id: string }).id);
});

test("saving the day again corrects it, and the form opens on what was saved", async ({
  page,
}) => {
  await injectSession(page, wali);
  await page.goto("/attendance/record");
  await waitForLoadingComplete(page);

  const row = page.getByTestId(`attendance-row-${pupil.id}`);
  await expect(row.getByRole("button", { name: "Sakit" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await row.getByRole("button", { name: "Hadir", exact: true }).click();

  const response = saved(page);
  await page.getByRole("button", { name: "Simpan Kehadiran" }).click();
  const res = await response;
  expect(res.status(), await res.text()).toBe(201);
  expect(((await res.json()).data as BulkAttendanceResult).created).toBe(0);
  await expect(
    page.getByText(/Kehadiran disimpan: \d+ diperbarui/),
  ).toBeVisible();

  const mine = (await registerOf(class1A)).find(
    (r) => r.studentId === pupil.id,
  );
  expect(mine?.status).toBe("PRESENT");
});

test("Wali Kelas → Absensi Harian opens the same register, on their own class", async ({
  page,
}) => {
  await injectSession(page, wali);
  await page.goto("/homeroom");
  await page
    .getByRole("complementary", { name: "Menu utama" })
    .getByRole("link", { name: "Absensi Harian" })
    .click();
  await expect(page).toHaveURL(/\/attendance\/record$/);
  await expect(
    page.getByRole("heading", { name: "Absensi Harian" }),
  ).toBeVisible();
  // One entry lit, not Mengajar → Absensi as well.
  const current = page
    .getByRole("complementary", { name: "Menu utama" })
    .locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText("Absensi Harian");
  await waitForLoadingComplete(page);
  await expect(page.getByRole("combobox", { name: "Kelas" })).toContainText(
    "Wali Kelas",
  );

  const row = page.getByTestId(`attendance-row-${pupil.id}`);
  await row.getByRole("button", { name: "Terlambat" }).click();
  const response = saved(page);
  await page.getByRole("button", { name: "Simpan Kehadiran" }).click();
  const res = await response;
  expect(res.status(), await res.text()).toBe(201);

  const mine = (await registerOf(class1A)).find(
    (r) => r.studentId === pupil.id,
  );
  expect(mine?.status).toBe("LATE");
});

test("the old Wali Kelas address answers with the one page", async ({
  page,
}) => {
  await injectSession(page, wali);
  const response = await page.request.get("/homeroom/attendance", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(308);
  expect(response.headers()["location"]).toMatch(/\/attendance\/record$/);

  await page.goto("/homeroom/attendance");
  await expect(page).toHaveURL(/\/attendance\/record$/);
  await expect(
    page.getByRole("heading", { name: "Absensi Harian" }),
  ).toBeVisible();
});

test("a teacher with a lesson in a class records it; one with no class cannot", async ({
  page,
}) => {
  const enrolled = await apiRequest<{ data: Enrollment[] }>(
    pengampu,
    "GET",
    `/classes/${class7A}/enrollments`,
  );
  const records = enrolled.data.map((e) => ({
    studentId: e.student.id,
    status: "PRESENT",
  }));
  const done = await apiRequest<{ data: BulkAttendanceResult }>(
    pengampu,
    "POST",
    "/attendance/bulk",
    { classId: class7A, date: today(), records },
  );
  expect(done.data.created + done.data.updated).toBe(records.length);

  expect(await scopeOf(guru)).toEqual({
    scope: "ASSIGNED",
    unitId: expect.any(String),
    classes: [],
  });
  expect(
    await statusOf(
      apiRequest(guru, "POST", "/attendance/bulk", {
        classId: class1A,
        date: today(),
        records: [{ studentId: pupil.id, status: "ABSENT" }],
      }),
    ),
  ).toBe(403);

  await injectSession(page, guru);
  await page.goto("/attendance/record");
  await expect(page.getByText("Tidak ada kelas untuk dicatat")).toBeVisible();
});

test("the kepala sekolah reads the register and does not write it; another unit does not reach it", async () => {
  const read = await registerOf(class1A, kepala);
  expect(read.map((r) => r.studentId)).toContain(pupil.id);

  const change = {
    classId: class1A,
    date: today(),
    records: [{ studentId: pupil.id, status: "ABSENT" }],
  };
  expect(
    await statusOf(apiRequest(kepala, "POST", "/attendance/bulk", change)),
  ).toBe(403);
  expect(
    await statusOf(apiRequest(waliSmp, "POST", "/attendance/bulk", change)),
  ).toBe(404);

  const mine = (await registerOf(class1A)).find(
    (r) => r.studentId === pupil.id,
  );
  expect(mine?.status).toBe("LATE");
});
