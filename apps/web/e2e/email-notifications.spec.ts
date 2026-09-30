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
    await expect(
      page.getByLabel("Password baru", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Simpan password baru/i }),
    ).toBeVisible();
  });

  test("asks for a new link when the URL carries no token", async ({
    page,
  }) => {
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

/**
 * Browser Web Push is per-device, unlike the per-user "Push" channel above it.
 * The page used to carry only the per-user toggle; the control that actually
 * subscribes this browser is the new card. These check it renders with a real
 * state and that it does not lie about being ready.
 */
test.describe("Browser push control", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
    await page.goto("/notifications/settings");
  });

  test("shows a per-device push control with one honest state", async ({
    page,
  }) => {
    await expect(
      page.getByText("Notifikasi Push di Perangkat Ini"),
    ).toBeVisible();

    // Exactly one of the states must render, and headless Chromium never grants
    // push, so the toggle is either offered or explains why it is not.
    const states = [
      "Browser ini tidak mendukung notifikasi push.",
      /pasang dulu portal ini ke Layar Utama/,
      "Notifikasi push belum diaktifkan oleh pengelola sistem.",
      /Izin notifikasi diblokir/,
      // The card reports the device as registered, not as "actively receiving":
      // no sender is wired on the API yet, so claiming delivery would be a lie.
      /Perangkat ini terdaftar/,
      "Belum aktif di perangkat ini.",
    ];
    const visible = await Promise.all(
      states.map(async (s) =>
        page
          .getByText(s)
          .isVisible()
          .catch(() => false),
      ),
    );
    expect(visible.filter(Boolean)).toHaveLength(1);
  });

  test("enables then disables push through the real API", async ({
    page,
    context,
  }) => {
    // The card is only offered when a VAPID public key is configured. The
    // webServer env sets one (see playwright.config.ts); a real key is not
    // required because the client only checks non-emptiness and the API stores
    // whatever endpoint/keys the browser hands it.
    await context.grantPermissions(["notifications"], {
      origin: "http://localhost:3000",
    });

    // `ServiceWorkerRegister` skips registration under automation, so the real
    // PushManager never appears. Provide a faithful stand-in with the two
    // methods the hook uses (`getRegistration`, then `pushManager`), so the
    // flow exercises the hook + real API rather than a mocked service.
    await context.addInitScript(() => {
      const w = window as unknown as { __pushSub: unknown };
      // Playwright's bundled `chrome-headless-shell` reports
      // `Notification.permission === "denied"` even when `grantPermissions`
      // actually granted it (verified: the same context reports "granted" on a
      // full Chrome). The hook reads that property to decide whether the enable
      // control may be offered, so without this the button stays disabled and
      // the real flow can never run. Pin it to the granted state the browser
      // really holds.
      Object.defineProperty(Notification, "permission", {
        get: () => "granted",
        configurable: true,
      });
      // `requestPermission` is the other half: the hook awaits it before
      // subscribing, and the headless shell would resolve it to "denied" for the
      // same reason. Make it agree with the stubbed state.
      Object.defineProperty(Notification, "requestPermission", {
        value: async () => "granted",
        configurable: true,
        writable: true,
      });
      const endpoint = `https://push.example.com/e2e-${Date.now()}`;
      const subscription = {
        endpoint,
        expirationTime: null,
        toJSON: () => ({
          endpoint,
          expirationTime: null,
          keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
        }),
        unsubscribe: async () => {
          w.__pushSub = null;
          return true;
        },
      };
      const registration = {
        pushManager: {
          getSubscription: async () => w.__pushSub ?? null,
          subscribe: async () => {
            w.__pushSub = subscription;
            return subscription;
          },
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          controller: null,
          getRegistration: async () => registration,
          addEventListener() {},
          removeEventListener() {},
        },
        configurable: true,
      });
    });

    await loginAs(page, "superAdmin");
    await page.goto("/notifications/settings");

    const enable = page.getByRole("button", {
      name: "Aktifkan di perangkat ini",
    });
    await expect(enable).toBeEnabled();

    const [subscribeRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/notifications/push/subscribe") &&
          r.request().method() === "POST",
      ),
      enable.click(),
    ]);
    expect(subscribeRes.ok()).toBe(true);
    await expect(
      page.getByText(
        "Perangkat ini terdaftar. Pengiriman notifikasi dari server belum diaktifkan.",
      ),
    ).toBeVisible();

    const [unsubscribeRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/notifications/push/unsubscribe") &&
          r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Matikan" }).click(),
    ]);
    expect(unsubscribeRes.ok()).toBe(true);
    await expect(page.getByText("Belum aktif di perangkat ini.")).toBeVisible();
  });
});
