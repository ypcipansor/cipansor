import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { waitForLoadingComplete, waitForToast } from "./helpers/page-helpers";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";
import type { UnitAccreditationList } from "../../../packages/shared/src/schemas/accreditation";

/**
 * A unit's accreditation (decided 2026-09-28, decisions/akreditasi-unit.md):
 * the unit's admin records the certificate with its PDF from *Sistem → Profil
 * Unit*; the kepala sekolah reads it from *Ringkasan → Profil Unit* and cannot
 * change it; another unit's admin does not reach it; the EMIS export states
 * the certificate in force. TK Qur'an, newly founded, has none yet — its admin
 * finds the empty state and the button to record one when it comes.
 */

test.describe.configure({ mode: "serial" });

const account = (email: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!found) throw new Error(`No demo account ${email}`);
  return { email: found.email, password: found.password };
};

/** A small, well-formed PDF: the API checks the bytes, not the name. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const stamp = Date.now().toString(36).toUpperCase();
const CERTIFICATE = `E2E-${stamp}/32/SMP/2023`;

let admin: AuthSession;
let kepala: AuthSession;
let adminSd: AuthSession;
let unitId = "";

const listOf = (session: AuthSession) =>
  apiRequest<{ data: UnitAccreditationList }>(
    session,
    "GET",
    `/units/${unitId}/accreditations`,
  );

const statusOf = (call: Promise<unknown>) =>
  call.then(
    () => 200,
    (error: Error) => Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
  );

/** What this file recorded: certificates whose number carries the E2E mark. */
const purge = async () => {
  for (const a of (await listOf(admin)).data.accreditations) {
    if (a.certificateNumber.startsWith("E2E-")) {
      await apiRequest(
        admin,
        "DELETE",
        `/units/${unitId}/accreditations/${a.id}`,
      );
    }
  }
};

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini menulis catatan akreditasi, jadi dilewati",
  );
  admin = await apiLogin(account("smpit.admin@cipansor.or.id"));
  kepala = await apiLogin(account("smpit.kepala@cipansor.or.id"));
  adminSd = await apiLogin(account("sdit.admin@cipansor.or.id"));
  unitId = (admin.user as { unitId: string }).unitId;
  expect(unitId, "the SMP admin belongs to a unit").toBeTruthy();
  await purge();
});

test.afterAll(async () => {
  if (admin && unitId) await purge().catch(() => undefined);
});

test("the unit's admin records the certificate with its PDF (Sistem → Profil Unit)", async ({
  page,
}) => {
  await injectSession(page, admin);
  await page.goto("/dashboard");
  await page
    .getByRole("complementary", { name: "Menu utama" })
    .getByRole("link", { name: "Profil Unit" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/units/${unitId}$`));
  await waitForLoadingComplete(page);

  await page.getByRole("button", { name: "Catat Akreditasi" }).click();
  const dialog = page.getByRole("dialog");
  // The form names what is missing before it sends anything.
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toContainText("Pilih peringkat");
  await expect(dialog).toContainText("Unggah PDF sertifikatnya");

  await dialog.getByLabel("B", { exact: true }).check();
  await dialog.getByLabel("Nomor sertifikat").fill(CERTIFICATE);
  await dialog.getByLabel("Nomor SK").fill("036/BAN-PDM/SK/2023");
  await dialog.getByLabel("Tanggal SK").fill("2023-08-29");
  await dialog.getByLabel("Berlaku sampai").fill("2028-08-29");
  await dialog.getByLabel("PDF sertifikat").setInputFiles({
    name: "sertifikat.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await waitForToast(page, /akreditasi dicatat/i);

  await expect(page.getByText("Terakreditasi B")).toBeVisible();
  await expect(page.getByText("Berlaku sampai 29 Agustus 2028")).toBeVisible();

  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: `Unduh sertifikat ${CERTIFICATE}` })
    .click();
  const file = await download;
  const path = await file.path();
  const bytes = await (await import("fs/promises")).readFile(path!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
});

test("the kepala sekolah reads it and cannot change it (Ringkasan → Profil Unit)", async ({
  page,
}) => {
  await injectSession(page, kepala);
  await page.goto("/dashboard");
  await page
    .getByRole("complementary", { name: "Menu utama" })
    .getByRole("link", { name: "Profil Unit" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/units/${unitId}$`));
  await waitForLoadingComplete(page);
  await expect(page.getByText("Terakreditasi B")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Catat Akreditasi" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit Unit" })).toHaveCount(0);

  expect((await listOf(kepala)).data.canWrite).toBe(false);
});

test("another unit's admin does not reach it; the EMIS export states it", async () => {
  expect(await statusOf(listOf(adminSd))).toBe(404);

  const emis = await apiRequest<{ data: { akreditasi: string } }>(
    admin,
    "GET",
    `/emis/export/institution/${unitId}`,
  );
  expect(emis.data.akreditasi).toBe("B");
});

test("TK Qur'an, with none yet, finds where to record one", async ({
  page,
}) => {
  await injectSession(
    page,
    await apiLogin(account("tkq.admin@cipansor.or.id")),
  );
  await page.goto("/units/mine");
  await expect(page).toHaveURL(/\/units\/[0-9a-f-]{36}$/);
  await waitForLoadingComplete(page);
  await expect(page.getByText("Belum ada akreditasi tercatat")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Catat Akreditasi" }),
  ).toBeVisible();
});
