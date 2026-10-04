/**
 * Pengumuman — the one way to broadcast (decisions/siaran-pengumuman.md).
 *
 * Until 2026-10-03 *Quick Send* and *Buat Notifikasi* stored a row nobody
 * received, announcements never reached a bell, and any signed-in account
 * could publish one. These check, against the real API and database, that a
 * guru reaches the wali of their own class and no one else, that the unit's
 * TU reaches the unit, that withdrawing takes it out of every bell, and that
 * the old addresses lead to the board.
 *
 * Seed relations used: sdit.walikelas@ homerooms SD IT 1A, where sdit.ortu@'s
 * child is enrolled; parent3@ is an SD IT wali whose child is in no class;
 * smpit.ortu@ is a wali at SMP IT. Writes, so it skips itself against a
 * production API.
 */
import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

test.describe.configure({ mode: "serial" });

const account = (email: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!found) throw new Error(`No demo account ${email}`);
  return { email: found.email, password: found.password };
};

const statusOf = (call: Promise<unknown>) =>
  call.then(
    () => 200,
    (error: Error) => Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
  );

interface Compose {
  data: { scopes: string[]; classes: { id: string; name: string }[] };
}
interface Board {
  data: { id: string; title: string }[];
}
interface Bell {
  data: { id: string; title: string; link: string | null }[];
}
interface One {
  data: { recipientCount?: number; readCount?: number };
}

const STAMP = Date.now().toString(36);
const classTitle = `Rapat wali kelas 1A ${STAMP}`;
const unitTitle = `Libur SD IT ${STAMP}`;

let waliKelas: AuthSession;
let ortu1A: AuthSession;
let ortuLain: AuthSession;
let ortuSmp: AuthSession;
let kepala: AuthSession;
let tu: AuthSession;
let siswa: AuthSession;
let superAdmin: AuthSession;
let classAnnouncementId = "";
let unitAnnouncementId = "";

const onBoard = async (s: AuthSession, title: string) =>
  (await apiRequest<Board>(s, "GET", "/announcements?limit=100")).data.some(
    (a) => a.title === title,
  );
const inBell = async (s: AuthSession, title: string) =>
  (await apiRequest<Bell>(s, "GET", "/notifications?limit=100")).data.find(
    (n) => n.title === title,
  );

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini menerbitkan pengumuman",
  );
  waliKelas = await apiLogin(account("sdit.walikelas@cipansor.or.id"));
  ortu1A = await apiLogin(account("sdit.ortu@cipansor.or.id"));
  ortuLain = await apiLogin(SEED_USERS.parent);
  ortuSmp = await apiLogin(account("smpit.ortu@cipansor.or.id"));
  kepala = await apiLogin(account("sdit.kepala@cipansor.or.id"));
  tu = await apiLogin(account("sdit.tu@cipansor.or.id"));
  siswa = await apiLogin(account("sdit.siswa@cipansor.or.id"));
  superAdmin = await apiLogin(SEED_USERS.superAdmin);
});

test("each role is offered what the decision gives it", async () => {
  const scopes = async (s: AuthSession) =>
    (await apiRequest<Compose>(s, "GET", "/announcements/compose")).data;
  const guru = await scopes(waliKelas);
  expect(guru.scopes).toEqual(["CLASSES"]);
  expect(guru.classes.map((c) => c.name)).toContain("1A");
  expect((await scopes(tu)).scopes).toEqual(["UNIT"]);
  expect((await scopes(ortu1A)).scopes).toEqual([]);
  expect((await scopes(siswa)).scopes).toEqual([]);
  // Super Admin runs the system; it does not write content.
  expect((await scopes(superAdmin)).scopes).toEqual([]);
});

