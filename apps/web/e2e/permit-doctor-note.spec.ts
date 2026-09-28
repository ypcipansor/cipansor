/**
 * A doctor's note on a permit (decided 2026-09-28,
 * decisions/pemutus-izin-santri.md): the wali attaches it when filing sick
 * leave; the santri's musyrif, who decides it, opens it and is recorded as the
 * one who saw it; the unit's tata usaha sees that there is one and cannot open
 * it. It is a child's health data, so the file is never a link — it is fetched
 * with the session and shown in the page.
 *
 * Accounts come from DEMO_ACCOUNTS (the seed links SMP IT's demo wali to the
 * demo pupil, who boards in the asrama the musyrif persona runs).
 */
import { test, expect, type Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

function demoLogin(roleCode: string) {
  const account = DEMO_ACCOUNTS.find((a) => a.roleCode === roleCode);
  if (!account) throw new Error(`No demo account for ${roleCode}`);
  return { email: account.email, password: account.password };
}

async function signIn(page: Page, roleCode: string): Promise<AuthSession> {
  const session = await apiLogin(demoLogin(roleCode));
  await injectSession(page, session);
  return session;
}

/** A `datetime-local` value `days` from now at `hour`:00, in the browser's zone. */
function localInput(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

/** A tiny, well-formed JPEG: the API reads the bytes, not the name. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

test.describe.configure({ mode: "serial" });

test.describe("Surat dokter pada izin", () => {
  const stamp = Date.now().toString(36);
  const reason = `Demam tinggi, istirahat di rumah (e2e ${stamp})`;
  // Far enough ahead that no other run's permit shares the dates.
  const offset = 900 + (Date.now() % 3000);
  let wali: AuthSession;
  let permitId = "";

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini menulis izin, jadi dilewati",
    );
    wali = await apiLogin(demoLogin("SMPIT_ORANG_TUA"));
  });

  test.afterAll(async () => {
    if (permitId && wali) {
      await apiRequest(wali, "POST", `/permits/${permitId}/cancel`).catch(
        () => undefined,
      );
    }
  });

  test("the wali files sick leave with the doctor's note attached", async ({
    page,
  }) => {
    await signIn(page, "SMPIT_ORANG_TUA");
    await page.goto("/parent/permits");
    await page.getByRole("button", { name: "Ajukan Izin" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Jenis izin").click();
    await page.getByRole("option", { name: "Sakit", exact: true }).click();
    await dialog.getByLabel("Berangkat").fill(localInput(offset, 7));
    await dialog.getByLabel("Kembali").fill(localInput(offset + 2, 17));
    await dialog.getByLabel("Alasan").fill(reason);
    // Who opens it and how long it stays is said before it is sent.
    await expect(
      dialog.getByText(
        /Hanya dapat dibuka pemutus izin, wali santri, dan kepala unit/,
      ),
    ).toBeVisible();
    await dialog.getByLabel("Surat dokter (bila ada)").setInputFiles({
      name: "surat-dokter.jpg",
      mimeType: "image/jpeg",
      buffer: JPEG,
    });
    await dialog.getByRole("button", { name: "Kirim Pengajuan" }).click();
    await expect(page.getByText("Pengajuan izin terkirim")).toBeVisible();

    const card = page
      .locator("div")
      .filter({ has: page.getByText(reason, { exact: true }) })
      .filter({ has: page.getByText("Surat dokter", { exact: true }) })
      .last();
    await expect(
      card.getByText(/^Dilampirkan .*; disimpan sampai /),
    ).toBeVisible();
    await expect(card.getByText(/Belum dilihat pemutus izin/)).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Buka surat dokter" }),
    ).toBeVisible();

    const mine = await apiRequest<{ data: { id: string; reason: string }[] }>(
      wali,
      "GET",
      "/permits?limit=50",
    );
    permitId = mine.data.find((p) => p.reason === reason)?.id ?? "";
    expect(permitId, "the filed permit is listed").toBeTruthy();
  });

  test("the unit's tata usaha sees that there is one, and cannot open it", async ({
    page,
    request,
  }) => {
    const tu = await signIn(page, "SMPIT_TATA_USAHA");
    await page.goto(`/permits/${permitId}`);
    await expect(page.getByText("Surat dokter", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        /Hanya dapat dibuka pemutus izin, wali santri, dan kepala unit/,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Buka surat dokter" }),
    ).toHaveCount(0);
    // Nor can they overwrite what they cannot see.
    await expect(page.getByRole("button", { name: "Ganti" })).toHaveCount(0);
    const refused = await request.get(
      `${API_URL}/permits/${permitId}/doctor-note`,
      {
        headers: { authorization: `Bearer ${tu.accessToken}` },
      },
    );
    expect(refused.status()).toBe(403);
  });

  test("the musyrif who decides it opens it in the page, and is named as having seen it", async ({
    page,
  }) => {
    await signIn(page, "MUSYRIF");
    await page.goto(`/permits/${permitId}`);
    const noteFetched = page.waitForResponse(
      (r) => r.url().endsWith(`/permits/${permitId}/doctor-note`) && r.ok(),
    );
    await page.getByRole("button", { name: "Buka surat dokter" }).click();
    const response = await noteFetched;
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const viewer = page.getByRole("dialog", { name: "Surat dokter" });
    const image = viewer.getByRole("img", { name: "Surat dokter" });
    await expect(image).toBeVisible();
    // The bytes the wali sent, decoded — not a broken image with its alt text.
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(viewer.getByText(/Pembukaan ini tercatat/)).toBeVisible();
  });

  test("the wali now sees who saw it", async ({ page }) => {
    await signIn(page, "SMPIT_ORANG_TUA");
    await page.goto("/parent/permits");
    const card = page
      .locator("div")
      .filter({ has: page.getByText(reason, { exact: true }) })
      .filter({ has: page.getByText("Surat dokter", { exact: true }) })
      .last();
    await expect(card.getByText(/Dilihat oleh /)).toBeVisible();
  });
});
