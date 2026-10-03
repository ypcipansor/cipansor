/**
 * The password rules (decided 2026-09-28, decisions/autentikasi-2fa-dan-sandi.md;
 * NIST SP 800-63B-4): 15 characters without 2FA, 8 with it, no rules about
 * upper case, digits or symbols, and common passwords or ones made of the
 * service's or the person's name refused, with the reason on the field.
 *
 * And the change they force: a password someone else set — here, the admin
 * who created the account — or one an admin marks leaked is replaced at the
 * next sign-in, before any session begins.
 *
 * Uses an account of its own — created here, deleted at the end — because
 * changing a demo account's password would break every other spec that signs
 * in with it. Writes, so it skips itself against a production API.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  apiLogin,
  apiLoginFresh,
  apiRequest,
  injectSession,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";

test.describe.configure({ mode: "serial" });

const EMAIL = `sandi.e2e.${Date.now().toString(36)}@example.test`;
// Set by the admin, then by the person at the forced change, then from the
// profile, then again after the admin marks it leaked.
const FIRST = "sawah hijau di kaki gunung";
const SECOND = "hujan turun di sore hari";
const THIRD = "angin laut di pagi buta";
const FOURTH = "bulan sabit di atas menara";

let admin: AuthSession;
let unitId = "";
let userId = "";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

/** A real sign-in with this password, bypassing any cache. */
const signIn = async (password: string) => {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client": "bearer" },
    body: JSON.stringify({ email: EMAIL, password }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
  };
  return { status: res.status, data: body.data ?? {} };
};
const signInStatus = async (password: string) =>
  (await signIn(password)).status;

/** Renew a session from its refresh token, as a bearer client does. */
const refreshStatus = async (session: AuthSession) =>
  (
    await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client": "bearer" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
  ).status;

/** Sign in through the form, up to the card that asks for a new password. */
async function signInToForcedChange(page: Page, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Buat Kata Sandi Baru")).toBeVisible();
}

/** Fill the forced-change card; the form, for asserting messages on it. */
async function chooseNewPassword(page: Page, value: string) {
  await page.getByLabel("Kata sandi baru", { exact: true }).fill(value);
  await page.getByLabel("Ulangi kata sandi baru").fill(value);
  await page.getByRole("button", { name: "Simpan dan masuk" }).click();
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Simpan dan masuk" }) });
}

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

test("the first sign-in asks for a password only the person knows, with the reason for each refusal on the field", async ({
  page,
}) => {
  test.skip(!userId, "needs the account from the previous test");

  // The admin's password signs in, but to the change, not to a session.
  const first = await signIn(FIRST);
  expect(first.status).toBe(200);
  expect(first.data).toMatchObject({ requiresPasswordChange: true });
  expect(first.data).not.toHaveProperty("accessToken");
  expect(first.data).not.toHaveProperty("refreshToken");

  await signInToForcedChange(page, FIRST);
  await expect(
    page.getByText(/Minimal 15 karakter, atau 8 karakter/),
  ).toBeVisible();

  // The one the admin chose is presumed known.
  let form = await chooseNewPassword(page, FIRST);
  await expect(form.getByText(/berbeda dari yang lama/)).toBeVisible();

  // 9 characters: past the form's floor, but this account has no 2FA, so the
  // API asks for 15 — on the field, not in a toast.
  form = await chooseNewPassword(page, "kopi-susu");
  await expect(form.getByText(/Kata sandi minimal 15 karakter/)).toBeVisible();
  await page.waitForTimeout(750);
  expect(await page.locator("[data-sonner-toast]").count()).toBe(0);

  await chooseNewPassword(page, SECOND);
  await expect(page).toHaveURL(/\/teacher/);

  // From now on the person's own password signs straight in.
  expect((await signIn(SECOND)).data).toHaveProperty("accessToken");
  expect(await signInStatus(FIRST)).toBe(401);
});

test("Profile → Keamanan says why a new password is refused, then takes a sentence", async ({
  page,
}) => {
  test.skip(!userId, "needs the account from the previous test");
  const here = await apiLoginFresh({ email: EMAIL, password: SECOND });
  const elsewhere = await apiLoginFresh({ email: EMAIL, password: SECOND });
  await injectSession(page, here);
  await page.goto("/profile?tab=security");

  const current = page.getByLabel("Password Lama");
  const next = page.getByLabel("Password Baru", { exact: true });
  const confirm = page.getByLabel("Konfirmasi Password Baru");
  const submit = page.getByRole("button", { name: "Ubah Password" });
  const fill = async (value: string) => {
    await current.fill(SECOND);
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

  await fill(THIRD);
  await expect(page.getByText("Password berhasil diubah")).toBeVisible();

  // The session that made the change goes on; the other one ends (NIST SP
  // 800-63B-4). Its access token would outlive the change anyway, so the
  // refresh is what tells.
  expect(await refreshStatus(here)).toBe(200);
  expect(await refreshStatus(elsewhere)).toBe(401);

  // The new one signs in; the old one no longer does.
  expect(await signInStatus(THIRD)).toBe(200);
  expect(await signInStatus(SECOND)).toBe(401);
});

test("an admin marks the password leaked: the running session is not renewed, and the next sign-in asks for a new one", async ({
  page,
}) => {
  test.skip(!userId, "needs the account from the previous test");
  const running = await apiLoginFresh({ email: EMAIL, password: THIRD });

  await injectSession(page, admin);
  await page.goto("/users");
  // The new account is on the first page already, so the row would match
  // before the debounced search fires — and the search's re-render closes a
  // menu opened in between. Open it once the searched list has arrived.
  const searched = page.waitForResponse(
    (r) => r.url().includes("/users?") && r.url().includes("search="),
  );
  await page.getByPlaceholder("Search by name or email...").fill(EMAIL);
  await searched;
  const row = page.getByRole("row").filter({ hasText: EMAIL });
  await expect(row).toHaveCount(1);
  await row.getByRole("button").last().click();
  await page
    .getByRole("menuitem", { name: "Wajibkan ganti kata sandi" })
    .click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Anda tidak akan mengetahui");
  await dialog.getByRole("button", { name: "Wajibkan" }).click();
  await expect(page.getByText(/Guru Uji Sandi wajib diganti/)).toBeVisible();
  await expect(dialog).toBeHidden();

  // The session that was signed in when it happened cannot be renewed.
  expect(await refreshStatus(running)).toBe(401);

  // The password still proves who it is, but leads only to the change. The
  // admin's session leaves the browser first, persisted user included.
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
  await signInToForcedChange(page, THIRD);
  await chooseNewPassword(page, FOURTH);
  await expect(page).toHaveURL(/\/teacher/);
  expect(await signInStatus(FOURTH)).toBe(200);
});
