import { test, expect } from "@playwright/test";
import {
  SEED_USERS,
  apiLogin,
  apiRequest,
  loginAs,
  type AuthSession,
} from "./helpers/auth-api";
import { waitForToast } from "./helpers/page-helpers";

/**
 * Absensi pegawai — the pages the selfie/geotag work added, driven the way a
 * person drives them (golden rule #7).
 *
 * Before this suite the pages had no e2e, which is exactly how the bulk
 * register shipped broken: the page posts a date picker's `yyyy-MM-dd`, but the
 * schema demanded a datetime, so every save was a 400 and nobody noticed. The
 * bulk test below sends the page's real payload and reads the row back.
 *
 * The pages are:
 *   - Kepegawaian → Absensi Pegawai    (/hr/attendance)
 *   - Kepegawaian → Absensi Massal     (/hr/attendance/bulk)
 *   - Kepegawaian → Absen Mandiri      (/hr/attendance/me)
 *   - Kepegawaian → Pengaturan Absensi (/hr/attendance/settings)
 *
 * Writes go to a fixed past day so they cannot disturb today's register, which
 * the self-service test reads.
 */

/** Fixed, long-past WIB calendar days — safe to write. */
const PAST_DAY = "2025-01-02";
const PAST_DAY_2 = "2025-01-03";

/**
 * Unique names per run, so a re-run against the same database does not collide
 * with rows the previous run left behind (the settings writes are real).
 */
const RUN = Date.now().toString(36);
const SITE_NAME = `Gerbang E2E ${RUN}`;
const SHIFT_NAME = `Shift E2E ${RUN}`;
const RULE_CODE = `E2E_TELAT_${RUN}`;

/** The staff of the unit a unit admin is pinned to. */
async function firstStaff(session: AuthSession) {
  const list = await apiRequest<{ data: { id: string; unitId: string }[] }>(
    session,
    "GET",
    "/hr/staff?limit=1",
  );
  const staff = list.data[0];
  if (!staff) throw new Error("No seeded staff — seed the API first");
  return staff;
}

