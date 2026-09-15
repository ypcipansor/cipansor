import { test, expect, type Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
  type SeedRole,
} from "./helpers/auth-api";

/**
 * Pengesahan dokumen tingkat yayasan, dijalankan oleh ketiga organnya sendiri:
 * Ketua Pengurus mengajukan → Pengawas mereviu → Ketua menanggapi → Pembina
 * menetapkan (UU 16/2001 Ps. 28 ayat 2, Ps. 31 ayat 1, Ps. 40 ayat 1). Each step
 * is taken in the UI by the organ it belongs to; the roles it does not belong
 * to are checked to see no button at all. An RKA Unit, by contrast, is approved
 * with one button that only Ketua Pengurus sees.
 *
 * The document is a fresh RKA Yayasan for a far-future year, so a rerun never
 * collides with "satu RKA Yayasan aktif per tahun" or with the seeded plans.
 */

test.describe.configure({ mode: "serial" });

type Envelope<T> = { success: boolean; data: T };
type PlanRow = { id: string; type: string; status: string };

const year = 2100 + (Date.now() % 7000);
const period = {
  startDate: `${year}-01-01T00:00:00.000Z`,
  endDate: `${year}-12-31T00:00:00.000Z`,
};
const REVIEW = "Pagu belanja pegawai naik tanpa kenaikan jumlah santri; mohon dasarnya.";
const RESPONSE = "Kenaikan mengikuti penyesuaian gaji guru hasil rapat pleno pengurus.";

let planId = "";
let unitPlanId = "";

async function signIn(page: Page, role: SeedRole) {
  await injectSession(page, await apiLogin(SEED_USERS[role]));
}

