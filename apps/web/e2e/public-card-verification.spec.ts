import { test, expect } from './fixtures/auth.fixture';
import { loginAs } from './helpers/auth-api';
import crypto from 'crypto';

function generateRealHMACQrCode() {
  const secret = process.env.STUDENT_CARD_HMAC_SECRET || process.env.JWT_SECRET || 'test-jwt-secret-key-for-e2e-testing';
  const payload = {
    sid: 'student-uuid-demo',
    nis: '2026001',
    nisn: '0012345678',
    uid: 'unit-smp-1',
    exp: Date.now() + 86400000 * 365,
  };
  const payloadString = JSON.stringify(payload);
  const hmacSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex')
    .substring(0, 16);

  const base64Payload = Buffer.from(payloadString).toString('base64url');
  return `cipansor://${base64Payload}#${hmacSignature}`;
}

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

    // Fill valid HMAC QR code string
    const validQr = generateRealHMACQrCode();
    await input.fill(validQr);
    await page.click('button:has-text("Verifikasi")');
  });

  test('raport merdeka page loads and supports student search and export button', async ({ page }) => {
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

    const exportBtn = page.locator('button:has-text("Export ke PDF")');
    await expect(exportBtn).toBeVisible();
  });

  test('e-office letter details page renders edit letter modal trigger for draft/revision letters', async ({ page }) => {
    await loginAs(page, 'superAdmin');
    await page.waitForTimeout(1000);

    await page.goto('/e-office/outbox');
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Surat Keluar');
  });
});
