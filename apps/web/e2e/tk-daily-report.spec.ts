import { test, expect, type Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { waitForToast, waitForLoadingComplete } from "./helpers/page-helpers";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

/**
 * Laporan harian TK, one day of it end to end:
 *
 * - the TK guru writes a child's day with a photo, from their own menu
 *   (Mutabaah Yaumiyah → Buat Laporan);
 * - the child's wali reads it, photo included, and acknowledges it;
 * - a wali of another child cannot open it;
 * - the unit's admin uses the TK / PAUD pages: the form with a captioned
 *   photo, the edit page, and the morning check-in for a class.
 *
 * Until 2026-09-26 none of it worked: every write was refused (a date where a
 * datetime was wanted, a unit and a year the user object did not carry), the
 * photos went to an endpoint that did not exist, "Buat Laporan" opened the
 * detail page with "new" for an id, and the wali's page looked for children on
 * the login object and found none. This test had skipped itself all along: it
 * found the class picker by a placeholder the Select wrapper hid.
 *
 * One report per child per day, so the tests run in order, and what the two
 * writing accounts made today is removed before and after.
 */

test.describe.configure({ mode: "serial" });

const account = (roleCode: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.roleCode === roleCode);
  if (!found) throw new Error(`No demo account for ${roleCode}`);
  return { email: found.email, password: found.password };
};

/** Today as the teacher's browser dates it (the config pins Asia/Jakarta). */
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// A 1×1 PNG: the upload checks the bytes against the declared type.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type Report = {
  id: string;
  createdBy?: { id: string };
  student?: { id: string; user?: { name: string } };
};

const stamp = Date.now().toString(36).toUpperCase();
const ACTIVITY = `Bermain balok bersama teman ${stamp}`;
const REPLY = `Terima kasih, Bu Guru ${stamp}`;
const CAPTION = `Menyusun menara ${stamp}`;

let guru: AuthSession;
let admin: AuthSession;
let wali: AuthSession;
let child: { id: string; name: string };
let guruReportId = "";
let adminReportId = "";

const todaysReports = async () =>
  (
    await apiRequest<{ data: Report[] }>(
      admin,
      "GET",
      `/daily-report?date=${today()}&limit=100`,
    )
  ).data;

/** Today's reports written by the two accounts this file writes with. */
const purge = async () => {
  const writers = new Set([guru.user.id, admin.user.id]);
  for (const report of await todaysReports()) {
    if (writers.has(report.createdBy?.id)) {
      await apiRequest(admin, "DELETE", `/daily-report/${report.id}`);
    }
  }
};

const created = (page: Page, path: RegExp) =>
  page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      path.test(new URL(res.url()).pathname),
  );

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini menulis laporan harian, jadi dilewati",
  );
  guru = await apiLogin(account("TKQ_GURU"));
  admin = await apiLogin(account("TKQ_ADMIN"));
  wali = await apiLogin(account("TKQ_ORANG_TUA"));
  const children = await apiRequest<{ data: { id: string; name: string }[] }>(
    wali,
    "GET",
    "/parent/children",
  );
  child = children.data[0];
  expect(child, "the TK demo wali has a child in the seed").toBeTruthy();
  await purge();
});

test.afterAll(async () => {
  if (admin) await purge().catch(() => undefined);
});

