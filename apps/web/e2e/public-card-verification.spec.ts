import { test, expect } from './fixtures/auth.fixture';
import { loginAs } from './helpers/auth-api';

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
    await loginAs(page, 'superAdmin');
    await page.waitForTimeout(1000);

    await page.goto('/assessment/raport-merdeka');
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Raport Kurikulum Merdeka');

    // Switch to Generate Raport tab using exact tab trigger selector
    await page.click('[role="tab"]:has-text("Generate Raport")');

    const studentSearchInput = page.locator('input[placeholder="Cari siswa..."]');
    await expect(studentSearchInput).toBeVisible({ timeout: 10000 });
    await studentSearchInput.fill('Ahmad');
  });
});
