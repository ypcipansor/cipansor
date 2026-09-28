/**
 * Verifikasi dua langkah is mandatory for the head of every unit (decided
 * 2026-09-28): a kepala sekolah is asked for the code at sign-in, and the
 * profile says the setting is required instead of offering to turn it off. A
 * teacher's stays optional.
 *
 * Needs the API seeded with E2E_FIXED_2FA=1, which gives every account in a
 * 2FA-mandatory role the shared test secret.
 */
import { test, expect } from "@playwright/test";
import { apiLogin, injectSession } from "./helpers/auth-api";
import { LoginPage } from "./page-objects";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

const byEmail = (email: string) =>
  DEMO_ACCOUNTS.find((a) => a.email === email)!;
const KEPALA = byEmail("smpit.kepala@cipansor.or.id");
const GURU = DEMO_ACCOUNTS.find((a) => a.roleCode === "SDIT_GURU")!;

test("a kepala sekolah signs in with a code, and cannot turn 2FA off", async ({
  page,
}) => {
  await page.goto("/login");
  await page.locator("#email").fill(KEPALA.email);
  await page.locator("#password").fill(KEPALA.password);
  await page.locator('button[type="submit"]').click();

  // The second step is asked for: the role makes it mandatory.
  await expect(
    page.getByText("Verifikasi Dua Langkah", { exact: true }),
  ).toBeVisible();
  await new LoginPage(page).completeTwoFactorIfPrompted();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto("/profile");
  await page.getByRole("tab", { name: "Keamanan" }).click();
  await expect(page.getByText("Wajib untuk peran Anda.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Matikan", exact: true }),
  ).toHaveCount(0);
});

test("a teacher's 2FA stays optional", async ({ page }) => {
  await injectSession(
    page,
    await apiLogin({ email: GURU.email, password: GURU.password }),
  );
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Keamanan" }).click();

  await expect(page.getByText("Tidak aktif", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aktifkan", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Wajib untuk peran Anda.")).toHaveCount(0);
});