test.describe("guru menulis, wali membaca", () => {
  test("the TK guru writes the day with a photo (Mutabaah Yaumiyah → Buat Laporan)", async ({
    page,
  }) => {
    // A TK guru's menu has Mutabaah Yaumiyah; the TK / PAUD group is the
    // unit admin's.
    await injectSession(page, guru);
    await page.goto("/daily-report");
    await page.getByRole("link", { name: "Buat Laporan" }).first().click();
    await expect(page).toHaveURL(/\/daily-report\/new$/);
    await waitForLoadingComplete(page);

    const pick = async (placeholder: RegExp, option: RegExp) => {
      const trigger = page
        .locator('button[role="combobox"]')
        .filter({ hasText: placeholder });
      await expect(trigger).toBeEnabled();
      await trigger.click();
      await page.getByRole("option", { name: option }).first().click();
    };
    await pick(/pilih unit/i, /TK/);
    await pick(/pilih kelas/i, /.+/);
    await pick(/pilih siswa/i, new RegExp(child.name));

    await page
      .getByPlaceholder("Apa saja kegiatan siswa hari ini?")
      .fill(ACTIVITY);

    await page.getByRole("tab", { name: "Foto" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "kegiatan.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByRole("img", { name: "Photo" })).toBeVisible();

    const response = created(page, /\/daily-report$/);
    await page.getByRole("button", { name: /simpan laporan/i }).click();
    const res = await response;
    expect(res.status(), await res.text()).toBe(201);
    guruReportId = (await res.json()).data.id;

    await waitForToast(page, /berhasil dibuat/i);
    await expect(page).toHaveURL(/\/daily-report$/);

    // Dated today, arrival (the form's 07:00) in WIB, the photo the API stored.
    const report = await apiRequest<{
      data: {
        reportDate: string;
        arrivalTime: string;
        activitiesSummary: string;
        mealStatus: string | null;
        napDuration: number | null;
        photos: { photoUrl: string }[];
      };
    }>(guru, "GET", `/daily-report/${guruReportId}`);
    expect(report.data.reportDate.slice(0, 10)).toBe(today());
    expect(new Date(report.data.arrivalTime).getTime()).toBe(
      new Date(`${today()}T07:00:00+07:00`).getTime(),
    );
    expect(report.data.activitiesSummary).toBe(ACTIVITY);
    // The Makan tab was never opened: nothing is claimed about meals or nap.
    expect(report.data.mealStatus).toBeNull();
    expect(report.data.napDuration).toBeNull();
    expect(report.data.photos).toHaveLength(1);
    expect(report.data.photos[0].photoUrl).toMatch(/\/uploads\/[^/]+$/);
  });

  test("the child's wali reads it with the photo, and acknowledges it", async ({
    page,
  }) => {
    test.skip(!guruReportId, "the guru's report was not made");
    await injectSession(page, wali);
    await page.goto("/parent/daily-report");
    await waitForLoadingComplete(page);

    const card = page.getByTestId(`daily-report-${guruReportId}`);
    await expect(card.getByText(ACTIVITY)).toBeVisible({ timeout: 15000 });
    const photo = card.getByRole("img", { name: "Foto kegiatan" });
    await expect(photo).toBeVisible();
    // Stored uploads are served only with a credential, which an <img> cannot
    // send as a header: the page resolves the reference through `/upload/sas`
    // and puts the returned single-file token in the address. That token is
    // scoped to this path and this actor — deliberately NOT the wali's session
    // token, which must never travel in a URL. Resolution is async, so poll for
    // it rather than reading the attribute once. (Whether the tile paints here
    // depends on the stack: the API answers same-origin only, and this one runs
    // the web and the API on two ports.)
    await expect
      .poll(async () => (await photo.getAttribute("src")) ?? "", {
        timeout: 15_000,
      })
      .toContain("token=");
    const src = (await photo.getAttribute("src")) ?? "";
    const file = await fetch(src);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toMatch(/^image\/png/);

    await card
      .getByRole("button", { name: /konfirmasi & beri balasan/i })
      .click();
    await page.getByRole("dialog").getByRole("textbox").fill(REPLY);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /kirim konfirmasi/i })
      .click();
    await waitForToast(page, /berhasil dikonfirmasi/i);
    await expect(card.getByText("Sudah Dibaca")).toBeVisible();
    await expect(card.getByText(REPLY)).toBeVisible();
  });

  test("a wali of another child does not reach it (404)", async () => {
    test.skip(!guruReportId, "the guru's report was not made");
    const otherWali = await apiLogin(account("SDIT_ORANG_TUA"));
    await expect(
      apiRequest(otherWali, "GET", `/daily-report/${guruReportId}`),
    ).rejects.toThrow(/→ 404/);
    await expect(
      apiRequest(
        otherWali,
        "POST",
        `/daily-report/${guruReportId}/confirm`,
        {},
      ),
    ).rejects.toThrow(/→ 404/);
  });
});

