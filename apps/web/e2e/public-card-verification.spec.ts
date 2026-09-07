import { test, expect } from '@playwright/test';

test.describe('Public Card Verification & E-Office Verification', () => {
  test('public verify card page loads and checks status', async ({ page }) => {
    await page.goto('/public/verify-card');
    await expect(page.locator('h1')).toContainText('Verifikasi Kartu Santri / Pelajar');

    const input = page.locator('input[placeholder*="cipansor://"]');
    await expect(input).toBeVisible();

    // Fill invalid QR data
    await input.fill('cipansor://invaliddata#1234567890123456');
    await page.click('button:has-text("Verifikasi")');

    await expect(page.locator('text=Verifikasi Gagal / Tidak Valid')).toBeVisible();
  });
});
