/**
 * The password rules (decided 2026-09-28, decisions/autentikasi-2fa-dan-sandi.md;
 * NIST SP 800-63B-4): 15 characters without 2FA, 8 with it, no rules about
 * upper case, digits or symbols, and common passwords or ones made of the
 * service's or the person's name refused, with the reason on the field.
 *
 * Uses an account of its own — created here, deleted at the end — because
 * changing a demo account's password would break every other spec that signs
 * in with it. Writes, so it skips itself against a production API.
 */
import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";

test.describe.configure({ mode: "serial" });

const EMAIL = `sandi.e2e.${Date.now().toString(36)}@example.test`;
const FIRST = "sawah hijau di kaki gunung";
const SECOND = "hujan turun di sore hari";

let admin: AuthSession;
let unitId = "";
let userId = "";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

/** The status of a real sign-in with this password, bypassing any cache. */
const signInStatus = async (password: string) =>
  (
    await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client": "bearer" },
      body: JSON.stringify({ email: EMAIL, password }),
    })
  ).status;

const statusOf = (call: Promise<unknown>) =>
  call.then(
    () => 200,
    (error: Error) => ({
      status: Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
      message: error.message,
    }),
  );

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini membuat dan menghapus akun",
  );
  admin = await apiLogin(SEED_USERS.superAdmin);
  const units = await apiRequest<{ data: Array<{ id: string; type: string }> }>(
    admin,
    "GET",
    "/units?limit=50",
  );
  unitId = units.data.find((u) => u.type === "SD_IT")?.id ?? "";
  expect(unitId, "the seed has an SD IT unit").toBeTruthy();
});

test.afterAll(async () => {
  if (userId)
    await apiRequest(admin, "DELETE", `/users/${userId}`).catch(
      () => undefined,
    );
});

test("a new account needs 15 characters, and neither a common password nor the service's name", async () => {
  const create = (password: string) =>
    apiRequest<{ data: { id: string } }>(admin, "POST", "/users", {
      name: "Guru Uji Sandi",
      email: EMAIL,
      password,
      role: "TEACHER",
      unitId,
    });

  const short = await statusOf(create("kopi susu pagi"));
  expect(short).toMatchObject({ status: 400 });
  expect((short as { message: string }).message).toMatch(/minimal 15 karakter/);

  const named = await statusOf(create("Cipansor2026!!!!"));
  expect(named).toMatchObject({ status: 400 });
  expect((named as { message: string }).message).toMatch(/nama Cipansor/);

  // Lower case, spaces, no digit or symbol: fine.
  const created = await create(FIRST);
  userId = created.data.id;
  expect(userId).toBeTruthy();
});

test("Profile → Keamanan says why a new password is refused, then takes a sentence", async ({
  page,
}) => {
  test.skip(!userId, "needs the account from the previous test");
  await injectSession(page, await apiLogin({ email: EMAIL, password: FIRST }));
  await page.goto("/profile?tab=security");

  const current = page.getByLabel("Password Lama");
  const next = page.getByLabel("Password Baru", { exact: true });
  const confirm = page.getByLabel("Konfirmasi Password Baru");
  const submit = page.getByRole("button", { name: "Ubah Password" });
  const fill = async (value: string) => {
    await current.fill(FIRST);
    await next.fill(value);
    await confirm.fill(value);
    await submit.click();
  };

  await expect(
    page.getByText(/Minimal 15 karakter, atau 8 karakter/),
  ).toBeVisible();

  // The reason is shown on the form, under the field — looked for there, since
  // a toast carrying the same words once made a generic field message pass.
  const form = page.locator("form").filter({ has: submit });

  // 9 characters: enough only with 2FA, which this account does not have.
  await fill("kopi-susu");
  await expect(form.getByText(/Kata sandi minimal 15 karakter/)).toBeVisible();

  // Long enough, but only the service's name and digits: the API says so, on
  // the field and only there.
  await fill("Cipansor20262026");
  await expect(form.getByText(/nama Cipansor/)).toBeVisible();
  await expect(form.getByText(/tidak sesuai format/)).toHaveCount(0);
  // A toast mounts a frame or two after the error it reports; give it the
  // chance to appear, then count once. Not `toHaveCount(0)`: that retries for
  // five seconds, and a toast closes itself after four, so it passes by
  // waiting the toast out.
  await page.waitForTimeout(750);
  expect(await page.locator("[data-sonner-toast]").count()).toBe(0);

  await fill(SECOND);
  await expect(page.getByText("Password berhasil diubah")).toBeVisible();

  // The new one signs in; the old one no longer does. Straight to the API:
  // apiLogin keeps one session per email and would answer from it.
  expect(await signInStatus(SECOND)).toBe(200);
  expect(await signInStatus(FIRST)).toBe(401);
});
