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
 * Laporan harian TK, one day of it end to end, on the one daily-report page
 * (decided 2026-09-27; the TK tree and /homeroom/daily-report redirect here):
 *
 * - the TK guru writes a child's day with a photo, from their own menu
 *   (Mengajar → Laporan Harian → Buat Laporan);
 * - the child's wali reads it, photo included, and acknowledges it;
 * - a wali of another child cannot open it;
 * - the unit's admin (TK / PAUD → Laporan Harian): the form with a captioned
 *   photo, the edit page from the list's Ubah, the morning check-in for a
 *   class, and Hapus;
 * - the TK kepala sekolah reaches it from their menu, SD keeps its Mutabaah
 *   Yaumiyah, and the old addresses answer with a permanent redirect.
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
  test("the TK guru writes the day with a photo (Laporan Harian → Buat Laporan)", async ({
    page,
  }) => {
    // A TK guru's own menu has Laporan Harian (SD's teachers call the same
    // page Mutabaah Yaumiyah).
    await injectSession(page, guru);
    await page.goto("/teacher");
    await page
      .getByRole("complementary", { name: "Menu utama" })
      .getByRole("link", { name: "Laporan Harian" })
      .click();
    await expect(page).toHaveURL(/\/daily-report$/);
    await expect(
      page.getByRole("heading", { name: "Laporan Harian", exact: true }),
    ).toBeVisible();
    // Their unit is theirs: there is no unit to pick.
    await expect(page.getByRole("combobox", { name: "Unit" })).toHaveCount(0);
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
    await pick(/pilih kelas/i, /.+/);
    await pick(/pilih santri/i, new RegExp(child.name));

    await page
      .getByPlaceholder("Apa saja kegiatan santri hari ini?")
      .fill(ACTIVITY);

    await page.locator('input[type="file"]').setInputFiles({
      name: "kegiatan.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByRole("img", { name: "Foto 1" })).toBeVisible();

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
    // Stored uploads are served only with an access token, which an <img>
    // cannot send as a header: the page puts the wali's own in the address,
    // and the file comes back for it. (Whether it paints here depends on the
    // stack: the API answers same-origin only, and this one runs the web and
    // the API on two ports.)
    const src = (await photo.getAttribute("src")) ?? "";
    expect(src).toContain(`token=${encodeURIComponent(wali.accessToken)}`);
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
    await page.goto("/daily-report/new");
    await waitForLoadingComplete(page);

    await page.getByRole("button", { name: /simpan laporan/i }).click();

    await expect(page.getByText(/santri wajib dipilih/i)).toBeVisible();
    await expect(page.getByText(/kelas wajib dipilih/i)).toBeVisible();
  });

  test("a report with a captioned photo, for another child", async ({
    page,
  }) => {
    await injectSession(page, admin);
    await page.goto("/daily-report/new");
    await waitForLoadingComplete(page);

    await page
      .locator('button[role="combobox"]')
      .filter({ hasText: /pilih kelas/i })
      .click();
    await page.getByRole("option").first().click();
    const studentSelect = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /pilih santri/i });
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
    await expect(page).toHaveURL(/\/daily-report$/);

    const report = await apiRequest<{
      data: { photos: { caption: string }[] };
    }>(admin, "GET", `/daily-report/${adminReportId}`);
    expect(report.data.photos.map((photo) => photo.caption)).toEqual([CAPTION]);
  });

  test("the edit page keeps what it changes (Laporan Harian → ⋯ → Ubah)", async ({
    page,
  }) => {
    test.skip(!adminReportId, "the admin's report was not made");
    await injectSession(page, admin);
    await page.goto("/daily-report");
    await waitForLoadingComplete(page);
    // The list's Ubah went to a page that did not exist until the TK edit
    // page moved here.
    await page
      .getByRole("button", { name: /^Aksi laporan / })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Ubah" }).click();
    await expect(page).toHaveURL(/\/daily-report\/[0-9a-f-]{36}\/edit$/);
    await expect(
      page.getByRole("heading", { name: "Ubah Laporan Harian" }),
    ).toBeVisible();
    await page.goto(`/daily-report/${adminReportId}/edit`);
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
    await page.goto("/daily-report/check-in");
    await waitForLoadingComplete(page);

    await page
      .locator('button[role="combobox"]')
      .filter({ hasText: /pilih kelas/i })
      .click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /muat daftar santri/i }).click();

    const response = created(page, /\/daily-report\/bulk$/);
    await page.getByRole("button", { name: /^check-in \d+ santri$/i }).click();
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

