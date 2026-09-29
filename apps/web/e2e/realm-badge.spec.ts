/**
 * The badge beside the role name — in the header's role switcher and on the
 * sidebar's account card — names the role's realm. Its maps were keyed `TK`
 * and `SMA_ALQURAN` after the enum had become `TK_QURAN` and `SMA_QURAN`, and
 * knew no `PESANTREN`: every TK Qur'an, SMA Qur'an and pesantren role showed an
 * empty pill. Read-only.
 */
import { test, expect } from "@playwright/test";
import { apiLogin, injectSession } from "./helpers/auth-api";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

const account = (email: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!found) throw new Error(`No demo account ${email}`);
  return { email: found.email, password: found.password };
};

for (const [email, label] of [
  ["tkq.guru@cipansor.or.id", "TK Qur'an"],
  ["smaq.guru@cipansor.or.id", "SMA Qur'an"],
  ["pesantren.ustadz@cipansor.or.id", "Pesantren"],
  ["smpit.guru@cipansor.or.id", "SMP IT"],
] as const) {
  test(`${email} carries the "${label}" badge`, async ({ page }) => {
    await injectSession(page, await apiLogin(account(email)));
    await page.goto("/teacher");

    await expect(
      page.locator("header").getByText(label, { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("aside").getByText(label, { exact: true }),
    ).toBeVisible();
  });
}
