/**
 * Captures real mobile-viewport screenshots for the PWA manifest's install UI.
 *
 * Tooling, not a product test: ignored by the Playwright config (its testIgnore
 * skips files beginning with an underscore), so it never runs in the gate. It
 * needs the seeded stack up (`/login`, `superadmin@cipansor.or.id`, `parent3@`).
 * Output goes to `/tmp/pwa-shots`; `scripts/gen-pwa-assets.py` reshapes it.
 *
 *     pnpm --filter web exec playwright test e2e/_capture-mobile.spec.ts \
 *       --project=chromium --workers=1
 */
import { test } from "@playwright/test";
import { loginAs } from "./helpers/auth-api";

const OUT = process.env.PWA_SHOTS_DIR || "/tmp/pwa-shots";

test("capture staff dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "superAdmin");
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: `${OUT}/mobile-dashboard-raw.png` });
});

test("capture parent portal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "parent");
  await page.goto("/parent");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: `${OUT}/mobile-parent-raw.png` });
});

test("capture wide dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loginAs(page, "superAdmin");
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: `${OUT}/desktop-dashboard-raw.png` });
});

test("capture wide attendance", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loginAs(page, "superAdmin");
  await page.goto("/attendance");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: `${OUT}/desktop-attendance-raw.png` });
});
