import { test, expect } from "@playwright/test";
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
  HomeroomNote,
  MyHomeroomClass,
} from "../../../packages/shared/src/schemas/homeroom";

/**
 * Wali Kelas → Catatan Perilaku, end to end:
 *
 * - the wali kelas writes a positive note and one that needs attention (with
 *   what was done about it) on a pupil of their class, and removes their own;
 * - the kepala sekolah reads the class's notes and changes none.
 *
 * Until 2026-09-27 every positive note was stored as a violation (the page
 * sent `behaviorType`, the API reads `type`), the list was asked for without
 * its class, the counters were always 0, and "Selesaikan" and "Hapus" only
 * said the feature was missing.
 */

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

const stamp = Date.now().toString(36).toUpperCase();
const PRAISE = `Membantu teman membereskan kelas ${stamp}`;
const CONCERN = `Tidak membawa buku tulis ${stamp}`;
const ACTION = `Dinasihati dan diingatkan ${stamp}`;

let wali: AuthSession;
let kepala: AuthSession;
let theClass: MyHomeroomClass;
let pupil: { id: string; name: string };

const notesOf = async (session: AuthSession) =>
  (
    await apiRequest<{ data: HomeroomNote[] }>(
      session,
      "GET",
      `/homeroom/behavior?classId=${theClass.id}`,
    )
  ).data;

/** The notes this file wrote. */
const purge = async () => {
  for (const note of await notesOf(wali)) {
    if (note.description.includes(stamp) && note.canChange) {
      await apiRequest(
        wali,
        "DELETE",
        `/homeroom/notes/${note.id}?noteType=${note.kind}`,
      );
    }
  }
};

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini menulis catatan perilaku, jadi dilewati",
  );
  wali = await apiLogin(account("sdit.walikelas@cipansor.or.id"));
  kepala = await apiLogin(account("sdit.kepala@cipansor.or.id"));

  const classes = await apiRequest<{ data: MyHomeroomClass[] }>(
    wali,
    "GET",
    "/homeroom/my-classes",
  );
  const current = classes.data.find((c) => c.isCurrent);
  expect(
    current,
    "the seed makes sdit.walikelas the wali kelas of SD 1A",
  ).toBeTruthy();
  theClass = current!;

  const pupils = await apiRequest<{
    data: { id: string; user: { name: string } }[];
  }>(wali, "GET", `/homeroom/class/${theClass.id}/students`);
  expect(pupils.data.length, "the seed enrols pupils in SD 1A").toBeGreaterThan(
    0,
  );
  pupil = { id: pupils.data[0].id, name: pupils.data[0].user.name };
});

test.afterAll(async () => {
  if (wali) await purge().catch(() => undefined);
});

test("the wali kelas writes a positive note and one needing attention (Wali Kelas → Catatan Perilaku)", async ({
  page,
}) => {
  await injectSession(page, wali);
  await page.goto("/homeroom");
  await page
    .getByRole("complementary", { name: "Menu utama" })
    .getByRole("link", { name: "Catatan Perilaku" })
    .click();
  await expect(page).toHaveURL(/\/homeroom\/behavior$/);
  await waitForLoadingComplete(page);
  await expect(
    page.getByText(theClass.name, { exact: false }).first(),
  ).toBeVisible();

  const write = async (kind: "Positif" | "Perlu Perhatian", text: string) => {
    await page.getByRole("button", { name: "Tambah Catatan" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Siswa" }).click();
    await page.getByRole("option", { name: new RegExp(pupil.name) }).click();
    await dialog.getByRole("combobox", { name: "Jenis Catatan" }).click();
    await page.getByRole("option", { name: kind, exact: true }).click();
    await dialog.getByRole("combobox", { name: "Kategori" }).click();
    await page.getByRole("option", { name: "Kedisiplinan" }).click();
    await dialog.getByLabel("Catatan", { exact: true }).fill(text);
    if (kind === "Perlu Perhatian") {
      await dialog.getByLabel("Tindakan (opsional)").fill(ACTION);
    }
    const saved = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        new URL(res.url()).pathname.endsWith("/homeroom/behavior"),
    );
    await dialog.getByRole("button", { name: "Simpan" }).click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(201);
    await expect(dialog).toHaveCount(0);
  };

  await write("Positif", PRAISE);
  await write("Perlu Perhatian", CONCERN);

  // Stored as what they are — the positive note is a reward, not a violation.
  const notes = await notesOf(wali);
  const praise = notes.find((n) => n.description === PRAISE);
  const concern = notes.find((n) => n.description === CONCERN);
  expect(praise).toMatchObject({ kind: "reward", canChange: true });
  expect(concern).toMatchObject({ kind: "violation", action: ACTION });

  const card = page.getByTestId(`note-${concern!.id}`);
  await expect(card.getByText("Perlu Perhatian")).toBeVisible();
  await expect(card.getByText(`Tindakan: ${ACTION}`)).toBeVisible();
  await expect(
    page.getByTestId(`note-${praise!.id}`).getByText("Positif"),
  ).toBeVisible();
});

test("the wali kelas removes a note of their own", async ({ page }) => {
  const praise = (await notesOf(wali)).find((n) => n.description === PRAISE)!;

  await injectSession(page, wali);
  await page.goto("/homeroom/behavior");
  await waitForLoadingComplete(page);

  page.once("dialog", (d) => d.accept());
  const removed = page.waitForResponse(
    (res) =>
      res.request().method() === "DELETE" &&
      new URL(res.url()).pathname.endsWith(`/homeroom/notes/${praise.id}`),
  );
  await page
    .getByTestId(`note-${praise.id}`)
    .getByRole("button", { name: "Hapus catatan" })
    .click();
  expect((await removed).status()).toBe(200);
  await expect(page.getByTestId(`note-${praise.id}`)).toHaveCount(0);

  expect((await notesOf(wali)).map((n) => n.id)).not.toContain(praise.id);
});

test("the kepala sekolah reads the class's notes and changes none", async () => {
  const notes = await notesOf(kepala);
  const concern = notes.find((n) => n.description === CONCERN);
  expect(concern, "the kepala sekolah reads the note").toBeTruthy();
  expect(notes.every((n) => !n.canChange)).toBe(true);

  expect(
    await statusOf(
      apiRequest(
        kepala,
        "DELETE",
        `/homeroom/notes/${concern!.id}?noteType=violation`,
      ),
    ),
  ).toBe(403);
  expect(
    await statusOf(
      apiRequest(kepala, "POST", "/homeroom/behavior", {
        studentId: pupil.id,
        type: "POSITIVE",
        description: `Dari kepala ${stamp}`,
      }),
    ),
  ).toBe(403);
});
