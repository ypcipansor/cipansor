/**
 * Asrama, end to end: add an asrama, give it a kamar, place a santri, and take
 * it all down again — the way a school's admin does it from the pages.
 *
 *   Asrama → Tambah Asrama → (the asrama) → Tambah Kamar → Ubah
 *   → Lihat Penghuni → Tambah Penghuni → Keluarkan → Hapus kamar → Hapus asrama
 *
 * Until 2026-09-26 almost none of that worked: the forms sent `type` for the
 * gender (400), edits went out as PATCH to a PUT route, "Tambah Kamar" wrote
 * the facilities module's rooms, "Tambah Penghuni" could not find its kamar,
 * and "Terisi" was always 0. The spec this replaces asserted only that the URL
 * contained "dormitories", so it passed through all of it.
 *
 * It creates its own asrama and its own santri, so it moves nobody the other
 * specs rely on (the permit and musyrif specs read the seeded kamar).
 * Accounts come from DEMO_ACCOUNTS; no password is written down here.
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

function byRole(roleCode: string) {
  const account = DEMO_ACCOUNTS.find((a) => a.roleCode === roleCode);
  if (!account) throw new Error(`No demo account for ${roleCode}`);
  return { email: account.email, password: account.password };
}

async function signIn(page: Page, roleCode: string): Promise<AuthSession> {
  const session = await apiLogin(byRole(roleCode));
  await injectSession(page, session);
  return session;
}

const stamp = Date.now().toString(36).toUpperCase();
const ASRAMA = `Asrama Uji ${stamp}`;
const KODE = `E2E-${stamp}`.slice(0, 20);
const KAMAR = "Kamar Uji 1";
const NIS = `E2E${stamp}`;
const SANTRI = `Santri Uji Asrama ${stamp}`;

test.describe.configure({ mode: "serial" });

test.describe("Asrama — tambah, kamar, penghuni, hapus", () => {
  let admin: AuthSession;
  let studentId = "";
  let dormitoryId = "";

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini menulis asrama dan santri, jadi dilewati",
    );
    admin = await apiLogin(byRole("SMPIT_ADMIN"));
    const unitId = admin.user.unitId as string | undefined;
    expect(unitId, "the SMP IT admin belongs to a unit").toBeTruthy();
    const created = await apiRequest<{ data: { id: string } }>(
      admin,
      "POST",
      "/students",
      {
        name: SANTRI,
        unitId,
        nis: NIS,
        gender: "MALE",
        birthPlace: "Bogor",
        birthDate: "2013-05-01",
        address: "Jl. Uji Asrama No. 1",
        parentName: "Wali Uji Asrama",
        parentPhone: "081234567890",
      },
    );
    studentId = created.data.id;
  });

  test.afterAll(async () => {
    if (!admin) return;
    // Best effort: a failed test above may have left any of these behind.
    const quietly = (p: Promise<unknown>) => p.catch(() => undefined);
    if (dormitoryId) {
      const rooms = await quietly(
        apiRequest<{ data: { id: string }[] }>(
          admin,
          "GET",
          `/dormitories/rooms/list?dormitoryId=${dormitoryId}&isActive=true`,
        ),
      );
      for (const room of (rooms as { data: { id: string }[] } | undefined)
        ?.data ?? []) {
        const placed = await quietly(
          apiRequest<{ data: { id: string }[] }>(
            admin,
            "GET",
            `/dormitories/assignments/list?roomId=${room.id}&isActive=true`,
          ),
        );
        for (const p of (placed as { data: { id: string }[] } | undefined)
          ?.data ?? []) {
          await quietly(
            apiRequest(admin, "DELETE", `/dormitories/assignments/${p.id}`),
          );
        }
        await quietly(
          apiRequest(admin, "DELETE", `/dormitories/rooms/${room.id}`),
        );
      }
      await quietly(apiRequest(admin, "DELETE", `/dormitories/${dormitoryId}`));
    }
    if (studentId) {
      await quietly(apiRequest(admin, "DELETE", `/students/${studentId}`));
    }
  });

  test("the admin adds an asrama; it reads Putra and nobody lives there yet", async ({
    page,
  }) => {
    await signIn(page, "SMPIT_ADMIN");
    await page.goto("/dormitories");
    await page.getByRole("link", { name: "Tambah Asrama" }).first().click();
    await page.waitForURL("**/dormitories/new");

    await page.getByLabel("Nama Asrama").fill(ASRAMA);
    await page.getByLabel("Kode").fill(KODE);
    await page.getByLabel("Kapasitas").fill("10");
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.waitForURL((url) =>
      /^\/dormitories\/[0-9a-f-]{36}$/.test(url.pathname),
    );
    dormitoryId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByRole("heading", { name: ASRAMA })).toBeVisible();
    await expect(page.getByText("Putra", { exact: true })).toBeVisible();
    await expect(page.getByTestId("dormitory-occupied")).toHaveText("0");
  });

  test("adds a kamar and changes its capacity", async ({ page }) => {
    await signIn(page, "SMPIT_ADMIN");
    await page.goto(`/dormitories/${dormitoryId}`);

    await page.getByRole("button", { name: "Tambah Kamar" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nama Kamar").fill(KAMAR);
    await dialog.getByLabel("Kapasitas").fill("2");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Kamar ditambahkan")).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(KAMAR) });
    await expect(row.getByRole("cell", { name: KAMAR })).toBeVisible();

    await row.getByRole("button", { name: `Ubah ${KAMAR}` }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Kapasitas").fill("1");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Kamar diperbarui")).toBeVisible();
    // Nama, Lantai, Kapasitas, Terisi
    await expect(row.getByRole("cell").nth(2)).toHaveText("1");
  });

  test("places the santri from the kamar's Penghuni; Terisi counts them", async ({
    page,
  }) => {
    await signIn(page, "SMPIT_ADMIN");
    await page.goto(`/dormitories/${dormitoryId}`);
    await page
      .getByRole("row", { name: new RegExp(KAMAR) })
      .getByRole("button", { name: "Lihat Penghuni" })
      .click();
    await expect(page.getByText(`Penghuni ${KAMAR}`)).toBeVisible();
    await page.getByRole("link", { name: "Tambah Penghuni" }).click();

    // The page found its kamar: it used to read the facilities module's rooms
    // and say "Data tidak ditemukan".
    await expect(page.getByText(`${ASRAMA} - ${KAMAR}`)).toBeVisible();
    await page.getByLabel("Cari Santri").fill(NIS);
    await page.getByRole("row", { name: new RegExp(SANTRI) }).click();
    await page.getByRole("button", { name: "Tambahkan ke Kamar" }).click();

    await page.waitForURL(
      (url) => url.pathname === `/dormitories/${dormitoryId}`,
    );
    await expect(page.getByTestId("dormitory-occupied")).toHaveText("1");
    const row = page.getByRole("row", { name: new RegExp(KAMAR) });
    await expect(row.getByText("Penuh", { exact: true })).toBeVisible();
  });

  test("a kamar with a santri in it cannot be deleted, and says why", async ({
    page,
  }) => {
    await signIn(page, "SMPIT_ADMIN");
    await page.goto(`/dormitories/${dormitoryId}`);
    await page
      .getByRole("row", { name: new RegExp(KAMAR) })
      .getByRole("button", { name: `Hapus ${KAMAR}` })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Hapus" })
      .click();

    await expect(page.getByText(/masih dihuni 1 santri/).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: KAMAR })).toBeVisible();
  });

  test("a musyrif reads the asrama without the buttons, and the API agrees", async ({
    page,
  }) => {
    const musyrif = await signIn(page, "MUSYRIF");
    await page.goto(`/dormitories/${dormitoryId}`);
    await expect(page.getByRole("cell", { name: KAMAR })).toBeVisible();
    await expect(page.getByTestId("dormitory-occupied")).toHaveText("1");
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Tambah Kamar" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Hapus ${KAMAR}` }),
    ).toHaveCount(0);

    await expect(
      apiRequest(musyrif, "POST", "/dormitories/rooms", {
        dormitoryId,
        name: "Kamar Musyrif",
        capacity: 4,
      }),
    ).rejects.toThrow(/→ 403/);
  });

  test("the santri leaves; then the kamar and the asrama can go", async ({
    page,
  }) => {
    await signIn(page, "SMPIT_ADMIN");
    await page.goto(`/dormitories/${dormitoryId}`);
    await page
      .getByRole("row", { name: new RegExp(KAMAR) })
      .getByRole("button", { name: "Lihat Penghuni" })
      .click();
    await page
      .getByRole("row", { name: new RegExp(SANTRI) })
      .getByRole("button", { name: "Keluarkan" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Keluarkan" })
      .click();
    await expect(
      page.getByText("Santri berhasil dikeluarkan dari kamar"),
    ).toBeVisible();
    await expect(page.getByTestId("dormitory-occupied")).toHaveText("0");

    await page.getByRole("tab", { name: "Daftar Kamar" }).click();
    await page
      .getByRole("row", { name: new RegExp(KAMAR) })
      .getByRole("button", { name: `Hapus ${KAMAR}` })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Hapus" })
      .click();
    await expect(page.getByText("Kamar berhasil dihapus")).toBeVisible();
    await expect(page.getByRole("cell", { name: KAMAR })).toHaveCount(0);

    await page.goto("/dormitories");
    await page.getByRole("button", { name: `Hapus ${ASRAMA}` }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Hapus" })
      .click();
    await expect(page.getByText("Asrama berhasil dihapus")).toBeVisible();
    await expect(page.getByText(ASRAMA)).toHaveCount(0);
    dormitoryId = "";
  });
});
