import { test, expect } from '@playwright/test';

test.describe('Public Card Verification, Raport Merdeka & E-Office Edit Letter Flow', () => {
  test('public verify card page loads and verifies QR code inputs', async ({ page }) => {
    await page.goto('/public/verify-card');
    await expect(page.locator('h1')).toContainText('Verifikasi Kartu Santri / Pelajar');

    const input = page.locator('input[placeholder*="cipansor://"]');
    await expect(input).toBeVisible();

    // Fill invalid QR data
    await input.fill('cipansor://invaliddata#1234567890123456');
    await page.click('button:has-text("Verifikasi")');

    await expect(page.locator('text=Verifikasi Gagal / Tidak Valid')).toBeVisible();
  });

  test('raport merdeka page loads and supports student search', async ({ page }) => {
    await page.goto('/assessment/raport-merdeka');
    await expect(page.locator('h1')).toContainText('Raport Kurikulum Merdeka');

    // Switch to Generate Raport tab
    await page.click('button:has-text("Generate Raport")');

    const studentSearchInput = page.locator('input[placeholder="Cari siswa..."]');
    await expect(studentSearchInput).toBeVisible();
    await studentSearchInput.fill('Ahmad');
  });
});