test.describe("TK / PAUD → Laporan Harian (admin unit)", () => {
  test("the form names what is missing", async ({ page }) => {
    await injectSession(page, admin);
    await page.goto("/tk/daily-reports/new");
    await waitForLoadingComplete(page);

    await page.getByRole("button", { name: /simpan laporan/i }).click();

    await expect(page.getByText(/siswa wajib dipilih/i)).toBeVisible();
    await expect(page.getByText(/kelas wajib dipilih/i)).toBeVisible();
  });

  test("a report with a captioned photo, for another child", async ({
    page,
  }) => {
    await injectSession(page, admin);
    await page.goto("/tk/daily-reports/new");
    await waitForLoadingComplete(page);

    await page
      .locator('button[role="combobox"]')
      .filter({ hasText: /pilih kelas/i })
      .click();
    await page.getByRole("option").first().click();
    const studentSelect = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /pilih siswa/i });
    await expect(studentSelect).toBeEnabled();
    await studentSelect.click();
    await page
      .getByRole("option")
      .filter({ hasNotText: child.name })
      .first()
      .click();

    await page.locator('input[type="file"]').setInputFiles({
      name: "kegiatan.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByRole("img", { name: "Foto 1" })).toBeVisible();
    await page.getByPlaceholder("Keterangan foto...").fill(CAPTION);

    const response = created(page, /\/daily-report$/);
    await page.getByRole("button", { name: /simpan laporan/i }).click();
    const res = await response;
    expect(res.status(), await res.text()).toBe(201);
    adminReportId = (await res.json()).data.id;
    await waitForToast(page, /berhasil/i);
    await expect(page).toHaveURL(/\/tk\/daily-reports$/);

    const report = await apiRequest<{
      data: { photos: { caption: string }[] };
    }>(admin, "GET", `/daily-report/${adminReportId}`);
    expect(report.data.photos.map((photo) => photo.caption)).toEqual([CAPTION]);
  });

  test("the edit page keeps what it changes", async ({ page }) => {
    test.skip(!adminReportId, "the admin's report was not made");
    await injectSession(page, admin);
    await page.goto(`/tk/daily-reports/${adminReportId}/edit`);
    await waitForLoadingComplete(page);

    const summary = page.getByLabel("Ringkasan Kegiatan Hari Ini");
    await expect(summary).toBeEditable();
    await summary.fill(`Diubah ${stamp}`);
    await page.getByLabel("Pesan untuk Orang Tua").fill(`Pesan ${stamp}`);
    await page.getByRole("button", { name: /simpan perubahan/i }).click();
    await waitForToast(page, /berhasil diperbarui/i);

    const report = await apiRequest<{
      data: { activitiesSummary: string; teacherNotes: string };
    }>(admin, "GET", `/daily-report/${adminReportId}`);
    expect(report.data.activitiesSummary).toBe(`Diubah ${stamp}`);
    expect(report.data.teacherNotes).toBe(`Pesan ${stamp}`);
  });

  test("the morning check-in makes the rest of the class's day", async ({
    page,
  }) => {
    await injectSession(page, admin);
    await page.goto("/tk/daily-reports/check-in");
    await waitForLoadingComplete(page);

    await page
      .locator('button[role="combobox"]')
      .filter({ hasText: /pilih kelas/i })
      .click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /muat daftar siswa/i }).click();

    const response = created(page, /\/daily-report\/bulk$/);
    await page.getByRole("button", { name: /^check-in \d+ siswa$/i }).click();
    const res = await response;
    expect(res.status(), await res.text()).toBe(201);
    const result = (await res.json()).data as {
      created: number;
      failed: number;
    };
    // The two children written above keep their reports; the others get one.
    expect(result.failed).toBeGreaterThanOrEqual(2);
    await waitForToast(
      page,
      new RegExp(`${result.created} laporan harian dibuat`),
    );

    const checkedIn = (await todaysReports()).filter(
      (report) =>
        report.id !== guruReportId &&
        report.id !== adminReportId &&
        report.createdBy?.id === admin.user.id,
    );
    expect(checkedIn).toHaveLength(result.created);
    for (const { id } of checkedIn) {
      const report = await apiRequest<{ data: { arrivalTime: string } }>(
        admin,
        "GET",
        `/daily-report/${id}`,
      );
      // The page's default, 07:30, in WIB.
      expect(new Date(report.data.arrivalTime).getTime()).toBe(
        new Date(`${today()}T07:30:00+07:00`).getTime(),
      );
    }
  });
});
