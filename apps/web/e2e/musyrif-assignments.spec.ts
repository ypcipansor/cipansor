/**
 * Penugasan musyrif, from the asrama page.
 *
 * Until 2026-09-26 nothing in the app could assign a musyrif: the table was
 * read by "Santri saya", by the kamar access check and by the permit decider,
 * and written only by the seed. This walks the assignment the way the
 * Pimpinan Pesantren makes it, and shows it take effect:
 *
 *   Asrama → an asrama → Musyrif → Tugaskan musyrif (a kamar with santri)
 *   → the musyrif's "santri saya" now lists that kamar → Akhiri → it is gone
 *
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

function demo(match: (a: (typeof DEMO_ACCOUNTS)[number]) => boolean) {
  const account = DEMO_ACCOUNTS.find(match);
  if (!account) throw new Error("No such demo account");
  return { email: account.email, password: account.password };
}
const byRole = (roleCode: string) => demo((a) => a.roleCode === roleCode);
/** The murabbi persona: a musyrif who looks after no kamar in the seed. */
const murabbi = demo((a) => a.email.startsWith("pesantren.murabbi@"));

async function signIn(page: Page, roleCode: string): Promise<AuthSession> {
  const session = await apiLogin(byRole(roleCode));
  await injectSession(page, session);
  return session;
}

type RoomRow = { id: string; name: string; _count?: { assignments: number } };
type Santri = { id: string; room: string };

test.describe.configure({ mode: "serial" });

test.describe("Penugasan musyrif — tugaskan, berlaku, akhiri", () => {
  let dormitoryId = "";
  let room: RoomRow;

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini menulis penugasan, jadi dilewati",
    );
    const kiai = await apiLogin(byRole("PESANTREN_PENGASUH"));
    const dorms = await apiRequest<{ data: { id: string; name: string }[] }>(
      kiai,
      "GET",
      "/dormitories?limit=50",
    );
    const putra = dorms.data.find((d) => /putra/i.test(d.name));
    expect(putra, "the seed has a putra asrama").toBeTruthy();
    dormitoryId = putra!.id;
    const rooms = await apiRequest<{ data: RoomRow[] }>(
      kiai,
      "GET",
      `/dormitories/rooms/list?dormitoryId=${dormitoryId}&limit=100`,
    );
    const lived = rooms.data.find((r) => (r._count?.assignments ?? 0) > 0);
    expect(lived, "a kamar of that asrama has santri").toBeTruthy();
    room = lived!;
  });

  test("the murabbi looks after no kamar yet", async () => {
    const session = await apiLogin(murabbi);
    const mine = await apiRequest<{ data: Santri[] }>(
      session,
      "GET",
      "/dormitories/my-students",
    );
    expect(mine.data.filter((s) => s.room === room.name)).toHaveLength(0);
  });

  test("the Pimpinan Pesantren assigns them to a kamar from the asrama page", async ({
    page,
  }) => {
    await signIn(page, "PESANTREN_PENGASUH");
    await page.goto("/");
    await page
      .locator("aside")
      .getByRole("link", { name: "Asrama", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/dormitories");
    await page.goto(`/dormitories/${dormitoryId}`);

    // The kamar list loads: it called a route the API never had until now.
    await expect(page.getByRole("cell", { name: room.name })).toBeVisible();
    // And the asrama says what it is: every asrama used to read "Putri" and
    // "Tidak Aktif", because the page read fields the API does not send.
    await expect(page.getByText("Putra", { exact: true })).toBeVisible();
    await expect(page.getByText("Tidak Aktif", { exact: true })).toHaveCount(0);

    await page.getByRole("tab", { name: "Musyrif" }).click();
    await page.getByRole("button", { name: "Tugaskan musyrif" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Cari nama").fill("Salman");
    await dialog.getByLabel("Musyrif", { exact: true }).click();
    await page.getByRole("option", { name: /Salman Alfarisi/ }).click();
    await dialog.getByLabel("Cakupan").click();
    await page.getByRole("option", { name: room.name, exact: true }).click();
    await dialog.getByRole("button", { name: "Tugaskan" }).click();

    await expect(page.getByText("Musyrif ditugaskan")).toBeVisible();
    const row = page.getByRole("row", { name: /Salman Alfarisi/ });
    await expect(row.getByRole("cell", { name: room.name })).toBeVisible();
    await expect(row.getByText("Pembina (wali kamar)")).toBeVisible();
  });

  test("the assignment takes effect: the kamar's santri are now the murabbi's", async () => {
    const session = await apiLogin(murabbi);
    const mine = await apiRequest<{ data: Santri[] }>(
      session,
      "GET",
      "/dormitories/my-students",
    );
    expect(mine.data.filter((s) => s.room === room.name).length).toBe(
      room._count!.assignments,
    );
  });

  test("a school's admin does not staff the asrama (403)", async () => {
    const admin = await apiLogin(byRole("SMPIT_ADMIN"));
    await expect(
      apiRequest(admin, "POST", `/dormitories/${dormitoryId}/musyrif`, {
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toThrow(/→ 403/);
  });

  test("ending it takes the kamar back", async ({ page }) => {
    await signIn(page, "PESANTREN_PENGASUH");
    await page.goto(`/dormitories/${dormitoryId}`);
    await page.getByRole("tab", { name: "Musyrif" }).click();
    const row = page.getByRole("row", { name: /Salman Alfarisi/ });
    await row.getByRole("button", { name: "Akhiri" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Akhiri" })
      .click();
    await expect(page.getByText("Penugasan diakhiri")).toBeVisible();
    await expect(row).toHaveCount(0);

    const session = await apiLogin(murabbi);
    const mine = await apiRequest<{ data: Santri[] }>(
      session,
      "GET",
      "/dormitories/my-students",
    );
    expect(mine.data.filter((s) => s.room === room.name)).toHaveLength(0);
  });
});