test.describe("one page for a child's day", () => {
  test("Hapus removes a report, after asking", async ({ page }) => {
    test.skip(!adminReportId, "the admin's report was not made");
    await injectSession(page, admin);
    await page.goto("/daily-report");
    await waitForLoadingComplete(page);
    const name = (
      await apiRequest<{ data: { student: { user: { name: string } } } }>(
        admin,
        "GET",
        `/daily-report/${adminReportId}`,
      )
    ).data.student.user.name;
    await page.getByRole("button", { name: `Aksi laporan ${name}` }).click();
    await page.getByRole("menuitem", { name: "Hapus" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Hapus laporan harian?");
    await dialog.getByRole("button", { name: "Hapus" }).click();
    await waitForToast(page, /laporan harian dihapus/i);
    const gone = await apiRequest(
      admin,
      "GET",
      `/daily-report/${adminReportId}`,
    ).then(
      () => 200,
      (error: Error) => Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
    );
    expect(gone).toBe(404);
    adminReportId = "";
  });

  test("a mood no one recorded is not shown as one", async ({ page }) => {
    // Both forms start at Senang, in plain sight; a report written without a
    // mood (the API allows it) used to be listed as "Biasa" all the same.
    const checkedIn = (await todaysReports()).find(
      (report) =>
        report.id !== guruReportId && report.createdBy?.id === admin.user.id,
    );
    test.skip(!checkedIn?.student, "the check-in made no report to reuse");
    const student = checkedIn!.student!;
    await apiRequest(admin, "DELETE", `/daily-report/${checkedIn!.id}`);
    await apiRequest(admin, "POST", "/daily-report", {
      studentId: student.id,
      reportDate: today(),
      activitiesSummary: `Tanpa suasana hati ${stamp}`,
    });

    await injectSession(page, admin);
    await page.goto("/daily-report");
    await waitForLoadingComplete(page);
    const card = page.getByRole("article", {
      name: `Laporan ${student.user?.name}`,
    });
    await expect(card).toContainText(`Tanpa suasana hati ${stamp}`);
    await expect(card).toContainText("Belum diisi");
    await expect(card).not.toContainText("Biasa");
  });

  test("the TK kepala sekolah reaches it from their menu", async ({ page }) => {
    await injectSession(page, await apiLogin(account("TKQ_KEPALA_SEKOLAH")));
    await page.goto("/dashboard");
    await page
      .getByRole("complementary", { name: "Menu utama" })
      .getByRole("link", { name: "Laporan Harian" })
      .click();
    await expect(page).toHaveURL(/\/daily-report$/);
    await expect(
      page.getByRole("heading", { name: "Laporan Harian", exact: true }),
    ).toBeVisible();
  });

  test("the TK admin has one Laporan Harian item, and SD keeps Mutabaah Yaumiyah", async ({
    page,
  }) => {
    await injectSession(page, admin);
    await page.goto("/dashboard");
    const menu = page.getByRole("complementary", { name: "Menu utama" });
    await menu.getByRole("button", { name: "Buka submenu TK / PAUD" }).click();
    await expect(
      menu.getByRole("link", { name: /^Laporan Harian/ }),
    ).toHaveCount(1);
    await expect(
      menu.getByRole("link", { name: "Mutabaah Yaumiyah" }),
    ).toHaveCount(0);
    await menu.getByRole("link", { name: "Laporan Harian" }).click();
    await expect(page).toHaveURL(/\/daily-report$/);

    await injectSession(page, await apiLogin(account("SDIT_GURU")));
    await page.goto("/teacher");
    const sdMenu = page.getByRole("complementary", { name: "Menu utama" });
    await expect(
      sdMenu.getByRole("link", { name: "Mutabaah Yaumiyah" }),
    ).toHaveAttribute("href", "/daily-report");
    await expect(
      sdMenu.getByRole("link", { name: "Laporan Harian" }),
    ).toHaveCount(0);
  });

  test("the old addresses answer with a permanent redirect", async ({
    page,
  }) => {
    await injectSession(page, admin);
    const id = "00000000-0000-4000-8000-000000000000";
    for (const [from, to] of [
      ["/tk/daily-reports", "/daily-report"],
      ["/tk/daily-reports/new", "/daily-report/new"],
      ["/tk/daily-reports/create", "/daily-report/bulk"],
      ["/tk/daily-reports/class", "/daily-report"],
      ["/tk/daily-reports/check-in", "/daily-report/check-in"],
      ["/tk/daily-reports/parent", "/parent/daily-report"],
      [`/tk/daily-reports/${id}/edit`, `/daily-report/${id}/edit`],
      [`/tk/daily-reports/${id}`, `/daily-report/${id}`],
      ["/homeroom/daily-report", "/daily-report/bulk"],
    ]) {
      const res = await page.request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(
        new URL(res.headers()["location"], "http://x").pathname,
        from,
      ).toBe(to);
    }
  });
});
