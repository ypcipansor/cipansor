import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

/**
 * The reset page must answer to someone with no session.
 *
 * This is the check that was missing. `/reset-password` did not exist, so the
 * middleware's auth branch caught it and redirected to
 * `/login?redirect=/reset-password` — discarding the token — and every "set
 * your password" e-mail led there. The page source looked fine because there
 * was no page; only asking for the URL the way a recipient does finds it.
 */
test.describe("Password reset link", () => {
  test("opens for a signed-out visitor instead of bouncing to login", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/reset-password?token=" + "a".repeat(64));

    // Not getByRole("heading"): CardTitle renders a plain <div>, so the page
    // never had that role and asserting it failed for a reason that had
    // nothing to do with what this test is for.
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByText("Setel Ulang Password")).toBeVisible();
    // The form itself is the proof — reaching the URL is not enough if the
    // page renders an error state instead.
    // `exact` matters: getByLabel matches substrings, and "Ulangi password
    // baru" contains "Password baru", so the loose form resolves to two
    // elements and fails on strict mode rather than on anything real.
    await expect(page.getByLabel("Password baru", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Simpan password baru/i }),
    ).toBeVisible();
  });

  test("asks for a new link when the URL carries no token", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/reset-password");

    await expect(page.getByText(/Tautan reset tidak lengkap/i)).toBeVisible();
  });

  test("offers no self-service reset form on the login page", async ({
    page,
  }) => {
    // Deliberate: a reset is started by an admin who has identified the person,
    // so nothing unauthenticated can make the system send mail.
    await page.context().clearCookies();
    await page.goto("/login");

    await expect(page.getByText(/lupa password/i)).toHaveCount(0);
  });
});

test.describe("Outgoing mail configuration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/notifications/settings");
  });

  test("reports the transport the server really has, not a hardcoded one", async ({
    page,
  }) => {
    await expect(page.getByText("Server Email Keluar")).toBeVisible();

    // Exactly one of the two states, and which one is decided by the server:
    // with no credentials configured the page must say so rather than showing
    // a green badge over a mailbox nothing sends from.
    const ready = page.getByText("Email siap kirim");
    const notSending = page.getByText(/Email tidak terkirim/);
    await expect(ready.or(notSending).first()).toBeVisible();
  });

  test("shows a reply address that is not the noreply mailbox", async ({
    page,
  }) => {
    // The pairing is the point: automated mail comes from noreply@, and a wali
    // who answers it must land somewhere a human reads. `.first()` because the
    // address also appears in the channel list below the card.
    await expect(page.getByText(/Tujuan balasan/i)).toBeVisible();
    await expect(page.getByText("halo@cipansor.or.id").first()).toBeVisible();
  });
});
