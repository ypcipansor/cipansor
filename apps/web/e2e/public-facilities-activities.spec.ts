import { test, expect, type BrowserContext } from "@playwright/test";
import {
  annualActivities,
  campusFacilities,
} from "../../../packages/shared/src/public-site";
import { apiLogin, apiRequest, type AuthSession } from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

/**
 * Fasilitas and Kegiatan on the public site, in its three languages
 * (decisions/fasilitas-dan-kegiatan-situs-publik.md).
 *
 * The facilities and the annual events are the brochure's, from the site's
 * own config. The extracurriculars are read live from the portal's module, as
 * each unit keeps them: the seed loads the brochure's list there, and the last
 * test changes one in the portal and finds the public page following it.
 */

const setLocale = (context: BrowserContext, locale: string) =>
  context.addCookies([
    {
      name: "app-locale",
      value: locale,
      url: process.env.BASE_URL || "http://localhost:3000",
    },
  ]);

test.describe("Fasilitas", () => {
  test("lists every facility, a photograph only where one shows it", async ({
    page,
  }) => {
    await page.goto("/campus");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Fasilitas",
    );
    for (const f of campusFacilities) {
      await expect(
        page.getByRole("heading", { level: 2, name: f.name, exact: true }),
      ).toBeVisible();
    }
    const withPhoto = campusFacilities.filter((f) => f.photo).length;
    await expect(
      page.getByTestId("facilities-with-photo").locator("img"),
    ).toHaveCount(withPhoto);
    await expect(
      page.getByTestId("facilities-without-photo").locator("li"),
    ).toHaveCount(campusFacilities.length - withPhoto);
  });

  test("reads in English and Arabic, right to left", async ({
    page,
    context,
  }) => {
    await setLocale(context, "en");
    await page.goto("/campus");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Facilities",
    );
    await expect(
      page.getByRole("heading", { name: "Science Laboratory" }),
    ).toBeVisible();

    await setLocale(context, "ar");
    await page.goto("/campus");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("المرافق");
    await expect(page.getByRole("heading", { name: "المسجد" })).toBeVisible();
  });
});

test.describe("Kegiatan", () => {
  test("lists the units' extracurriculars from the portal and the annual events", async ({
    page,
  }) => {
    await page.goto("/activities");
    const list = page.getByTestId("public-extracurriculars");
    await expect(list).toBeVisible();

    // The brochure's own marks: SAPALA and Paskibra at SMA Qur'an only; the
    // rest at SD IT, SMP IT and SMA Qur'an.
    const card = (name: string) =>
      list.getByRole("listitem").filter({
        has: page.getByText(name, { exact: true }),
      });
    await expect(card("Taekwondo").getByRole("listitem")).toHaveText([
      "SD IT",
      "SMP IT",
      "SMA Qur'an",
    ]);
    await expect(card("Paskibra").getByRole("listitem")).toHaveText([
      "SMA Qur'an",
    ]);
    await expect(
      list.getByRole("heading", { name: "Kepramukaan" }),
    ).toBeVisible();

    const agenda = page.getByTestId("annual-activities");
    for (const a of annualActivities) {
      await expect(agenda.getByRole("heading", { name: a.name })).toBeVisible();
    }
  });

  test("shows each name in the reader's language", async ({
    page,
    context,
  }) => {
    await setLocale(context, "en");
    await page.goto("/activities");
    const list = page.getByTestId("public-extracurriculars");
    await expect(list.getByText("Archery", { exact: true })).toBeVisible();
    await expect(list.getByText("Memanah", { exact: true })).toHaveCount(0);

    await setLocale(context, "ar");
    await page.goto("/activities");
    await expect(
      page.getByTestId("public-extracurriculars").getByText("الرماية"),
    ).toBeVisible();
    await expect(
      page.getByTestId("annual-activities").getByText("المخيم"),
    ).toBeVisible();
  });

  test("the header reaches both pages", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const nav = page.locator("header nav").first();
    await expect(nav.getByRole("link", { name: "Fasilitas" })).toHaveAttribute(
      "href",
      "/campus",
    );
    await expect(nav.getByRole("link", { name: "Kegiatan" })).toHaveAttribute(
      "href",
      "/activities",
    );
  });
});

test.describe("Kegiatan follows the portal", () => {
  test.describe.configure({ mode: "serial" });

  const STAMP = Date.now().toString(36);
  const NAME = `Kaligrafi ${STAMP}`;
  let admin: AuthSession;
  let id = "";

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini membuat ekstrakurikuler",
    );
    const found = DEMO_ACCOUNTS.find(
      (a) => a.email === "smpit.admin@cipansor.or.id",
    )!;
    admin = await apiLogin({ email: found.email, password: found.password });
  });

  test.afterAll(async () => {
    if (id) {
      await apiRequest(admin, "DELETE", `/extracurricular/${id}`).catch(
        () => undefined,
      );
    }
  });

  test("a unit admin adds one with its translations; it appears, and leaves when made inactive", async ({
    page,
    context,
  }) => {
    const years = await apiRequest<{
      data: { id: string; isActive: boolean }[];
    }>(admin, "GET", "/academic-years?limit=50");
    const created = await apiRequest<{ data: { id: string } }>(
      admin,
      "POST",
      "/extracurricular",
      {
        unitId: admin.user.unitId as string,
        academicYearId: years.data.find((y) => y.isActive)!.id,
        name: NAME,
        nameEn: `Calligraphy ${STAMP}`,
        nameAr: `الخط العربي ${STAMP}`,
        category: "ARTS",
      },
    );
    id = created.data.id;

    await setLocale(context, "en");
    await page.goto("/activities");
    const list = page.getByTestId("public-extracurriculars");
    const card = list
      .getByRole("listitem")
      .filter({ has: page.getByText(`Calligraphy ${STAMP}`) });
    await expect(card).toBeVisible();
    await expect(card.getByRole("listitem")).toHaveText(["SMP IT"]);
    await expect(
      list.getByRole("heading", { name: "Arts & culture" }),
    ).toBeVisible();

    await apiRequest(admin, "PUT", `/extracurricular/${id}`, {
      status: "INACTIVE",
    });
    await page.reload();
    await expect(page.getByTestId("public-extracurriculars")).toBeVisible();
    await expect(page.getByText(`Calligraphy ${STAMP}`)).toHaveCount(0);
  });

  test("the public list carries names, category and units — nothing else", async ({
    request,
  }) => {
    const res = await request.get(
      `${process.env.API_URL || "http://localhost:3001/api"}/extracurricular/public`,
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown>[] };
    expect(body.data.length).toBeGreaterThan(0);
    for (const row of body.data) {
      expect(Object.keys(row).sort()).toEqual([
        "category",
        "name",
        "nameAr",
        "nameEn",
        "unitTypes",
      ]);
    }
  });
});
