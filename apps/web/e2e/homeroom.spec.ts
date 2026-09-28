import { test, expect, type Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { waitForLoadingComplete } from "./helpers/page-helpers";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";
import type {
  HomeroomViewer,
  MyHomeroomClass,
} from "../../../packages/shared/src/schemas/homeroom";

/**
 * Wali kelas is a duty, not a role (decided 2026-09-26): a guru is the wali
 * kelas of one class in one academic year, `Class.homeroomTeacherId`. What
 * follows from it, end to end:
 *
 * - the Wali Kelas menu group is shown to the wali kelas of a class this
 *   academic year, and to no other teacher;
 * - a class's homeroom data is read by its wali kelas and by the kepala
 *   sekolah of its unit; another teacher of the same unit gets 404;
 * - notes are written by the wali kelas only — the kepala sekolah reads;
 * - the yayasan organs do not reach the homeroom routes.
 *
 * Until 2026-09-27 the menu followed the role code and every teacher of a unit
 * read every class's homeroom data, pupils' private columns included.
 */

const account = (email: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!found) throw new Error(`No demo account ${email}`);
  return { email: found.email, password: found.password };
};

/** The status an API call answered with; apiRequest throws on anything not 2xx. */
const statusOf = (call: Promise<unknown>) =>
  call.then(
    () => 200,
    (error: Error) => Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
  );

type Dashboard = {
  class: { id: string; name: string };
  viewer: HomeroomViewer;
  students: { id: string; user: { name: string } }[];
};

const stamp = Date.now().toString(36).toUpperCase();

let wali: AuthSession;
let guru: AuthSession;
let kepala: AuthSession;
let ketua: AuthSession;
let theClass: MyHomeroomClass;
let noteId = "";

const myClasses = async (session: AuthSession) =>
  (
    await apiRequest<{ data: MyHomeroomClass[] }>(
      session,
      "GET",
      "/homeroom/my-classes",
    )
  ).data;

const sidebar = (page: Page) =>
  page.getByRole("complementary", { name: "Menu utama" });

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini menulis catatan wali kelas, jadi dilewati",
  );
  wali = await apiLogin(account("sdit.walikelas@cipansor.or.id"));
  guru = await apiLogin(account("sdit.guru@cipansor.or.id"));
  kepala = await apiLogin(account("sdit.kepala@cipansor.or.id"));
  ketua = await apiLogin(account("yayasan.ketua@cipansor.or.id"));

  const current = (await myClasses(wali)).find((c) => c.isCurrent);
  expect(
    current,
    "the seed makes sdit.walikelas the wali kelas of SD 1A",
  ).toBeTruthy();
  theClass = current!;
});

test.afterAll(async () => {
  if (noteId) {
    await apiRequest(
      wali,
      "DELETE",
      `/homeroom/notes/${noteId}?noteType=reward`,
    ).catch(() => undefined);
  }
});

test("every wali kelas persona holds a class this academic year, TK Qur'an's included", async () => {
  const personas = DEMO_ACCOUNTS.filter((a) => a.homeroom);
  expect(personas.map((a) => a.email).sort()).toEqual([
    "sdit.walikelas@cipansor.or.id",
    "smaq.walikelas@cipansor.or.id",
    "smpit.walikelas@cipansor.or.id",
    "tkq.walikelas@cipansor.or.id",
  ]);
  for (const persona of personas) {
    const session = await apiLogin(account(persona.email));
    const classes = await myClasses(session);
    expect(
      classes.some((c) => c.isCurrent),
      `${persona.email} is the wali kelas of a class this year`,
    ).toBe(true);
  }
});

