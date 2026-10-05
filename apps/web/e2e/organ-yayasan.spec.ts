/**
 * The yayasan's office holders, as it published them (office-holders.ts):
 *
 * - the public site shows the full structure — Pembina, Pengawas, Pengurus
 *   and the pesantren's own — in each of its three languages;
 * - the portal's Organ Yayasan tab lists who holds office in each organ, with
 *   no invented start date, and the Ketua can add, date and remove a member
 *   through its forms (until 2026-10-02 both forms always failed: they sent a
 *   calendar day and no foundation, and the API wanted a date-time and one).
 *
 * Passwords come from DEMO_ACCOUNTS. The portal half writes, so it is skipped
 * against production; the member it adds is removed through the page itself,
 * and again in afterAll should a step fail.
 */
import { test, expect, type Page } from "@playwright/test";
import { ORGANISATION } from "../../../packages/shared/src/types/office-holders";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";
import { LOCALE_COOKIE, type Locale } from "../src/locales";
import {
  pagesContentFor,
  STRUCTURE_POSITIONED,
} from "../src/config/pages.i18n";
import {
  apiLogin,
  apiRequest,
  injectSession,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";

const KETUA = DEMO_ACCOUNTS.find((a) => a.roleCode === "YAYASAN_KETUA")!;

test.describe("Struktur organisasi di situs publik", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const locale of ["id", "en", "ar"] as Locale[]) {
    test(`every office holder, by group (${locale})`, async ({
      page,
      context,
      baseURL,
    }) => {
      const url = new URL(baseURL ?? "http://localhost:3000");
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: url.hostname, path: "/" },
      ]);
      const copy = pagesContentFor(locale).leadership;

      await page.goto("/profil/pimpinan");
      const structure = page.getByTestId("org-structure");
      await expect(
        structure.getByRole("heading", { name: copy.structure.heading }),
      ).toBeVisible();

      for (const group of ORGANISATION) {
        const box = structure.getByTestId(`org-group-${group.slug}`);
        await expect(
          box.getByRole("heading", { name: copy.structure.groups[group.slug] }),
        ).toBeVisible();
        for (const holder of group.holders) {
          // .first(): one person can hold two offices in a group.
          await expect(
            box.getByText(holder.name, { exact: true }).first(),
          ).toBeVisible();
          if (STRUCTURE_POSITIONED.includes(group.slug)) {
            await expect(
              box
                .getByText(copy.structure.positions[holder.slug], {
                  exact: true,
                })
                .first(),
            ).toBeVisible();
          }
        }
        // A portrait where the yayasan published one, and it loads. They are
        // lazy-loaded, so bring each into view first.
        for (const holder of group.holders.filter((h) => h.photo)) {
          const img = box
            .getByRole("img", { name: copy.photoAlt(holder.name) })
            .first();
          await img.scrollIntoViewIfNeeded();
          await expect
            .poll(
              () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth),
              { message: holder.name },
            )
            .toBeGreaterThan(0);
        }
      }

      // Latin names and Indonesian mottos keep their punctuation where it
      // belongs on the Arabic page too.
      await expect(page.locator("main h2 bdi").first()).toBeAttached();
      await expect(
        page.locator('blockquote[lang="id"]').first(),
      ).toHaveAttribute("dir", "ltr");

      // The brochure's staff phone numbers are personal; none is published.
      await expect(structure).not.toContainText(/(\+62|\b0)8\d{7,}/);
    });
  }
});

test.describe("Organ Yayasan di portal", () => {
  test.describe.configure({ mode: "serial" });

  const name = `Pengawas Uji e2e ${Date.now().toString(36)}`;
  let ketua: AuthSession;

  test.beforeAll(async () => {
    test.skip(await isProductionApi(), "writes a board member");
    ketua = await apiLogin(KETUA);
  });

  test.afterAll(async () => {
    if (!ketua) return;
    const list = await apiRequest<{
      data: Array<{ id: string; name: string }>;
    }>(
      ketua,
      "GET",
      `/foundation/board-members?search=${encodeURIComponent(name)}`,
    );
    for (const m of list.data.filter((x) => x.name === name)) {
      await apiRequest(ketua, "DELETE", `/foundation/board-members/${m.id}`);
    }
  });

  async function openOrgans(page: Page) {
    const listed = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname.endsWith("/foundation/board-members") &&
        r.ok(),
    );
    await page.goto("/foundation?tab=board");
    await listed;
  }
  const organ = (page: Page, slug: string) =>
    page.getByTestId(`board-organ-${slug}`);

  test("lists the real office holders by organ, with no invented dates", async ({
    page,
  }) => {
    await injectSession(page, ketua);
    await openOrgans(page);

    for (const group of ORGANISATION.filter((g) => g.slug !== "pesantren")) {
      for (const holder of group.holders) {
        await expect(
          organ(page, group.slug).getByText(holder.name, { exact: true }),
        ).toBeVisible();
      }
    }
    await expect(page.getByText("KH. Muhammad Yusuf")).toHaveCount(0);
    await expect(
      page.getByTestId("board-member").filter({ hasText: "Sejak" }),
    ).toHaveCount(0);
  });

  test("the Ketua adds a member, dates the term, and removes it", async ({
    page,
  }) => {
    await injectSession(page, ketua);
    await openOrgans(page);

    await page.getByRole("link", { name: "Tambah" }).click();
    await page.getByLabel("Nama Lengkap").fill(name);
    await page.getByLabel("Jabatan").fill("Pengawas");
    await page.getByRole("button", { name: "Simpan" }).click();

    // Back on the organ tab, filed under Pengawas, with no start date.
    await expect(page).toHaveURL(/\/foundation\?tab=board$/);
    const card = organ(page, "pengawas")
      .getByTestId("board-member")
      .filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText("Sejak");

    await card.getByRole("link", { name: `Edit ${name}` }).click();
    await expect(page.getByLabel("Nama Lengkap")).toHaveValue(name);
    await page.getByLabel("Tanggal Mulai").fill("2022-05-01");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page).toHaveURL(/\/foundation\?tab=board$/);
    await expect(card).toContainText("Sejak 1 Mei 2022");

    await card.getByRole("button", { name: `Hapus ${name}` }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Hapus" })
      .click();
    await expect(card).toHaveCount(0);
  });
});
