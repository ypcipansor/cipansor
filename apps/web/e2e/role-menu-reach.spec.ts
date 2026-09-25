/**
 * Each role reaches the page it exists for by clicking its own menu.
 *
 * Found on 2026-09-25 by printing every role's menu: the yayasan organs had no
 * link to the planning chain they ratify, the kepala sekolah was refused the
 * page on which they draft the RKA Unit, and the pustakawan, laboran and
 * business-unit staff could not open their own modules. The existing specs
 * stayed green because they open pages by URL — so this one never types a
 * URL after the first page: it clicks the sidebar, as a person would.
 *
 * Accounts come from DEMO_ACCOUNTS, the list the seed itself reads, so no
 * password is written down here a second time.
 */
import { test, expect } from "@playwright/test";
import { apiLogin, injectSession } from "./helpers/auth-api";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

function demoLogin(roleCode: string) {
  const account = DEMO_ACCOUNTS.find((a) => a.roleCode === roleCode);
  if (!account) throw new Error(`No demo account for ${roleCode}`);
  return { email: account.email, password: account.password };
}

const cases = [
  {
    roleCode: "YAYASAN_PENGAWAS",
    link: "Perencanaan Strategis",
    path: "/perencanaan",
  },
  {
    roleCode: "SMPIT_KEPALA_SEKOLAH",
    link: "Perencanaan Strategis",
    path: "/perencanaan",
  },
  { roleCode: "PUSTAKAWAN", link: "Perpustakaan", path: "/library" },
  { roleCode: "LABORAN", link: "Inventaris", path: "/inventory" },
  { roleCode: "BUSINESS_MANAGER", link: "Unit Usaha", path: "/unit-usaha" },
];

for (const { roleCode, link, path } of cases) {
  test(`${roleCode} opens ${path} from its own sidebar`, async ({ page }) => {
    await injectSession(page, await apiLogin(demoLogin(roleCode)));

    // The root sends each role to its own dashboard.
    await page.goto("/");
    const sidebar = page.locator("aside");
    const entry = sidebar.getByRole("link", { name: link, exact: true });
    await expect(entry).toBeVisible();

    await entry.click();
    await page.waitForURL((url) => url.pathname === path);
    // A refusal redirects to the role's dashboard, so staying on the page once
    // it has rendered is the whole assertion.
    await expect(page.locator("main#main-content")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  });
}

test("tata usaha does not get the service pages that are not its job", async ({
  page,
}) => {
  await injectSession(page, await apiLogin(demoLogin("SMPIT_TATA_USAHA")));
  await page.goto("/");
  const sidebar = page.locator("aside");
  await expect(
    sidebar.getByRole("link", { name: "Keuangan", exact: true }),
  ).toBeVisible();
  for (const name of ["Perpustakaan", "Inventaris", "Unit Usaha"]) {
    await expect(sidebar.getByRole("link", { name, exact: true })).toHaveCount(
      0,
    );
  }

  // And typing the address is refused as well: back to the staff dashboard.
  await page.goto("/library");
  await page.waitForURL((url) => url.pathname !== "/library");
  expect(new URL(page.url()).pathname).toBe("/staff");
});
