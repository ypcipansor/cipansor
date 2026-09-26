/**
 * Mata pelajaran and guru pengampu, end to end — the way a school's operator
 * keeps them from the Kurikulum pages:
 *
 *   Kurikulum → Tambah → (the subject) → Edit → Tugaskan guru → Akhiri → Hapus
 *
 * Until 2026-09-26 none of it worked: the form offered types the API refused
 * (Wajib/Pilihan) so no subject could be added, edits went out as PUT to a
 * PATCH route, guru pengampu were read from and written to a path the API
 * never served, and every subject page listed every schedule in the school.
 * The spec this replaces asserted only that the URL contained "curriculum".
 *
 * It adds its own subject and deletes it, so it changes nothing the other
 * specs read. Accounts come from DEMO_ACCOUNTS; no password is written here.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

function account(roleCode: string) {
  const found = DEMO_ACCOUNTS.find((a) => a.roleCode === roleCode);
  if (!found) throw new Error(`No demo account for ${roleCode}`);
  return found;
}

async function signIn(page: Page, roleCode: string): Promise<AuthSession> {
  const { email, password } = account(roleCode);
  const session = await apiLogin({ email, password });
  await injectSession(page, session);
  return session;
}

type Row = { id: string; code: string; name: string; unitId: string };
type List<T> = { data: T[]; meta?: { total: number } };

const stamp = Date.now().toString(36).toUpperCase();
const KODE = `U${stamp.slice(-6)}`;
const MAPEL = `Mapel Uji ${stamp}`;
const GURU = account("SMPIT_GURU").name;

test.describe.configure({ mode: "serial" });

test.describe("Mata pelajaran — tambah, ubah, guru pengampu, hapus", () => {
  let admin: AuthSession;
  let subjectId = "";

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini menulis mata pelajaran, jadi dilewati",
    );
    admin = await apiLogin(account("SMPIT_ADMIN"));
  });

  test.afterAll(async () => {
    if (admin && subjectId) {
      await apiRequest(
        admin,
        "DELETE",
        `/curriculum/subjects/${subjectId}`,
      ).catch(() => undefined);
    }
  });

  test("the operator adds a subject of the unit's own, with a type the API knows", async ({
    page,
  }) => {
    await signIn(page, "SMPIT_ADMIN");
    await page.goto("/curriculum");
    await page.getByRole("link", { name: "Tambah" }).click();
    await page.waitForURL("**/curriculum/subjects/new");

    // An operator writes in their own unit only; the field says which.
    await expect(page.getByRole("combobox", { name: "Unit" })).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Unit" })).toHaveText(
      /SMP/,
    );

    await page.getByLabel("Kode").fill(KODE.toLowerCase());
    await page.getByLabel("Nama Mata Pelajaran").fill(MAPEL);
    await page.getByRole("combobox", { name: "Jenis" }).click();
    await page.getByRole("option", { name: "Keagamaan" }).click();
    await page.getByLabel("JP per Minggu").fill("4");
    await page.getByLabel("KKM").fill("75");
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.waitForURL((url) =>
      /^\/curriculum\/subjects\/[0-9a-f-]{36}$/.test(url.pathname),
    );
    subjectId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByRole("heading", { name: MAPEL })).toBeVisible();
    // The code is stored upper-cased, whatever was typed.
    await expect(page.getByText(KODE, { exact: true })).toBeVisible();
    await expect(page.getByText("Keagamaan", { exact: true })).toBeVisible();
    await expect(page.getByTestId("subject-credits")).toHaveText("4");
    await expect(page.getByText("Belum ada guru pengampu")).toBeVisible();
    await expect(page.getByText("Belum ada jadwal")).toBeVisible();
  });

  test("the operator edits it with PATCH, and the change is what is shown", async ({
    page,
  }) => {
    await signIn(page, "SMPIT_ADMIN");
    await page.goto(`/curriculum/subjects/${subjectId}`);
    await page.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(`**/curriculum/subjects/${subjectId}/edit`);

    await expect(page.getByLabel("JP per Minggu")).toHaveValue("4");
    await page.getByLabel("JP per Minggu").fill("3");
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.waitForURL(`**/curriculum/subjects/${subjectId}`);
    await expect(page.getByTestId("subject-credits")).toHaveText("3");
  });

  test("the operator assigns a guru pengampu for all classes, then ends it", async ({
    page,
  }) => {
    await signIn(page, "SMPIT_ADMIN");
    await page.goto(`/curriculum/subjects/${subjectId}`);

    await page.getByRole("button", { name: "Tugaskan guru" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox", { name: "Guru" })).toHaveText(
      "Pilih guru",
    );
    await dialog.getByRole("combobox", { name: "Guru" }).click();
    await page.getByRole("option", { name: GURU, exact: true }).click();
    await expect(dialog.getByRole("combobox", { name: "Kelas" })).toHaveText(
      "Semua kelas",
    );
    await dialog.getByRole("button", { name: "Tugaskan" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByRole("row").filter({ hasText: GURU });
    await expect(row).toContainText("Semua kelas");

    // The list counts the guru pengampu it now has.
    const listed = await apiRequest<
      List<Row & { _count: { teacherSubjects: number } }>
    >(admin, "GET", `/curriculum/subjects?search=${KODE}`);
    expect(listed.data.map((s) => s._count.teacherSubjects)).toEqual([1]);

    await row.getByRole("button", { name: "Akhiri" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Akhiri" })
      .click();
    await expect(page.getByText("Belum ada guru pengampu")).toBeVisible();
  });

  test("a teacher sees the subject but none of its buttons, and the API refuses them", async ({
    page,
  }) => {
    const guru = await signIn(page, "SMPIT_GURU");
    await page.goto(`/curriculum/subjects/${subjectId}`);
    await expect(page.getByRole("heading", { name: MAPEL })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hapus" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Tugaskan guru" }),
    ).toHaveCount(0);

    await expect(
      apiRequest(guru, "DELETE", `/curriculum/subjects/${subjectId}`),
    ).rejects.toThrow(/→ 403/);
  });

  test("another unit's operator cannot touch this unit's subject", async () => {
    const sd = await apiLogin(account("SDIT_ADMIN"));
    await expect(
      apiRequest(sd, "PATCH", `/curriculum/subjects/${subjectId}`, {
        credits: 1,
      }),
    ).rejects.toThrow(/→ 403/);
  });

  test("the operator deletes it; it leaves the list", async ({ page }) => {
    await signIn(page, "SMPIT_ADMIN");
    await page.goto(`/curriculum/subjects/${subjectId}`);
    await page.getByRole("button", { name: "Hapus" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Hapus" })
      .click();
    await page.waitForURL((url) => url.pathname === "/curriculum");

    await page.getByPlaceholder("Cari mata pelajaran...").fill(KODE);
    await expect(page.getByText("Belum ada mata pelajaran")).toBeVisible();
    subjectId = "";
  });
});

test.describe("Mata pelajaran — jadwal di halaman mapel", () => {
  test("a subject's page lists its own schedule, not the whole school's", async ({
    page,
  }) => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; dilewati",
    );
    const admin = await signIn(page, "SMPIT_ADMIN");
    const unitId = admin.user.unitId as string;
    const subjects = await apiRequest<
      List<Row & { _count: { schedules: number } }>
    >(admin, "GET", `/curriculum/subjects?unitId=${unitId}&limit=100`);
    const withSchedule = subjects.data.find((s) => s._count.schedules > 0);
    test.skip(!withSchedule, "the seed gave no SMP IT subject a schedule");

    const own = await apiRequest<List<unknown>>(
      admin,
      "GET",
      `/curriculum/schedules?subjectId=${withSchedule!.id}&isActive=true&limit=100`,
    );
    const all = await apiRequest<List<unknown>>(
      admin,
      "GET",
      `/curriculum/schedules?isActive=true&limit=100`,
    );
    expect(own.data.length).toBeGreaterThan(0);
    expect(own.data.length).toBeLessThan(all.data.length);

    await page.goto(`/curriculum/subjects/${withSchedule!.id}`);
    await expect(
      page.getByTestId("subject-schedule").locator("tbody tr"),
    ).toHaveCount(own.data.length);
  });
});
