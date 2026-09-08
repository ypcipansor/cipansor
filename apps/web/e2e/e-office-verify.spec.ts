import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

test.describe("E-Office & Public Letter Verification E2E", () => {
  test("Public Letter Verification page loads and displays PDF upload form", async ({ page }) => {
    await page.goto("/public/verify-letter");

    await expect(page.locator("h1")).toContainText("Verifikasi Tanda Tangan Elektronik");
    await expect(page.locator("input[type='file']")).toBeVisible();
    await expect(page.getByRole("button", { name: /verifikasi dokumen/i })).toBeVisible();

    // Verify button is disabled when no PDF file is selected
    await expect(page.getByRole("button", { name: /verifikasi dokumen/i })).toBeDisabled();
  });

  test("E-Office main page renders and displays stats for authenticated users", async ({ page }) => {
    await loginAs(page, "superAdmin");

    // Navigate to e-office page
    await page.goto("/e-office");

    // Expect E-Office header
    await expect(page.locator("h1")).toContainText("E-Office");
    await expect(page.getByRole("button", { name: /buat surat baru/i })).toBeVisible();
  });

  test("Integration test against real backend /api/esign/verify-pdf endpoint", async ({ page }) => {
    await page.goto("/public/verify-letter");

    const buffer = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    await page.setInputFiles("input[type='file']", {
      name: "sample-document.pdf",
      mimeType: "application/pdf",
      buffer,
    });

    // Tidak ada langkah captcha di sini lagi. Tantangan aritmetika sudah
    // diganti Cloudflare Turnstile, dan Turnstile MATI di lingkungan e2e —
    // NEXT_PUBLIC_TURNSTILE_SITE_KEY kosong, jadi widget-nya tidak dirender
    // dan peladen (TURNSTILE_SECRET_KEY kosong) tidak menuntut token.

    await page.getByRole("button", { name: /verifikasi dokumen/i }).click();

    // With real backend, uploading random PDF buffer should return DOKUMEN TIDAK VALID or result
    await expect(page.locator("text=/DOKUMEN TIDAK VALID|DOKUMEN SAH & TERVERIFIKASI/")).toBeVisible();
  });

  test("Valid public PDF verification displays success status and TTE signer details", async ({ page }) => {
    await page.route("**/api/esign/verify-pdf", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            isValid: true,
            isRevoked: false,
            signer: { name: "Dr. H. Ahmad", nip: "19800101", position: "Kepala Sekolah" },
            letter: {
              letterNumber: "001/SK/Y-CPS/VIII/2026",
              subject: "Pengumuman Resmi",
              date: "2026-08-01",
              status: "SIGNED",
              unitName: "SMA Al-Qur'an",
            },
            signedAt: "2026-08-01T16:40:31Z",
            digest: "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
          },
        }),
      });
    });

    await page.goto("/public/verify-letter");

    const buffer = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    await page.setInputFiles("input[type='file']", {
      name: "surat-resmi.pdf",
      mimeType: "application/pdf",
      buffer,
    });

    // Tidak ada langkah captcha di sini lagi. Tantangan aritmetika sudah
    // diganti Cloudflare Turnstile, dan Turnstile MATI di lingkungan e2e —
    // NEXT_PUBLIC_TURNSTILE_SITE_KEY kosong, jadi widget-nya tidak dirender
    // dan peladen (TURNSTILE_SECRET_KEY kosong) tidak menuntut token.

    await page.getByRole("button", { name: /verifikasi dokumen/i }).click();

    await expect(page.getByText(/DOKUMEN SAH & TERVERIFIKASI/i)).toBeVisible();
    await expect(page.getByText("Dr. H. Ahmad")).toBeVisible();
    await expect(page.getByText("001/SK/Y-CPS/VIII/2026")).toBeVisible();
    /**
     * 16:40:31Z is 23:40:31 in WIB (UTC+7), and that conversion is what this
     * line is for.
     *
     * The separator is not. `id-ID` renders time parts with dots — "23.40.31",
     * which is how Indonesian writes a clock time — so an assertion pinned to
     * colons failed against a page that was formatting correctly. Kept loose on
     * the separator, exact on every digit: a page that forgot the timezone
     * would print 16.40.31 and still fail here.
     */
    await expect(page.getByText(/23[.:]40[.:]31 WIB/i)).toBeVisible();
  });

  test("Revoked PDF verification displays revoked notice", async ({ page }) => {
    await page.route("**/api/esign/verify-pdf", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            isValid: false,
            isRevoked: true,
            revokedAt: "2026-08-02T10:00:00Z",
            revokedReason: "Dibatalkan oleh pimpinan",
            signer: { name: "H. Ustadz Abdullah", nip: "19750202", position: "Sekretaris" },
            letter: {
              letterNumber: "002/SK/Y-CPS/VIII/2026",
              subject: "SK Pengangkatan",
              date: "2026-08-01",
              status: "REVOKED",
              unitName: "Yayasan Pesantren Cipansor",
            },
            signedAt: "2026-08-01T12:00:00Z",
          },
        }),
      });
    });

    await page.goto("/public/verify-letter");

    const buffer = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    await page.setInputFiles("input[type='file']", {
      name: "surat-revoked.pdf",
      mimeType: "application/pdf",
      buffer,
    });

    // Tidak ada langkah captcha di sini lagi. Tantangan aritmetika sudah
    // diganti Cloudflare Turnstile, dan Turnstile MATI di lingkungan e2e —
    // NEXT_PUBLIC_TURNSTILE_SITE_KEY kosong, jadi widget-nya tidak dirender
    // dan peladen (TURNSTILE_SECRET_KEY kosong) tidak menuntut token.

    await page.getByRole("button", { name: /verifikasi dokumen/i }).click();

    await expect(page.getByText(/NASKAH TELAH DICABUT/i)).toBeVisible();
    await expect(page.getByText(/Keterangan Pencabutan/i)).toBeVisible();
  });

  test("Invalid PDF displays invalid document error", async ({ page }) => {
    await page.route("**/api/esign/verify-pdf", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            isValid: false,
            isRevoked: false,
            reason: "Dokumen PDF ini tidak terdaftar dalam sistem resmi Yayasan Pesantren Cipansor.",
          },
        }),
      });
    });

    await page.goto("/public/verify-letter");

    const buffer = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    await page.setInputFiles("input[type='file']", {
      name: "surat-invalid.pdf",
      mimeType: "application/pdf",
      buffer,
    });

    // Tidak ada langkah captcha di sini lagi. Tantangan aritmetika sudah
    // diganti Cloudflare Turnstile, dan Turnstile MATI di lingkungan e2e —
    // NEXT_PUBLIC_TURNSTILE_SITE_KEY kosong, jadi widget-nya tidak dirender
    // dan peladen (TURNSTILE_SECRET_KEY kosong) tidak menuntut token.

    await page.getByRole("button", { name: /verifikasi dokumen/i }).click();

    await expect(page.getByText(/DOKUMEN TIDAK VALID/i)).toBeVisible();
    await expect(page.getByText(/tidak terdaftar dalam sistem resmi/i)).toBeVisible();
  });

  test("Authenticated user can navigate to Create Letter and search participants in real flow", async ({ page }) => {
    await loginAs(page, "superAdmin");

    await page.goto("/e-office/create");
    await expect(page.locator("h1")).toContainText("Buat Surat Baru");

    await expect(page.getByLabel(/Perihal/i)).toBeVisible();
    await page.getByLabel(/Perihal/i).fill("Undangan Rapat Evaluasi E2E");

    const searchInput = page.getByPlaceholder(/Cari pejabat\/staf/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Ahmad");
  });
});
