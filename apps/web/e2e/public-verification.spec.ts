import { test, expect } from "@playwright/test";

/**
 * The public verification surface.
 *
 * This file exists because the feature once shipped unreachable: the API route
 * was correctly registered before `authenticate` and the page was written with
 * `no-store` and `noindex` — but the Next middleware, which nobody updated,
 * bounced every visitor to /login. A verification page that answers with a
 * staff login form is not a verification feature, and nothing in the suite
 * noticed.
 *
 * The surface has since moved. Verification is no longer "scan the QR and read
 * a verdict": a token attests that *some* letter was signed, never that the
 * document in the reader's hand is that letter, so a forger could keep the
 * genuine QR and edit the body. The public answer now comes from uploading the
 * PDF itself, whose bytes are hashed and matched. These tests follow it there.
 *
 * They run with no session on purpose: that is the only state the people
 * checking a letter are ever in.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test("the verification page is reachable without a session", async ({
  page,
}) => {
  const response = await page.goto("/public/verify-letter");

  // The old failure was a 307 to /login?redirect=… — assert on where we ended
  // up, which is what the person checking a letter actually sees.
  expect(new URL(page.url()).pathname).toBe("/public/verify-letter");
  expect(response?.status()).toBeLessThan(400);
});

test("it asks for the document, not for who you are", async ({ page }) => {
  await page.goto("/public/verify-letter");

  await expect(page.locator("input[type='file']")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/kata sandi|password/i);
  await expect(page.getByRole("textbox", { name: /email/i })).toHaveCount(0);
});

test("an already-printed QR path lands on the upload form, not a dead end", async ({
  page,
}) => {
  // Letters in circulation were printed when verification lived at
  // /verifikasi/<token>. That page is gone on purpose, but the paper is not:
  // the path must still lead somewhere useful, and never to a login wall.
  await page.goto("/verifikasi/e2e-token-that-does-not-exist");

  expect(new URL(page.url()).pathname).toBe("/public/verify-letter");
  await expect(page.locator("input[type='file']")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /email/i })).toHaveCount(0);
});
