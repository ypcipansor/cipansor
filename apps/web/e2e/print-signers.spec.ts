/**
 * What a printed document says about who signs it, and where.
 *
 * Print pages used to write an invented head — "H. Ahmad Fauzi" with an
 * invented NIP, "Kepala Madrasah", "Bandung" — under rapor and surat
 * keterangan. They now read the unit's head from the data (`GET
 * /units/:id/head`): the one holder of the unit's head role. And the pages
 * that print from a window of their own (transcripts, certificates, kartu
 * santri, surat keterangan) are stamped on a test copy like every other
 * printed page.
 *
 * Read-only: nothing is written. Passwords come from DEMO_ACCOUNTS.
 */
import { test, expect } from "@playwright/test";
import { TEST_COPY_STAMP } from "../../../packages/shared/src/types/environment";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";
import {
  apiLogin,
  apiRequest,
  injectSession,
  type AuthSession,
} from "./helpers/auth-api";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

const byRole = (code: string) => {
  const a = DEMO_ACCOUNTS.find((d) => d.roleCode === code);
  if (!a) throw new Error(`No demo account for ${code}`);
  return a;
};
const ADMIN = byRole("SMPIT_ADMIN");
const KEPALA = byRole("SMPIT_KEPALA_SEKOLAH");

test.describe("Penanda tangan dokumen cetak", () => {
  let admin: AuthSession;
  let smp = "";

  test.beforeAll(async () => {
    admin = await apiLogin(ADMIN);
    smp = (admin.user as { unitId: string }).unitId;
  });

  test("the unit's head is whom the data names", async () => {
    const { data } = await apiRequest<{
      data: { name: string; title: string } | null;
    }>(admin, "GET", `/units/${smp}/head`);

    expect(data?.name).toBe(KEPALA.name);
    expect(data?.title).toMatch(/^Kepala SMP IT/);
  });

  test("the rapor print signs with that head, in Tasikmalaya", async ({
    page,
  }) => {
    const list = await apiRequest<{ data: Array<{ id: string }> }>(
      admin,
      "GET",
      "/assessment/report-cards?limit=1",
    );
    test.skip(!list.data.length, "no report card in this unit");

    await injectSession(page, admin);
    await page.goto(
      `/assessment/report-cards/${list.data[0].id}/print-merdeka`,
    );

    await expect(page.getByTestId("rapor-head")).toContainText(KEPALA.name);
    await expect(page.getByTestId("rapor-unit")).toContainText("SMP IT");
    await expect(page.getByText(/KEMENTERIAN AGAMA|NSM:/)).toHaveCount(0);
    await expect(
      page.getByText(/Ahmad Fauzi|Bandung|Kepala Madrasah/),
    ).toHaveCount(0);
    await expect(page.getByText(/^Tasikmalaya,/).first()).toBeVisible();
  });

  test("a document printed from its own window carries the test-copy stamp where the API says so", async ({
    page,
  }) => {
    const { data: env } = (await (
      await fetch(`${API_URL}/environment`)
    ).json()) as { data: { testCopy: boolean } };

    await injectSession(page, admin);
    await page.goto("/students/transcript");
    // The santri list: a name per row.
    const firstSantri = page
      .locator("div.cursor-pointer p.font-medium.truncate")
      .first();
    await expect(firstSantri).toBeVisible();
    // Keep the print window open to read it: the page prints, then closes it.
    await page.evaluate(() => {
      const open = window.open.bind(window);
      window.open = (...args: Parameters<typeof window.open>) => {
        const w = open(...args);
        if (w) {
          w.print = () => {};
          w.close = () => {};
        }
        return w;
      };
    });

    await firstSantri.click();
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Cetak Transkrip" }).first().click(),
    ]);
    await popup.waitForLoadState();
    const html = await popup.content();

    expect(html.includes(TEST_COPY_STAMP)).toBe(env.testCopy);
  });

  test("Pengaturan → Profil shows the signed-in account, not an invented one", async ({
    page,
  }) => {
    await injectSession(page, admin);
    await page.goto("/settings?tab=profile");

    const profile = page.getByTestId("settings-profile");
    await expect(profile).toContainText(ADMIN.email);
    await expect(profile).not.toContainText("Ahmad Fauzi");
  });
});
