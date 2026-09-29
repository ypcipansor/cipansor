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
import type { UnitSummary } from "../../../packages/shared/src/types/unit";

/**
 * A unit's profile (*Sistem → Profil Unit*): the unit's admin records its NPSN
 * through Edit Unit — a form that could not save at all before: it opened with
 * the type blank and refused itself, and past that it sent PATCH to an API
 * that only served PUT — and cannot change the unit's type; the statistics are the unit's counts, not a dash; the kepala sekolah
 * reads the page without an Edit button; another unit's admin reaches neither.
 */

test.describe.configure({ mode: "serial" });

const account = (email: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!found) throw new Error(`No demo account ${email}`);
  return { email: found.email, password: found.password };
};

const NPSN = "69988558";

let admin: AuthSession;
let kepala: AuthSession;
let adminSd: AuthSession;
let unitId = "";
let before: { npsn: string | null; phone: string | null } = {
  npsn: null,
  phone: null,
};

const statusOf = (call: Promise<unknown>) =>
  call.then(
    () => 200,
    (error: Error) => Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
  );

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini mengubah data unit, jadi dilewati",
  );
  admin = await apiLogin(account("smpit.admin@cipansor.or.id"));
  kepala = await apiLogin(account("smpit.kepala@cipansor.or.id"));
  adminSd = await apiLogin(account("sdit.admin@cipansor.or.id"));
  unitId = (admin.user as { unitId: string }).unitId;
  expect(unitId, "the SMP admin belongs to a unit").toBeTruthy();
  const { data } = await apiRequest<{
    data: { npsn: string | null; phone: string | null };
  }>(admin, "GET", `/units/${unitId}`);
  before = { npsn: data.npsn, phone: data.phone };
  // Start from a unit with no NPSN, so the page's empty state is what we see.
  await apiRequest(admin, "PATCH", `/units/${unitId}`, { npsn: null });
});

test.afterAll(async () => {
  if (admin && unitId) {
    await apiRequest(admin, "PATCH", `/units/${unitId}`, before).catch(
      () => undefined,
    );
  }
});

test("the unit's admin records the NPSN through Edit Unit (Sistem → Profil Unit)", async ({
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
  await expect(page.getByTestId("unit-npsn")).toContainText("Belum diisi");

  await page.getByRole("link", { name: "Edit Unit" }).click();
  await expect(page).toHaveURL(new RegExp(`/units/${unitId}/edit$`));
  await expect(page.getByLabel("Nama Unit *")).not.toHaveValue("");

  // The unit's type is shown — the form used to open with it blank and then
  // refuse to save ("Tipe unit wajib dipilih") — and is the Super Admin's to
  // change.
  await expect(page.locator("#type")).toContainText("SMP Islam Terpadu");
  await expect(page.locator("#type")).toBeDisabled();
  await expect(
    page.getByText("Hanya Super Admin yang dapat mengubah jenis unit."),
  ).toBeVisible();

  // A mistyped NPSN is caught before anything is sent.
  await page.getByLabel("NPSN").fill("6998855");
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await expect(page.getByText("NPSN terdiri dari 8 angka")).toBeVisible();

  await page.getByLabel("NPSN").fill(NPSN);
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await waitForToast(page, /Unit berhasil diperbarui/);

  await expect(page).toHaveURL(new RegExp(`/units/${unitId}$`));
  await expect(page.getByTestId("unit-npsn")).toHaveText(NPSN);
});

test("the statistics are the unit's counts", async ({ page }) => {
  const { data: counts } = await apiRequest<{ data: UnitSummary }>(
    admin,
    "GET",
    `/units/${unitId}/summary`,
  );
  expect(counts.activeStudents, "the demo SMP has santri").toBeGreaterThan(0);

  await injectSession(page, admin);
  await page.goto(`/units/${unitId}`);
  await waitForLoadingComplete(page);

  const shown = (n: number) => n.toLocaleString("id-ID");
  await expect(page.getByTestId("stat-students")).toHaveText(
    shown(counts.activeStudents),
  );
  await expect(page.getByTestId("stat-teachers")).toHaveText(
    shown(counts.teachers),
  );
  await expect(page.getByTestId("stat-classes")).toHaveText(
    shown(counts.classes),
  );
});

test("the kepala sekolah reads it without an Edit button (Ringkasan → Profil Unit)", async ({
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

  await expect(page.getByTestId("unit-npsn")).toHaveText(NPSN);
  await expect(page.getByTestId("stat-students")).toHaveText(/^\d[\d.]*$/);
  await expect(page.getByRole("link", { name: "Edit Unit" })).toHaveCount(0);
  expect(
    await statusOf(
      apiRequest(kepala, "PATCH", `/units/${unitId}`, { name: "Diganti" }),
    ),
  ).toBe(403);
});

test("another unit's admin changes nothing here", async ({ page }) => {
  expect(
    await statusOf(
      apiRequest(adminSd, "PATCH", `/units/${unitId}`, { name: "Diganti" }),
    ),
  ).toBe(404);
  expect(
    await statusOf(apiRequest(adminSd, "GET", `/units/${unitId}/summary`)),
  ).toBe(404);

  await injectSession(page, adminSd);
  await page.goto(`/units/${unitId}`);
  await waitForLoadingComplete(page);
  await expect(page.getByRole("link", { name: "Edit Unit" })).toHaveCount(0);
});