test("a wali kelas publishes to their class, and its walis' bells get it", async ({
  page,
}) => {
  await injectSession(page, waliKelas);
  await page.goto("/announcements");
  await page.getByRole("button", { name: "Buat Pengumuman" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Kelas saya", { exact: true })).toBeChecked();
  await dialog.getByRole("checkbox", { name: "1A" }).click();
  await dialog.getByRole("checkbox", { name: "Wali" }).click();
  await dialog.getByLabel("Judul", { exact: true }).fill(classTitle);
  await dialog
    .getByLabel("Isi", { exact: true })
    .fill("Sabtu pukul 08.00 di kelas 1A.");
  await dialog.getByRole("button", { name: "Terbitkan" }).click();
  await expect(page.getByText(/masuk ke lonceng [1-9]\d* orang/)).toBeVisible();

  const note = await inBell(ortu1A, classTitle);
  expect(note, "the 1A wali's bell").toBeDefined();
  classAnnouncementId = /id=([\w-]+)/.exec(note?.link ?? "")?.[1] ?? "";
  expect(classAnnouncementId).not.toBe("");
  expect(await onBoard(ortu1A, classTitle)).toBe(true);
});

test("walis of other classes and units get nothing", async () => {
  expect(await inBell(ortuLain, classTitle)).toBeUndefined();
  expect(await onBoard(ortuLain, classTitle)).toBe(false);
  expect(await inBell(ortuSmp, classTitle)).toBeUndefined();
  expect(await onBoard(ortuSmp, classTitle)).toBe(false);
  // Santri were not chosen.
  expect(await inBell(siswa, classTitle)).toBeUndefined();
});

test("no one publishes past their relation", async () => {
  const smp = await apiLogin(account("smpit.walikelas@cipansor.or.id"));
  const smpClass = (
    await apiRequest<Compose>(smp, "GET", "/announcements/compose")
  ).data.classes[0];
  const body = (extra: Record<string, unknown>) => ({
    title: `Tidak boleh ${STAMP}`,
    content: "x",
    ...extra,
  });
  // Another unit's class.
  expect(
    await statusOf(
      apiRequest(
        waliKelas,
        "POST",
        "/announcements",
        body({ scope: "CLASSES", classIds: [smpClass.id] }),
      ),
    ),
  ).toBe(403);
  // A guru does not write to the whole unit, nor a santri or Super Admin at all.
  expect(
    await statusOf(
      apiRequest(waliKelas, "POST", "/announcements", body({ scope: "UNIT" })),
    ),
  ).toBe(403);
  expect(
    await statusOf(
      apiRequest(siswa, "POST", "/announcements", body({ scope: "UNIT" })),
    ),
  ).toBe(403);
  expect(
    await statusOf(
      apiRequest(
        superAdmin,
        "POST",
        "/announcements",
        body({ scope: "YAYASAN" }),
      ),
    ),
  ).toBe(403);
  // And a wali cannot withdraw what they received.
  expect(
    await statusOf(
      apiRequest(
        ortu1A,
        "POST",
        `/announcements/${classAnnouncementId}/withdraw`,
      ),
    ),
  ).toBe(403);
});

test("the bell's link opens the announcement on the board", async ({
  page,
}) => {
  await injectSession(page, ortu1A);
  await page.goto(`/announcements?id=${classAnnouncementId}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(classTitle)).toBeVisible();
  await expect(
    dialog.getByText("Sabtu pukul 08.00 di kelas 1A."),
  ).toBeVisible();
});

test("the unit's TU reaches every wali of the unit, and only that unit", async () => {
  const made = await apiRequest<{ data: { id: string } }>(
    tu,
    "POST",
    "/announcements",
    {
      scope: "UNIT",
      targetRoles: ["PARENT"],
      title: unitTitle,
      content: "Sekolah libur hari Senin.",
    },
  );
  unitAnnouncementId = made.data.id;
  expect(await inBell(ortuLain, unitTitle)).toBeDefined();
  expect(await inBell(ortu1A, unitTitle)).toBeDefined();
  expect(await inBell(ortuSmp, unitTitle)).toBeUndefined();
});

test("its sender sees how many bells it reached and how many read it; a recipient does not", async () => {
  const figures = async (s: AuthSession) =>
    (await apiRequest<One>(s, "GET", `/announcements/${unitAnnouncementId}`))
      .data;
  const before = await figures(tu);
  expect(before.recipientCount).toBeGreaterThanOrEqual(2);
  expect(before.readCount).toBe(0);

  const note = await inBell(ortuLain, unitTitle);
  await apiRequest(ortuLain, "POST", `/notifications/${note?.id}/read`);
  expect((await figures(tu)).readCount).toBe(1);

  // Counts only, and only for whoever sent or oversees it.
  const received = await figures(ortuLain);
  expect(received.recipientCount).toBeUndefined();
  expect(received.readCount).toBeUndefined();
});

test("a notification is its owner's: an admin cannot open or delete a wali's, and there is no list of everyone's", async () => {
  const admin = await apiLogin(SEED_USERS.adminSdit);
  const note = await inBell(ortu1A, unitTitle);
  expect(note).toBeDefined();
  expect(
    await statusOf(apiRequest(admin, "GET", `/notifications/${note?.id}`)),
  ).toBe(404);
  expect(
    await statusOf(apiRequest(admin, "DELETE", `/notifications/${note?.id}`)),
  ).toBe(404);
  expect(await inBell(ortu1A, unitTitle)).toBeDefined();
  expect(
    await statusOf(apiRequest(ortu1A, "GET", `/notifications/${note?.id}`)),
  ).toBe(200);
  expect(await statusOf(apiRequest(admin, "GET", "/notifications/admin"))).toBe(
    404,
  );
  expect(
    await statusOf(apiRequest(admin, "GET", "/notifications/templates")),
  ).toBe(404);
});

test("the head withdraws it: off the board and out of every bell", async ({
  page,
}) => {
  await injectSession(page, kepala);
  await page.goto("/announcements");
  const card = page
    .getByTestId("announcement-card")
    .filter({ hasText: unitTitle });
  await expect(card.getByTestId("announcement-delivery")).toContainText(
    /Masuk ke \d+ lonceng · dibaca 1 /,
  );
  await card
    .getByRole("button", { name: `Tindakan untuk ${unitTitle}` })
    .click();
  await page.getByRole("menuitem", { name: "Tarik" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Tarik" })
    .click();
  await expect(
    page.getByText(/ditarik dari papan dan dari \d+ lonceng/),
  ).toBeVisible();
  await expect(card.getByText("Ditarik")).toBeVisible();

  expect(await inBell(ortuLain, unitTitle)).toBeUndefined();
  expect(await onBoard(ortuLain, unitTitle)).toBe(false);

  // Leave the class announcement withdrawn too, for whoever runs next.
  await apiRequest(
    waliKelas,
    "POST",
    `/announcements/${classAnnouncementId}/withdraw`,
  );
  expect(await inBell(ortu1A, classTitle)).toBeUndefined();
});

test("the old addresses lead to the board, or to one's own bell", async ({
  page,
}) => {
  await injectSession(page, tu);
  const leadsTo = async (old: string, target: string) => {
    const response = await page.request.get(old, { maxRedirects: 0 });
    expect(response.status(), old).toBe(308);
    expect(
      new URL(response.headers()["location"], "http://x").pathname,
      old,
    ).toBe(target);
  };
  for (const old of [
    "/notifications/quick-send",
    "/notifications/new",
    "/parent/announcements",
    "/notifications/templates",
    "/notifications/templates/new",
  ]) {
    await leadsTo(old, "/announcements");
  }
  await leadsTo("/notifications", "/notifications/me");
  await leadsTo(
    "/notifications/0b6f8f0e-8c1e-4a8e-9d3b-2f0c5a7e1d42",
    "/notifications/me",
  );
  // The pages under /notifications stay where they are.
  for (const page_ of ["/notifications/me", "/notifications/settings"]) {
    const response = await page.request.get(page_, { maxRedirects: 0 });
    expect(response.status(), page_).toBe(200);
  }
});
