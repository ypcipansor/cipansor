import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

/**
 * Notification preferences are stored, and the wali reaches them.
 *
 * Until 2026-10-03 the settings page "saved" into a 500 ms timer and the API
 * had no route for it: every toggle came back on at the next visit, and the
 * push dispatcher had nothing to read. The wali's own page asked an endpoint
 * that never existed. These check the round trip through the real API, the
 * way a person sees it — save, reload, still saved.
 */

const SETTINGS = "/notifications/settings";

/** The switch on the row whose label is `label`. */
function switchFor(page: Page, label: string) {
  return page
    .locator("div.flex.items-center.justify-between")
    .filter({ has: page.getByText(label, { exact: true }) })
    .getByRole("switch");
}

async function save(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/notifications/preferences") &&
        r.request().method() === "PATCH",
    ),
    page.getByRole("button", { name: "Simpan" }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect(
    page.getByText("Pengaturan notifikasi berhasil disimpan"),
  ).toBeVisible();
}

test.describe("Notification preferences", () => {
  test("a switched-off kind stays off after a reload", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto(SETTINGS);

    const announcements = switchFor(page, "Pengumuman");
    await expect(announcements).toBeVisible();
    // Start from the default so a rerun on a reused database is meaningful.
    if ((await announcements.getAttribute("aria-checked")) === "false") {
      await announcements.click();
      await save(page);
    }

    await announcements.click();
    await expect(announcements).toHaveAttribute("aria-checked", "false");
    await save(page);

    await page.reload();
    await expect(switchFor(page, "Pengumuman")).toHaveAttribute(
      "aria-checked",
      "false",
    );

    // Put it back for whoever runs next.
    await switchFor(page, "Pengumuman").click();
    await save(page);
  });

  test("quiet hours are stored as typed, in WIB", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto(SETTINGS);

    const quiet = page.getByRole("switch", { name: "Jam Tenang" });
    if ((await quiet.getAttribute("aria-checked")) === "true") {
      await quiet.click();
      await save(page);
    }

    await quiet.click();
    await page.getByLabel("Mulai (WIB)").fill("22:15");
    await page.getByLabel("Selesai (WIB)").fill("04:45");
    await save(page);

    await page.reload();
    await expect(page.getByLabel("Mulai (WIB)")).toHaveValue("22:15");
    await expect(page.getByLabel("Selesai (WIB)")).toHaveValue("04:45");

    await page.getByRole("switch", { name: "Jam Tenang" }).click();
    await save(page);
    await page.reload();
    await expect(page.getByLabel("Mulai (WIB)")).toHaveCount(0);
  });

  test("the wali's old preferences address moves permanently to the one page", async ({
    page,
  }) => {
    await loginAs(page, "parent");
    const response = await page.request.get(
      "/parent/notifications/preferences",
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toContain(SETTINGS);
  });

  test("My Notifications leads to the settings page", async ({ page }) => {
    await loginAs(page, "teacher");
    await page.goto("/notifications/me");
    await page.getByRole("link", { name: "Pengaturan" }).click();
    await expect(page).toHaveURL(new RegExp(SETTINGS));
    await expect(page.getByText("Pengaturan Notifikasi").first()).toBeVisible();
  });
});