test.describe("Absensi Pegawai — pages render and navigate", () => {
  test("the admin attendance hub renders with its day picker", async ({
    page,
  }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance");

    await expect(
      page.getByRole("heading", { name: "Absensi Karyawan", level: 1 }),
    ).toBeVisible();

    // The day picker (an Indonesian date) and the link to the bulk register.
    await expect(
      page
        .getByRole("button", {
          name: /Pilih Tanggal|Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember/i,
        })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Absensi Massal" }),
    ).toBeVisible();
  });

  test("the bulk register renders a row per employee", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance/bulk");

    await expect(
      page.getByRole("heading", { name: "Absensi Massal", level: 1 }),
    ).toBeVisible();
    await expect(page.locator("#bulk-date")).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("self-service clock-in page is reachable for a teacher", async ({
    page,
  }) => {
    // Every employee clocks in for themselves; a teacher is not an admin and
    // still reaches Absen Mandiri (the API authorizes TEACHER there).
    await loginAs(page, "teacher");
    await page.goto("/hr/attendance/me");

    await expect(
      page.getByRole("heading", { name: "Absen Mandiri", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Status Hari Ini")).toBeVisible();
    await expect(page.getByText("Ambil Bukti Kehadiran")).toBeVisible();

    // Both punches and the evidence controls are on the page.
    await expect(
      page.getByRole("button", { name: "Absen Masuk" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Absen Pulang" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Nyalakan Kamera" }),
    ).toBeVisible();
    // "Unggah Foto" is a file-input label inside a Button (asChild), so it is
    // exposed as text, not as a button role.
    await expect(page.getByText("Unggah Foto")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Baca Lokasi Saya" }),
    ).toBeVisible();
  });
});

test.describe("Absensi Massal — the save the register depends on", () => {
  test("the page's own payload saves a calendar day", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance/bulk");

    await expect(page.locator("table tbody tr").first()).toBeVisible();

    // Pick a past day and mark everyone present — the exact button a person
    // presses, and the exact `yyyy-MM-dd` the date input yields.
    await page.locator("#bulk-date").fill(PAST_DAY_2);
    await page.getByRole("button", { name: "Tandai Semua Hadir" }).click();
    await expect(page.getByText(/^\d+ dipilih$/)).toBeVisible();

    const saved = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        new URL(res.url()).pathname.endsWith("/hr/attendance/bulk"),
    );
    await page.getByRole("button", { name: "Simpan" }).click();
    const response = await saved;

    // A 400 here is the regression this suite exists for.
    expect(response.status()).toBe(200);
    await waitForToast(page, /absensi disimpan/i);
  });

  test("the API accepts a date picker's day and stores it on that WIB day", async ({
    page,
  }) => {
    const admin = await loginAs(page, "superAdmin");
    const staff = await firstStaff(admin);

    const result = await apiRequest<{
      success: boolean;
      data: { count: number };
    }>(admin, "POST", "/hr/attendance/bulk", {
      date: PAST_DAY,
      records: [{ staffId: staff.id, status: "ABSENT" }],
    });
    expect(result.success).toBe(true);
    expect(result.data.count).toBe(1);

    const list = await apiRequest<{ data: { status: string }[] }>(
      admin,
      "GET",
      `/hr/attendance?staffId=${staff.id}&startDate=${PAST_DAY}&endDate=${PAST_DAY}&limit=100`,
    );
    expect(list.data.some((row) => row.status === "ABSENT")).toBe(true);
  });
});

test.describe("Pengaturan Absensi — settings save with the form's real values", () => {
  test.describe.configure({ mode: "serial" });

  test("a site is added from the Lokasi tab", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance/settings");

    await expect(
      page.getByRole("heading", { name: "Pengaturan Absensi", level: 1 }),
    ).toBeVisible();

    await page.getByPlaceholder("Gerbang utama").fill(SITE_NAME);
    await page.getByPlaceholder("-6.123456").fill("-6.5");
    await page.getByPlaceholder("106.123456").fill("106.8");
    await page.getByRole("button", { name: "Tambah Lokasi" }).click();

    await waitForToast(page, /Lokasi absen ditambahkan/i);
    await expect(
      page.getByRole("cell", { name: SITE_NAME }).first(),
    ).toBeVisible();
  });

  test("a shift is added from the Shift tab", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance/settings");
    await page.getByRole("tab", { name: "Shift" }).click();

    await page.getByPlaceholder("Pagi").fill(SHIFT_NAME);
    await page.getByRole("button", { name: "Tambah Shift" }).click();

    await waitForToast(page, /Shift ditambahkan/i);
    await expect(
      page.getByRole("cell", { name: SHIFT_NAME }).first(),
    ).toBeVisible();
  });

  test("the work week saves the defaults the form shows", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance/settings");
    await page.getByRole("tab", { name: "Hari Kerja" }).click();

    // An empty Friday time must not turn into a null the schema rejects.
    await page.getByRole("button", { name: "Simpan", exact: true }).click();

    await waitForToast(page, /Hari kerja disimpan/i);
  });

  test("the attendance policy saves", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance/settings");
    await page.getByRole("tab", { name: "Kebijakan" }).click();

    await page.getByRole("button", { name: "Simpan", exact: true }).click();

    await waitForToast(page, /Kebijakan disimpan/i);
  });

  test("the deduction guard saves without a configured UMK", async ({
    page,
  }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance/settings");
    await page.getByRole("tab", { name: "Potongan Gaji" }).click();

    // The UMK is optional and its input is empty by default; an empty field
    // must not send a null the schema rejects.
    await page
      .getByRole("button", { name: "Simpan", exact: true })
      .first()
      .click();

    await waitForToast(page, /Batas potongan disimpan/i);
  });

  test("a deduction rule saves and re-saves unchanged", async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance/settings");
    await page.getByRole("tab", { name: "Potongan Gaji" }).click();

    await page.getByPlaceholder("POTONGAN_TELAT").fill(RULE_CODE);
    await page.getByRole("button", { name: "Simpan Aturan" }).click();
    await waitForToast(page, /Aturan disimpan/i);
    await expect(
      page.getByRole("cell", { name: RULE_CODE }).first(),
    ).toBeVisible();

    // "Ubah" copies the stored rule (with its null fields) into the draft; a
    // second save of an unchanged rule must still be accepted.
    await page.getByRole("button", { name: "Ubah" }).first().click();
    await page.getByRole("button", { name: "Simpan Aturan" }).click();
    await waitForToast(page, /Aturan disimpan/i);
  });

  test("the holiday import has a review queue", async ({ page }) => {
    // An imported holiday waits in a draft queue before it can change a work
    // day (decisions/absensi-pegawai.md), so the queue must be on the page.
    await loginAs(page, "superAdmin");
    await page.goto("/hr/attendance/settings");
    await page.getByRole("tab", { name: "Hari Libur" }).click();

    await expect(page.getByText("Draf Libur Menunggu Tinjauan")).toBeVisible();
  });
});

test("a unit admin cannot change the yayasan-wide holiday source", async () => {
  // The source is yayasan-wide and every unit's sync reads it, so PUT is
  // super-admin only (calendar.routes.ts). A unit admin is refused.
  const admin = await apiLogin(SEED_USERS.adminSdit);
  const status = await apiRequest(admin, "PUT", "/calendar/holidays/config", {
    sourceUrl: "https://example.test/holidays",
  }).then(
    () => 200,
    (error: Error) => Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
  );
  expect(status).toBe(403);
});
