import { test, expect } from "./fixtures/auth.fixture";
import { apiRequest, loginAs } from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { waitForToast } from "./helpers/page-helpers";

/**
 * Akademik › Students › Student Compliance › (ikon pensil) — simpan formulir.
 *
 * Sampai 2026-09-14 halaman ini tidak pernah bisa menyimpan: formulirnya
 * mengirim nama isian yang bukan kolom (`fatherNIK`, `isKIP`, `distance`) dan
 * nilai pilihan di luar enum ("MOTOR"), jadi setiap klik Simpan dijawab 500.
 * Tidak ada uji e2e untuk rute ini (COVERAGE.md: ❌), dan uji unit tidak bisa
 * melihatnya karena yang rusak adalah KESEPAKATAN antara formulir dan API.
 * Uji ini menjalankan rantai itu dari klik sampai baris tersimpan.
 */
test.describe("Kelengkapan Data Santri — simpan", () => {
  test("NISN salah bentuk ditandai, NISN kembar ditolak 409, data sah tersimpan", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini menulis data santri, jadi dilewati",
    );

    const session = await loginAs(page, "superAdmin");
    const daftar = await apiRequest<{
      data: { id: string; nisn: string | null }[];
    }>(session, "GET", "/students?limit=100");
    const berNisn = daftar.data.filter(
      (s) => s.nisn && /^\d{10}$/.test(s.nisn),
    );
    expect(
      berNisn.length,
      "seed harus punya ≥2 santri ber-NISN sah",
    ).toBeGreaterThanOrEqual(2);
    const [target, lain] = berNisn as { id: string; nisn: string }[];

    const putKe = (r: { url(): string; request(): { method(): string } }) =>
      r.request().method() === "PUT" &&
      r.url().includes(`/student-compliance/${target.id}`);
    let jumlahPut = 0;
    page.on("request", (r) => {
      if (r.method() === "PUT" && r.url().includes("/student-compliance/"))
        jumlahPut++;
    });

    await page.goto(`/students/compliance/${target.id}`);
    const nisn = page.locator("#nisn");
    await expect(nisn).toHaveValue(target.nisn, { timeout: 60_000 });
    const simpan = page.getByRole("button", { name: "Simpan" });

    // 1) Bentuk salah: ditolak di peramban dengan aturan yang sama dengan API,
    //    ditunjukkan di isiannya, dan tidak ada permintaan yang dikirim.
    await nisn.fill("12345678");
    await simpan.click();
    await expect(page.getByText("NISN harus 10 digit angka")).toBeVisible();
    expect(jumlahPut).toBe(0);

    // 2) NISN milik santri lain: API menolak 409 dengan pesan yang terbaca.
    await nisn.fill(lain.nisn);
    const kembar = page.waitForResponse(putKe);
    await simpan.click();
    expect((await kembar).status()).toBe(409);
    await waitForToast(
      page,
      "NISN ini sudah tercatat pada santri lain",
      "error",
    );

    // 3) NISN asli + moda transportasi dari daftar enum → 200, tersimpan, dan
    //    halaman daftar yang dituju sesudahnya memuat laporannya tanpa 500.
    await nisn.fill(target.nisn);
    await page.locator("#transportMode").click();
    await page.getByRole("option", { name: "Sepeda motor" }).click();
    const sah = page.waitForResponse(putKe);
    const laporanDapodik = page.waitForResponse((r) =>
      r.url().includes("/student-compliance/report/dapodik-ready"),
    );
    await simpan.click();
    expect((await sah).status()).toBe(200);
    await expect(page).toHaveURL(/\/students\/compliance$/);
    expect((await laporanDapodik).status()).toBe(200);

    const tersimpan = await apiRequest<{
      data: { nisn: string; transportMode: string };
    }>(session, "GET", `/student-compliance/${target.id}`);
    expect(tersimpan.data.nisn).toBe(target.nisn);
    expect(tersimpan.data.transportMode).toBe("SEPEDA_MOTOR");
  });
});
