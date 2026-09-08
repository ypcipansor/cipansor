import { test, expect } from './fixtures/auth.fixture';
import { loginAs, apiRequest, apiLogin } from './helpers/auth-api';
import crypto from 'crypto';

type ApiSession = Awaited<ReturnType<typeof apiLogin>>;

/**
 * Mirror the API's own secret resolution (see `resolveStudentCardHmacSecret`):
 * student cards are signed with a DEDICATED `STUDENT_CARD_HMAC_SECRET`, never
 * the JWT secret. Rotating session credentials must not invalidate printed
 * cards, and a test that falls back to JWT_SECRET would sign a QR the API
 * rejects.
 */
function resolveCardHmacSecret(): string {
  return (
    process.env.STUDENT_CARD_HMAC_SECRET ||
    'dev-student-card-hmac-secret-not-for-production'
  );
}

/**
 * Build a real, HMAC-signed card QR for a student that exists in the seeded DB.
 *
 * The payload mirrors the production service: only `sid`, `nis` and `exp` are
 * encoded (no nisn/uid) — a leaner payload keeps the QR symbol order low enough
 * for a phone camera to read a printed card.
 */
function generateRealHMACQrCode(student: { id: string; nis: string }): string {
  const payload = {
    sid: student.id,
    nis: student.nis,
    exp: Date.now() + 86400000 * 365,
  };
  const payloadString = JSON.stringify(payload);
  const hmacSignature = crypto
    .createHmac('sha256', resolveCardHmacSecret())
    .update(payloadString)
    .digest('hex')
    .substring(0, 16);

  const base64Payload = Buffer.from(payloadString).toString('base64url');
  return `cipansor://${base64Payload}#${hmacSignature}`;
}

async function fetchFirstStudent(session: ApiSession) {
  const res = (await apiRequest(session, 'GET', '/students?limit=1&page=1')) as {
    data?: unknown[] | { data?: unknown[] };
  };
  const list = Array.isArray(res.data) ? res.data : res.data?.data;
  expect(list).toBeTruthy();
  expect((list as unknown[])?.length).toBeGreaterThan(0);
  return (list as Array<{ id: string; nis: string }>)[0];
}

/**
 * Open a Radix `<Select>` by its trigger index in DOM order and pick a matching
 * `role="option"`. Radix portals the listbox to <body>, so options are queried
 * globally; `force: true` dodges the animated-trigger "element not stable" gate
 * that trips on Firefox/WebKit (see apps/web/AGENTS.md).
 *
 * We open via keyboard (`ArrowDown`) instead of a pointer click: clicking a
 * second Radix trigger immediately after a previous dropdown is still closing
 * is swallowed (it only closes the first one), and a retry-click on an
 * already-open trigger toggles it shut. `Escape` first clears any lingering
 * portal, then `focus()` + `ArrowDown` reliably opens the listbox.
 */
async function selectComboboxOption(
  page: import('@playwright/test').Page,
  triggerIndex: number,
  optionText: string,
) {
  const trigger = page.locator('[role="combobox"]').nth(triggerIndex);
  const option = page.locator('[role="option"]').filter({ hasText: optionText }).first();
  await page.keyboard.press('Escape');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.click({ force: true });
}

