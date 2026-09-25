/**
 * Perizinan, from request to return, as the people who use it.
 *
 * Until 2026-09-25 none of this worked: the web filed permits with field names
 * and types the API refused (400 on every Simpan), the Setujui/Tolak buttons
 * called routes the API did not have, the gate recorded a return through a
 * route that completed permits nobody had used, and every yayasan organ could
 * approve while no kepala sekolah could. This walks the chain the way it is
 * meant to run:
 *
 *   wali files it → kepala SMP IT approves it from Perizinan → keamanan
 *   records leaving and coming back at Pos Gerbang
 *
 * Accounts come from DEMO_ACCOUNTS (the seed links the SMP IT demo wali to the
 * SMP IT demo pupil), so no password is written down here a second time.
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

function demoLogin(roleCode: string) {
  const account = DEMO_ACCOUNTS.find((a) => a.roleCode === roleCode);
  if (!account) throw new Error(`No demo account for ${roleCode}`);
  return { email: account.email, password: account.password };
}

async function signIn(page: Page, roleCode: string): Promise<AuthSession> {
  const session = await apiLogin(demoLogin(roleCode));
  await injectSession(page, session);
  return session;
}

/** A `datetime-local` value `days` from now at `hour`:00, in the browser's zone. */
function localInput(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

test.describe.configure({ mode: "serial" });

test.describe("Perizinan — ajukan, setujui, keluar, kembali", () => {
  // Unique per run, so the row is found again and reruns never overlap.
  const stamp = Date.now().toString(36);
  const reason = `Menghadiri pernikahan kakak (e2e ${stamp})`;
  // Far enough ahead that no other run's permit shares the dates.
  const offset = 400 + (Date.now() % 3000);

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini menulis izin, jadi dilewati",
    );
  });

  test("the wali files a permit for their child", async ({ page }) => {
    await signIn(page, "SMPIT_ORANG_TUA");
    await page.goto("/parent/permits");

    await page.getByRole("button", { name: "Ajukan Izin" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Jenis izin").click();
    await page.getByRole("option", { name: "Pulang", exact: true }).click();
    await dialog.getByLabel("Berangkat").fill(localInput(offset, 13));
    await dialog.getByLabel("Kembali").fill(localInput(offset + 2, 17));
    await dialog.getByLabel("Alasan").fill(reason);
    await dialog.getByRole("button", { name: "Kirim Pengajuan" }).click();

    await expect(page.getByText("Pengajuan izin terkirim")).toBeVisible();
    // The innermost element holding both the reason and a status: the card.
    const card = page
      .locator("div")
      .filter({ has: page.getByText(reason, { exact: true }) })
      .filter({ has: page.getByText("Menunggu", { exact: true }) })
      .last();
    await expect(card).toBeVisible();
  });

  test("the kepala SMP IT approves it from Perizinan", async ({ page }) => {
    await signIn(page, "SMPIT_KEPALA_SEKOLAH");
    await page.goto("/");
    await page
      .locator("aside")
      .getByRole("link", { name: "Perizinan", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/permits");

    const row = page.getByRole("row", { name: new RegExp(stamp) });
    await expect(row.getByText("Menunggu")).toBeVisible();
    await row.getByRole("button", { name: "Setujui" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Setujui" })
      .click();

    await expect(page.getByText("Izin disetujui")).toBeVisible();
    await expect(row.getByText("Disetujui")).toBeVisible();
    await expect(row.getByRole("button", { name: "Setujui" })).toHaveCount(0);
  });

  test("keamanan records leaving and coming back at Pos Gerbang", async ({
    page,
  }) => {
    const session = await signIn(page, "KEAMANAN");
    const list = await apiRequest<{
      data: { code: string; reason: string }[];
    }>(session, "GET", "/permits?status=APPROVED&limit=100");
    const permit = list.data.find((p) => p.reason === reason);
    expect(permit, "the approved permit is visible to keamanan").toBeTruthy();

    await page.goto("/permits");
    await page.getByRole("link", { name: "Pos gerbang" }).click();
    await page.waitForURL((url) => url.pathname === "/permits/gate");

    await page.getByLabel("Kode izin").fill(permit!.code.toLowerCase());
    await page.getByRole("button", { name: "Periksa" }).click();
    await expect(page.getByText("Disetujui").first()).toBeVisible();

    await page.getByRole("button", { name: "Catat keluar" }).click();
    await expect(page.getByText("Keberangkatan dicatat")).toBeVisible();
    await expect(page.getByText("Sedang di luar").first()).toBeVisible();

    await page.getByRole("button", { name: "Catat kembali" }).click();
    await expect(page.getByText("Kepulangan dicatat")).toBeVisible();
    await expect(page.getByText(/Sudah kembali/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Catat/ })).toHaveCount(0);
  });

  test("the bendahara has no part in it: no menu entry, and the API refuses", async ({
    page,
  }) => {
    const session = await signIn(page, "SMPIT_BENDAHARA");
    await page.goto("/");
    await expect(page.locator("aside")).toBeVisible();
    await expect(
      page
        .locator("aside")
        .getByRole("link", { name: "Perizinan", exact: true }),
    ).toHaveCount(0);

    await expect(apiRequest(session, "GET", "/permits")).rejects.toThrow(
      /→ 403/,
    );
  });
});