test("the wali kelas opens their class from the menu (Wali Kelas → Dashboard Wali Kelas)", async ({
  page,
}) => {
  const dashboard = (
    await apiRequest<{ data: Dashboard }>(
      wali,
      "GET",
      `/homeroom/${theClass.id}/dashboard`,
    )
  ).data;
  expect(dashboard.viewer).toEqual({ access: "HOMEROOM", canWrite: true });
  const pupil = dashboard.students[0];
  expect(pupil, "the seed enrols pupils in SD 1A").toBeTruthy();
  // Only what the page shows — a pupil's NIK, family card and the parents'
  // income are not sent.
  expect(Object.keys(pupil).sort()).toEqual([
    "gender",
    "id",
    "nis",
    "photoUrl",
    "user",
  ]);

  await injectSession(page, wali);
  await page.goto("/teacher");
  await sidebar(page)
    .getByRole("link", { name: "Dashboard Wali Kelas" })
    .click();
  await expect(page).toHaveURL(/\/homeroom$/);
  await waitForLoadingComplete(page);

  await expect(
    page.getByRole("heading", { name: "Dashboard Wali Kelas" }),
  ).toBeVisible();
  await expect(
    page.getByText(theClass.name, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(theClass.academicYear.name).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Anda bukan wali kelas kelas mana pun tahun ajaran ini"),
  ).toHaveCount(0);

  // The pupil's page shows their name (it read a field the API did not send).
  await page.getByRole("tab", { name: "Daftar Siswa" }).click();
  const row = page.getByRole("row").filter({ hasText: pupil.user.name });
  await row.getByRole("button", { name: "Detail" }).click();
  await expect(page).toHaveURL(new RegExp(`/homeroom/students/${pupil.id}$`));
  await expect(
    page.getByRole("heading", { name: pupil.user.name, level: 2 }),
  ).toBeVisible();
});

test("a teacher who is wali kelas of no class has no Wali Kelas group, and does not reach the class", async ({
  page,
}) => {
  expect(await myClasses(guru), "the seed gives sdit.guru no class").toEqual(
    [],
  );

  await injectSession(page, guru);
  const asked = page.waitForResponse((res) =>
    res.url().endsWith("/homeroom/my-classes"),
  );
  await page.goto("/teacher");
  await asked;
  await expect(sidebar(page).getByText("Mengajar")).toBeVisible();
  await expect(
    sidebar(page).getByText("Wali Kelas", { exact: true }),
  ).toHaveCount(0);
  await expect(
    sidebar(page).getByRole("link", { name: "Dashboard Wali Kelas" }),
  ).toHaveCount(0);

  expect(
    await statusOf(
      apiRequest(guru, "GET", `/homeroom/${theClass.id}/dashboard`),
    ),
  ).toBe(404);
});

test("the wali kelas writes a note; the kepala sekolah reads the class and cannot write or remove it", async () => {
  const dashboard = (
    await apiRequest<{ data: Dashboard }>(
      kepala,
      "GET",
      `/homeroom/${theClass.id}/dashboard`,
    )
  ).data;
  expect(dashboard.viewer).toEqual({ access: "OVERSEER", canWrite: false });
  const pupil = dashboard.students[0];

  const note = {
    studentId: pupil.id,
    type: "POSITIVE",
    title: `Membantu teman membereskan kelas ${stamp}`,
  };
  expect(
    await statusOf(apiRequest(kepala, "POST", "/homeroom/notes", note)),
  ).toBe(403);
  expect(
    await statusOf(apiRequest(guru, "POST", "/homeroom/notes", note)),
  ).toBe(404);

  const written = await apiRequest<{
    data: { type: string; data: { id: string } };
  }>(wali, "POST", "/homeroom/notes", note);
  expect(written.data.type).toBe("reward");
  noteId = written.data.data.id;

  const notes = await apiRequest<{ data: { rewards: { id: string }[] } }>(
    kepala,
    "GET",
    `/homeroom/student/${pupil.id}/notes`,
  );
  expect(notes.data.rewards.map((r) => r.id)).toContain(noteId);

  expect(
    await statusOf(
      apiRequest(kepala, "DELETE", `/homeroom/notes/${noteId}?noteType=reward`),
    ),
  ).toBe(403);
  await apiRequest(wali, "DELETE", `/homeroom/notes/${noteId}?noteType=reward`);
  noteId = "";
});

test("a yayasan organ does not reach the homeroom routes", async () => {
  expect(await statusOf(myClasses(ketua))).toBe(403);
  expect(
    await statusOf(
      apiRequest(ketua, "GET", `/homeroom/${theClass.id}/dashboard`),
    ),
  ).toBe(403);
});