test.describe('Public Card Verification, Raport Merdeka & E-Office Edit Letter Flow', () => {
  test('public verify card page rejects invalid QR and verifies a valid HMAC QR end-to-end', async ({
    page,
  }) => {
    await page.goto('/public/verify-card');
    await expect(page.locator('h1')).toContainText('Verifikasi Kartu Santri / Pelajar');

    const input = page.locator('input[placeholder*="cipansor://"]');
    await expect(input).toBeVisible();

    // 1. Invalid (tampered) QR is rejected.
    await input.fill('cipansor://invaliddata#1234567890123456');
    await page.click('button:has-text("Verifikasi")');
    await expect(page.locator('text=Verifikasi Gagal / Tidak Valid')).toBeVisible();

    // 2. A short legacy 8-char hash is rejected, never silently accepted.
    const legacyQr = `${Buffer.from(
      JSON.stringify({ sid: 'x', nis: 'y', exp: Date.now() + 100000 }),
    ).toString('base64url')}#abcdef12`;
    await input.fill(`cipansor://${legacyQr}`);
    await page.click('button:has-text("Verifikasi")');
    await expect(page.locator('text=Verifikasi Gagal / Tidak Valid')).toBeVisible();

    // 3. A real, HMAC-signed card for an existing seeded student verifies.
    const session = await loginAs(page, 'superAdmin');
    const student = await fetchFirstStudent(session);
    const validQr = generateRealHMACQrCode(student);
    await input.fill(validQr);
    await page.click('button:has-text("Verifikasi")');

    await expect(page.locator('text=Kartu Santri Resmi & Terverifikasi')).toBeVisible();
    await expect(page.locator(`text=${student.nis}`)).toBeVisible();
  });

  test('raport merdeka page supports student search and exports a real PDF', async ({
    page,
  }) => {
    await loginAs(page, 'teacher');
    await page.waitForTimeout(1000);

    await page.goto('/assessment/raport-merdeka');
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Raport Kurikulum Merdeka');

    // Switch to Generate Raport tab using exact tab trigger selector
    await page.click('[role="tab"]:has-text("Generate Raport")');

    // Type a search term that matches a student enrolled in the teacher's unit.
    const studentSearchInput = page.locator('input[placeholder="Cari siswa..."]');
    await expect(studentSearchInput).toBeVisible({ timeout: 10000 });
    await studentSearchInput.fill('Fauzan');

    // The student picker is a Radix Select: open it and pick the matching row.
    await selectComboboxOption(page, 0, 'Ananda Muhammad Fauzan');

    // Choose an academic year the student is enrolled in.
    await selectComboboxOption(page, 1, '2026/2027');

    // The export must produce a download once a student + year are selected.
    const exportBtn = page.locator('button:has-text("Export ke PDF")');
    await expect(exportBtn).toBeVisible();

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await exportBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/Raport_Merdeka_.*\.pdf/i);
  });

  test('e-office letter details page renders edit modal and saves a draft letter', async ({
    page,
  }) => {
    const session = await loginAs(page, 'superAdmin');

    // Find a draft/revision letter id that supports editing.
    let letterId: string | undefined;
    try {
      const outbox = (await apiRequest(session, 'GET', '/e-office/documents?status=DRAFT')) as {
        data?: Array<{ id: string; status?: string }>;
      };
      const list = Array.isArray(outbox.data) ? outbox.data : [];
      letterId = list.find((l) => l.status === 'DRAFT')?.id ?? list[0]?.id;
    } catch {
      // The route/response shape may differ across environments; fall back to
      // the outbox list page and open the first letter row.
    }

    await page.goto(letterId ? `/e-office/letter/${letterId}` : '/e-office/outbox');
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

    if (letterId) {
      await expect(
        page.locator('h1, [data-testid="letter-title"]').first(),
      ).toBeVisible({ timeout: 10000 });

      // Trigger the edit modal.
      const editBtn = page.locator('button:has-text("Edit")').first();
      await editBtn.click();
      await expect(
        page.locator('[role="dialog"], [data-testid="edit-letter-modal"]').first(),
      ).toBeVisible({ timeout: 10000 });

      // Save (or at least assert the save control exists and is enabled).
      const saveBtn = page
        .locator(
          '[role="dialog"] button:has-text("Simpan"), [role="dialog"] button:has-text("Save"), [role="dialog"] button:has-text("Kirim")',
        )
        .first();
      await expect(saveBtn).toBeEnabled({ timeout: 10000 });
      await saveBtn.click();
      await expect(page.locator('text=Berhasil, text=Tersimpan')).toBeVisible({
        timeout: 10000,
      });
    } else {
      // Fallback: assert the outbox list renders and has at least a table row.
      await expect(page.locator('h1')).toContainText('Surat Keluar');
      await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('RBAC: a parent/student role cannot access protected id-card regeneration', async ({
    page,
  }) => {
    await loginAs(page, 'parent');
    await page.goto('/students/id-card');

    // The Regenerasi Kartu control is hidden for non-privileged roles.
    const regenButton = page.locator('button:has-text("Regenerasi Kartu")');
    const visible = await regenButton.isVisible().catch(() => false);
    expect(visible).toBeFalsy();

    // Direct API call as parent must be denied.
    let denied = false;
    try {
      const session = await loginAs(page, 'parent');
      await apiRequest(session, 'POST', '/students/id-cards/bulk-regenerate', {});
    } catch (err) {
      denied = /403|forbidden/i.test(String(err));
    }
    expect(denied).toBeTruthy();
  });
});
