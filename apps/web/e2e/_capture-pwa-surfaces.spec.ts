/**
 * Captures every user-facing PWA surface on this branch, for the PR review.
 *
 * Tooling, not a product test: it is ignored by the Playwright config (the
 * `_*.spec.ts` ignore) and never runs in the gate. It needs the seeded stack up
 * and the production web build (`next start`), because the install banner and
 * the push control only render there.
 *
 *     pnpm --filter web exec playwright test -c playwright.pwa-surfaces.config.ts --workers=1
 *
 * Output: ${PWA_SHOTS_DIR:-/tmp/pwa-surfaces}/*.png
 */
import { expect, test } from "@playwright/test";
import { apiLogin, injectSession, SEED_USERS } from "./helpers/auth-api";

const OUT = process.env.PWA_SHOTS_DIR || "/tmp/pwa-surfaces";

// A desktop UA is what Chrome's install criteria key on; the banner shows only
// where a manifest exists and no worker has claimed the tab yet.
test.use({ serviceWorkers: "block" });

/** Clear the dismissal marker so the install banner is eligible to render. */
async function clearDismissal(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("pwa-install-dismissed");
      localStorage.removeItem("pwa-install-dismissed-until");
    } catch {
      /* storage blocked */
    }
  });
}

test("push control card on /notifications/settings", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAs(page, "superAdmin");
  await page.goto("/notifications/settings");
  await page.waitForLoadState("networkidle").catch(() => {});
  const card = page.getByText("Notifikasi Push di Perangkat Ini").first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await expect(card).toBeVisible();
  await page.screenshot({
    path: `${OUT}/settings-push-card.png`,
    fullPage: true,
  });
});

test("push control card, mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "superAdmin");
  await page.goto("/notifications/settings");
  await page.waitForLoadState("networkidle").catch(() => {});
  const card = page.getByText("Notifikasi Push di Perangkat Ini").first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await expect(card).toBeVisible();
  await page.screenshot({ path: `${OUT}/settings-push-card-mobile.png` });
});

test("install banner, iPhone visitor", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    });
  });
  await clearDismissal(page);
  await loginAs(page, "superAdmin");
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle").catch(() => {});
  const banner = page.getByRole("dialog", { name: "Pasang aplikasi Cipansor" });
  await expect(banner).toBeVisible({ timeout: 8000 });
  await expect(banner.getByText("Tambah ke Layar Utama")).toBeVisible();
  await page.screenshot({ path: `${OUT}/install-banner-ios.png` });
});

test("install banner, Android/Chrome visitor", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearDismissal(page);
  await loginAs(page, "superAdmin");
  // Chrome fires `beforeinstallprompt` late; the head script stashes it and the
  // banner listens for the dispatch. Synthesize it so the native banner renders.
  await page.addInitScript(() => {
    const fire = () => {
      const e: Record<string, unknown> = new Event("beforeinstallprompt");
      e.prompt = async () => {};
      e.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(e);
    };
    setTimeout(fire, 1500);
  });
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle").catch(() => {});
  const banner = page.getByRole("dialog", { name: "Pasang aplikasi Cipansor" });
  await expect(banner).toBeVisible({ timeout: 8000 });
  await expect(banner.getByRole("button", { name: /Pasang/ })).toBeVisible();
  await page.screenshot({ path: `${OUT}/install-banner-android.png` });
});

test("update prompt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "superAdmin");
  await page.addInitScript(() => {
    // The prompt reads the stash, then the event; satisfy both.
    window.addEventListener("load", () => {
      setTimeout(() => {
        (window as unknown as { __swWaiting: object }).__swWaiting = {};
        window.dispatchEvent(new Event("sw-update-ready"));
      }, 1500);
    });
  });
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle").catch(() => {});
  const prompt = page.getByRole("status", { name: "Versi baru tersedia" });
  await expect(prompt).toBeVisible({ timeout: 8000 });
  await page.screenshot({ path: `${OUT}/update-prompt.png` });
});

async function loginAs(
  page: import("@playwright/test").Page,
  role: keyof typeof SEED_USERS,
) {
  const session = await apiLogin(SEED_USERS[role]);
  await injectSession(page, session);
}
