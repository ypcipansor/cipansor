/**
 * The yayasan's organs oversee every unit. Pengawasan Internal, Manajemen
 * Risiko and Kepatuhan Syariah used to turn the Pengawas and the Ketua away
 * with "Unit ID required" — their accounts belong to no unit — while a unit's
 * admin could read another unit's audits. Now the organs see every unit,
 * narrow to one, and name the unit of what they create; a unit's own staff
 * see their unit only.
 *
 * Passwords come from DEMO_ACCOUNTS. The audit this spec schedules is
 * deleted again in afterAll.
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
  const a = DEMO_ACCOUNTS.find((d) => d.roleCode === roleCode);
  if (!a) throw new Error(`No demo account for ${roleCode}`);
  return a;
}
const PENGAWAS = byRole("YAYASAN_PENGAWAS");
const KETUA = byRole("YAYASAN_KETUA");
const SMP_ADMIN = byRole("SMPIT_ADMIN");

async function signIn(page: Page, who: { email: string; password: string }) {
  await injectSession(page, await apiLogin(who));
}

/** Opens a page and waits for its list to arrive, so "not on the list" means something. */
async function openList(page: Page, path: string, api: string) {
  const listed = page.waitForResponse(
    (r) =>
      r.request().method() === "GET" &&
      new URL(r.url()).pathname.endsWith(api) &&
      r.ok(),
  );
  await page.goto(path);
  await listed;
}

const unitFilter = (page: Page) =>
  page.getByRole("combobox", { name: "Unit", exact: true });

test.describe.configure({ mode: "serial" });

test.describe("Pengawasan untuk organ yayasan", () => {
  const title = `Audit kas e2e ${Date.now().toString(36)}`;
  let pengawas: AuthSession;
  let sd = { id: "", name: "" };
  let smp = { id: "", name: "" };

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini menulis audit, jadi dilewati",
    );
    pengawas = await apiLogin(PENGAWAS);
    const units = await apiRequest<{
      data: { id: string; name: string; type: string }[];
    }>(pengawas, "GET", "/units");
    const find = (type: string) => {
      const u = units.data.find((x) => x.type === type);
      if (!u) throw new Error(`No ${type} unit in the seed`);
      return { id: u.id, name: u.name };
    };
    sd = find("SD_IT");
    smp = find("SMP_IT");
  });

  test.afterAll(async () => {
    if (!pengawas) return;
    const audits = await apiRequest<{ data: { id: string; title: string }[] }>(
      pengawas,
      "GET",
      "/pengawasan",
    ).catch(() => ({ data: [] as { id: string; title: string }[] }));
    for (const a of audits.data.filter((x) => x.title === title)) {
      await apiRequest(pengawas, "DELETE", `/pengawasan/${a.id}`).catch(
        () => undefined,
      );
    }
  });

  test("the Pengawas schedules an audit in the unit they name, and filters by unit", async ({
    page,
  }) => {
    await signIn(page, PENGAWAS);
    // From the menu, not by URL: the page used to be missing from it.
    await page.goto("/dashboard");
    const listed = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        new URL(r.url()).pathname.endsWith("/pengawasan") &&
        r.ok(),
    );
    await page.getByRole("link", { name: "Pengawasan Internal" }).click();
    await listed;
    await expect(
      page.getByRole("heading", { name: "Pengawasan Internal" }),
    ).toBeVisible();
    await expect(page.getByText("Unit ID required")).toHaveCount(0);

    await page.getByRole("button", { name: "Jadwalkan Audit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Judul Audit").fill(title);
    await dialog.getByLabel("Tipe Audit").click();
    await page.getByRole("option", { name: "Keuangan" }).click();
    await dialog.getByLabel("Tanggal Rencana").fill("2031-03-02");
    // Without a unit the form does not send.
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog.getByText("Unit wajib dipilih")).toBeVisible();

    await dialog.getByLabel("Unit yang diaudit").click();
    await page.getByRole("option", { name: sd.name }).click();
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog).toHaveCount(0);

    const card = page.locator("[data-slot=card]", { hasText: title });
    await expect(card).toContainText(sd.name);

    // Narrowed to SMP IT, the SD IT audit is not on the list; back to SD IT, it is.
    await unitFilter(page).click();
    await page.getByRole("option", { name: smp.name }).click();
    await expect(page.getByText(title)).toHaveCount(0);
    await unitFilter(page).click();
    await page.getByRole("option", { name: sd.name }).click();
    await expect(page.getByText(title)).toBeVisible();
  });

  test("the Ketua opens Manajemen Risiko and sees each risk's unit", async ({
    page,
  }) => {
    await signIn(page, KETUA);
    await openList(page, "/risk-management", "/risk");
    await expect(
      page.getByRole("heading", { name: "Manajemen Risiko" }),
    ).toBeVisible();
    await expect(page.getByText("Unit ID required")).toHaveCount(0);
    await expect(
      page.getByRole("columnheader", { name: "Unit", exact: true }),
    ).toBeVisible();
    await expect(unitFilter(page)).toBeVisible();
  });

  test("the Pengawas reads Kepatuhan Syariah across units", async ({
    page,
  }) => {
    await signIn(page, PENGAWAS);
    await openList(page, "/syariah", "/syariah");
    await expect(
      page.getByRole("heading", { name: "Kepatuhan Syariah" }),
    ).toBeVisible();
    await expect(page.getByText("Unit ID required")).toHaveCount(0);
    await expect(unitFilter(page)).toBeVisible();
  });

  test("a unit's admin sees their own unit only, with no unit to choose", async ({
    page,
  }) => {
    await signIn(page, SMP_ADMIN);
    await openList(page, "/pengawasan", "/pengawasan");
    await expect(
      page.getByRole("heading", { name: "Pengawasan Internal" }),
    ).toBeVisible();
    await expect(unitFilter(page)).toHaveCount(0);
    // The SD IT audit the Pengawas scheduled is not theirs to see.
    await expect(page.getByText(title)).toHaveCount(0);
  });
});
