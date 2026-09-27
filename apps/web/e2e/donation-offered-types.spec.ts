import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { waitForLoadingComplete } from "./helpers/page-helpers";

/**
 * A new donation is offered only as what the yayasan itself offers — no
 * Zakat Maal or Zakat Fitrah — on the public Wakaf & Infaq form and on staff
 * entry (Keuangan → Donation/ZIS → Catat Donasi).
 *
 * The yayasan's own site offers wakaf, scholarships and infaq and no zakat,
 * and whether it may collect zakat (UPZ BAZNAS, a licensed LAZ) is not known;
 * collecting zakat without that is an offence (UU 23/2011 Pasal 38, 41).
 * Until 2026-09-27 both forms offered zakat.
 */

const API_URL = process.env.API_URL || "http://localhost:3001/api";

// Every write here is one the fix refuses; before it, the two POSTs below
// recorded a donation. Never against the live API.
test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini mencoba menulis donasi, jadi dilewati",
  );
});

const OFFERED = ["Infak", "Wakaf", "Beasiswa"];
const NOT_OFFERED = [/zakat maal/i, /zakat fitrah/i];

test("the public Wakaf & Infaq form offers no zakat", async ({ page }) => {
  await page.goto("/wakaf-infaq");
  // "Pilih Program Ini" on the first published programme opens the form.
  await page.getByRole("button", { name: "Pilih Program Ini" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("combobox", { name: "Jenis Donasi" }).click();
  const options = page.getByRole("option");
  for (const name of OFFERED) {
    await expect(options.filter({ hasText: name }).first()).toBeVisible();
  }
  for (const name of NOT_OFFERED) {
    await expect(options.filter({ hasText: name })).toHaveCount(0);
  }
});

test("the public donation route refuses zakat, whatever the page offers", async () => {
  // Refused for its type, not by Turnstile (off on the e2e stack): the
  // answer has to name the field, or a Turnstile 400 would pass this too.
  const res = await fetch(`${API_URL}/donation/public`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "ZAKAT_FITRAH",
      amount: 50000,
      donorName: "Uji Zakat",
      paymentMethod: "BANK_TRANSFER",
      isAnonymous: false,
    }),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as {
    error?: { details?: { field: string }[] };
  };
  expect(body.error?.details?.map((d) => d.field)).toContain("type");
});

test("staff recording a donation are offered no zakat (Donation/ZIS → Catat Donasi)", async ({
  page,
}) => {
  const admin = await apiLogin(SEED_USERS.adminSdit);
  // The API holds the same line as the form.
  const refused = await apiRequest(admin, "POST", "/donation", {
    type: "ZAKAT_MAAL",
    amount: 50000,
    donorName: "Uji Zakat",
    paymentMethod: "CASH",
    isAnonymous: false,
  }).then(
    () => 200,
    (error: Error) => Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
  );
  expect(refused).toBe(400);

  await injectSession(page, admin);
  await page.goto("/donation/new");
  await waitForLoadingComplete(page);
  await page.getByRole("combobox", { name: "Tipe Donasi" }).click();
  const options = page.getByRole("option");
  for (const name of OFFERED) {
    await expect(options.filter({ hasText: name }).first()).toBeVisible();
  }
  for (const name of NOT_OFFERED) {
    await expect(options.filter({ hasText: name })).toHaveCount(0);
  }
});