/** Open the yayasan document as `role` and wait for its ratification panel. */
async function openYayasanPlan(page: Page, role: SeedRole) {
  await signIn(page, role);
  await page.goto(`/perencanaan/${planId}`);
  const main = page.getByRole("main");
  await expect(main.getByText("Pengesahan dokumen yayasan", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  return main;
}

test.beforeAll(async () => {
  const ketua = await apiLogin(SEED_USERS.ketuaPengurus);
  const renstra = (
    await apiRequest<Envelope<PlanRow[]>>(ketua, "GET", "/perencanaan?type=RENSTRA")
  ).data.find((p) => p.status !== "COMPLETED" && p.status !== "CANCELLED");
  if (!renstra) throw new Error("the seed has no active Renstra to hang an RKA Yayasan on");

  planId = (
    await apiRequest<Envelope<PlanRow>>(ketua, "POST", "/perencanaan", {
      title: `RKA Yayasan uji pengesahan ${year}`,
      type: "RKA",
      parentId: renstra.id,
      ...period,
    })
  ).data.id;

  // The unit admin drafts the unit's own slice under it.
  const adminSdit = await apiLogin(SEED_USERS.adminSdit);
  unitPlanId = (
    await apiRequest<Envelope<PlanRow>>(adminSdit, "POST", "/perencanaan", {
      title: `RKA SD IT uji pengesahan ${year}`,
      type: "RKA",
      parentId: planId,
      ...period,
    })
  ).data.id;
});

test("draf yayasan: Pembina melihat tahapnya, bukan tombol pengajuan", async ({ page }) => {
  const main = await openYayasanPlan(page, "pembina");
  await expect(main.getByText("Menunggu Ketua Pengurus mengajukannya ke Pengawas.")).toBeVisible();
  await expect(main.getByRole("button", { name: "Ajukan ke Pengawas", exact: true })).toHaveCount(0);
  // The one-button approval is gone for yayasan documents, for everyone.
  await expect(main.getByRole("button", { name: /^(Setujui|Sahkan) / })).toHaveCount(0);
});

test("draf yayasan: Super Admin tidak mengambil langkah organ mana pun", async ({ page }) => {
  const main = await openYayasanPlan(page, "superAdmin");
  await expect(main.getByText("Menunggu Ketua Pengurus mengajukannya ke Pengawas.")).toBeVisible();
  await expect(main.getByRole("button", { name: "Ajukan ke Pengawas", exact: true })).toHaveCount(0);
});

test("Ketua Pengurus mengajukan draf ke Pengawas", async ({ page }) => {
  const main = await openYayasanPlan(page, "ketuaPengurus");
  await main.getByRole("button", { name: "Ajukan ke Pengawas", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Catatan pengantar (opsional)", { exact: true })
    .fill("Rancangan hasil rapat pengurus.");
  await dialog.getByRole("button", { name: "Ajukan ke Pengawas", exact: true }).click();

  await expect(main.getByText("Menunggu hasil reviu Pengawas.")).toBeVisible();
  await expect(main.getByText("Direviu Pengawas", { exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "Ajukan ke Pengawas", exact: true })).toHaveCount(0);
});

test("Pengawas mengirim hasil reviu — dan tidak bisa mengirim yang kosong", async ({ page }) => {
  const main = await openYayasanPlan(page, "pengawas");
  await main.getByRole("button", { name: "Kirim ke Pengurus", exact: true }).click();

  const dialog = page.getByRole("dialog");
  const send = dialog.getByRole("button", { name: "Kirim ke Pengurus", exact: true });
  await expect(send).toBeDisabled();
  await dialog.getByLabel("Hasil reviu", { exact: true }).fill(REVIEW);
  await expect(send).toBeEnabled();
  await send.click();

  await expect(main.getByText("Menunggu tanggapan Pengurus atas hasil reviu.")).toBeVisible();
});

test("Ketua menanggapi reviu dan mengajukannya ke Pembina", async ({ page }) => {
  const main = await openYayasanPlan(page, "ketuaPengurus");
  await main.getByRole("button", { name: "Ajukan ke Pembina", exact: true }).click();

  const dialog = page.getByRole("dialog");
  // The review travels with the document.
  await expect(dialog.getByText(REVIEW)).toBeVisible();
  await dialog.getByRole("radio", { name: "Tidak direvisi" }).click();
  await dialog.getByLabel("Alasan tidak merevisi", { exact: true }).fill(RESPONSE);
  await dialog.getByRole("button", { name: "Ajukan ke Pembina", exact: true }).click();

  await expect(main.getByText("Menunggu keputusan Pembina.")).toBeVisible();
});

test("Pembina menetapkan — mengembalikan wajib beralasan", async ({ page }) => {
  const main = await openYayasanPlan(page, "pembina");

  await main.getByRole("button", { name: "Kembalikan", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Kembalikan", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await main.getByRole("button", { name: "Tetapkan", exact: true }).click();
  dialog = page.getByRole("dialog");
  // Pembina decides with both the review and Pengurus' answer in front of them.
  await expect(dialog.getByText(REVIEW)).toBeVisible();
  await expect(dialog.getByText(RESPONSE)).toBeVisible();
  await dialog.getByRole("button", { name: "Tetapkan", exact: true }).click();

  await expect(main.getByText(/^Ditetapkan Pembina pada /)).toBeVisible();
  await expect(main.getByRole("button", { name: "Tetapkan", exact: true })).toHaveCount(0);
  await expect(main.getByText("Riwayat pengesahan", { exact: true })).toBeVisible();
});

test("RKA unit: admin unit tidak mengesahkan RKA-nya sendiri", async ({ page }) => {
  await signIn(page, "adminSdit");
  await page.goto(`/perencanaan/${unitPlanId}`);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { level: 1, name: `RKA SD IT uji pengesahan ${year}` }),
  ).toBeVisible({ timeout: 20000 });
  await expect(main.getByRole("button", { name: /^Sahkan / })).toHaveCount(0);
  // RKA unit never goes through the yayasan panel.
  await expect(main.getByText("Pengesahan dokumen yayasan", { exact: true })).toHaveCount(0);
});

test("RKA unit: Ketua Pengurus mengesahkannya dengan satu tombol", async ({ page }) => {
  await signIn(page, "ketuaPengurus");
  await page.goto(`/perencanaan/${unitPlanId}`);
  const main = page.getByRole("main");
  const approve = main.getByRole("button", { name: /^Sahkan RKA / });
  await expect(approve).toBeVisible({ timeout: 20000 });

  page.once("dialog", (d) => d.accept());
  await approve.click();

  await expect(approve).toHaveCount(0);
  await expect(main.getByText("Disetujui", { exact: true })).toBeVisible();
});

test.afterAll(async () => {
  // Best effort: a ratified document is not deletable, which is the point. The
  // far-future year keeps anything left behind out of every other spec's way.
  const ketua = await apiLogin(SEED_USERS.ketuaPengurus);
  for (const id of [unitPlanId, planId]) {
    if (id) await apiRequest(ketua, "DELETE", `/perencanaan/${id}`).catch(() => undefined);
  }
});
