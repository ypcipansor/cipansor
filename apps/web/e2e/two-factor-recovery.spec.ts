/**
 * Verifikasi dua langkah, end to end, for an account whose 2FA is optional:
 * turn it on from Profil → Keamanan, sign in with a recovery code, and see the
 * same code refused the second time.
 *
 * Until 2026-09-28 a recovery code could never be used — the API handed every
 * code to otplib, which throws on anything that is not six digits, and the
 * sign-in card showed "Token must be 6 digits, got 10".
 *
 * The account (a teacher no other spec signs in as) is put back the way it
 * was in afterAll, through the API, whatever happened in the test.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { generate } from "otplib";
import { apiLogin, injectSession } from "./helpers/auth-api";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

const API_URL = process.env.API_URL || "http://localhost:3001/api";
const account = DEMO_ACCOUNTS.find(
  (a) => a.email === "sdit.wakasek@cipansor.or.id",
)!;

let secret = "";

/** Sign in with the password only, in a fresh browser, up to the 2FA card. */
async function passwordStep(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: process.env.BASE_URL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(
    page.getByText("Verifikasi Dua Langkah", { exact: true }),
  ).toBeVisible();
  return page;
}

async function submitCode(page: Page, code: string) {
  await page.locator("#token").fill(code);
  await page.getByRole("button", { name: "Verifikasi", exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  // Turn 2FA back off so the account signs in with its password again.
  if (!secret) return;
  const login = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Client": "bearer" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  }).then((r) => r.json());
  const temp = login?.data?.tempToken;
  if (!temp) return; // 2FA already off
  const verified = await fetch(`${API_URL}/auth/2fa/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client": "bearer",
      Authorization: `Bearer ${temp}`,
    },
    body: JSON.stringify({ token: await generate({ secret }) }),
  }).then((r) => r.json());
  await fetch(`${API_URL}/auth/2fa/disable`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${verified.data.accessToken}`,
    },
    body: JSON.stringify({ token: await generate({ secret }) }),
  });
});

test("a recovery code signs in once, and a mistyped code gets a clear answer", async ({
  page,
  browser,
}) => {
  // Turn 2FA on: Profil → Keamanan → Aktifkan.
  await injectSession(
    page,
    await apiLogin({ email: account.email, password: account.password }),
  );
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Keamanan" }).click();
  await expect(page.getByText("Tidak aktif", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Aktifkan", exact: true }).click();

  const dialog = page.getByRole("dialog");
  secret = (await dialog.locator("code").first().textContent())!.trim();
  await dialog.locator("#token").fill(await generate({ secret }));
  await dialog.getByRole("button", { name: "Verifikasi & aktifkan" }).click();

  await expect(
    dialog.getByText("Simpan kode pemulihan ini sekarang"),
  ).toBeVisible();
  const codes = (await dialog.locator(".font-mono > div").allTextContents())
    .map((c) => c.trim())
    .filter(Boolean);
  expect(codes).toHaveLength(10);
  await dialog.getByRole("button", { name: "Selesai" }).click();
  await expect(
    page.getByRole("button", { name: "Matikan", exact: true }),
  ).toBeVisible();

  // Sign in again: a mistyped code is answered in Indonesian, not with a 500.
  const signIn = await passwordStep(browser);
  await expect(
    signIn.getByLabel("Kode verifikasi atau kode pemulihan"),
  ).toBeVisible();
  await submitCode(signIn, "12345");
  await expect(signIn.getByText(/^Kode tidak cocok/)).toBeVisible();
  await expect(signIn.getByText(/Token must be/)).toHaveCount(0);

  // A recovery code, typed in lower case, signs in.
  await submitCode(signIn, codes[0].toLowerCase());
  await expect(signIn).not.toHaveURL(/\/login/);
  await signIn.context().close();

  // The same code a second time is refused.
  const again = await passwordStep(browser);
  await submitCode(again, codes[0]);
  await expect(again.getByText(/^Kode tidak cocok/)).toBeVisible();
  await expect(again).toHaveURL(/\/login/);
  await again.context().close();
});
