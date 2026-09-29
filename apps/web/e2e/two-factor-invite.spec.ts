/**
 * The invitation to turn 2FA on after signing in (decided 2026-09-28,
 * decisions/autentikasi-2fa-dan-sandi.md): educators, staff and wali santri
 * for whom it is not mandatory are asked right after the password step.
 * "Nanti saja" has no limit and lets them go for this sign-in; the next
 * sign-in asks again. "Aktifkan sekarang" opens Profile → Keamanan. Santri are
 * not asked.
 *
 * Signs in through the form — the invitation belongs to a sign-in, which an
 * injected session is not. Writes nothing: it never turns 2FA on.
 */
import { test, expect, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

// A visitor until the form signs in.
test.use({ storageState: { cookies: [], origins: [] } });

const byEmail = (email: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!found) throw new Error(`No demo account ${email}`);
  return found;
};
// Accounts no other spec turns 2FA on for.
const GURU = byEmail("tkq.guru@cipansor.or.id");
const WALI = byEmail("tkq.ortu@cipansor.or.id");
const SANTRI = byEmail("smaq.siswa@cipansor.or.id");

const invitation = (page: Page) =>
  page.getByRole("dialog", { name: "Lindungi akun Anda" });

/** Sign in through the form; resolves once the status answer has arrived. */
async function signIn(
  page: Page,
  account: { email: string; password: string },
) {
  await page.goto("/login");
  const status = page.waitForResponse(
    (r) => r.url().includes("/auth/2fa/status") && r.ok(),
  );
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  await status;
}

async function signOut(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

test("a teacher is invited after signing in; Nanti saja lets them go until the next sign-in", async ({
  page,
}) => {
  await signIn(page, GURU);
  await expect(invitation(page)).toBeVisible();
  await expect(invitation(page)).toContainText("verifikasi dua langkah");
  await invitation(page).getByRole("button", { name: "Nanti saja" }).click();
  await expect(invitation(page)).toHaveCount(0);

  // Not asked again on this sign-in: not after a reload, not on another page.
  await page.reload();
  await page.goto("/profile");
  await expect(page.getByRole("tab", { name: "Keamanan" })).toBeVisible();
  await expect(invitation(page)).toHaveCount(0);

  // The next sign-in asks again; "Aktifkan sekarang" opens Keamanan.
  await signOut(page);
  await signIn(page, GURU);
  await expect(invitation(page)).toBeVisible();
  await invitation(page)
    .getByRole("button", { name: "Aktifkan sekarang" })
    .click();
  await expect(page).toHaveURL(/\/profile\?tab=security$/);
  await expect(page.getByRole("tab", { name: "Keamanan" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(
    page.getByRole("button", { name: "Aktifkan", exact: true }),
  ).toBeVisible();
  await expect(invitation(page)).toHaveCount(0);
});

test("a wali santri is invited too", async ({ page }) => {
  await signIn(page, WALI);
  await expect(invitation(page)).toBeVisible();
});

test("a santri is not invited", async ({ page }) => {
  await signIn(page, SANTRI);
  await expect(invitation(page)).toHaveCount(0);
});
