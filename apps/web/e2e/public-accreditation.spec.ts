import { test, expect, type Page } from "@playwright/test";
import { apiLogin, apiRequest, type AuthSession } from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";
import { LOCALE_COOKIE } from "../src/locales";
import type {
  UnitAccreditation,
  UnitAccreditationList,
} from "../../../packages/shared/src/schemas/accreditation";

/**
 * A unit's accreditation on the public site (decided 2026-09-28,
 * decisions/akreditasi-unit.md): *Profil → Legalitas* states each unit's
 * certificate in force — rating, numbers, last day, the PDF, a link to check
 * it at BAN-PDM — and the unit's own page one line. A certificate that has run
 * out is not stated and its PDF is not served; a unit with none is not
 * mentioned. English and Arabic readers get the same facts in their language.
 */

test.describe.configure({ mode: "serial" });
// A visitor: no session.
test.use({ storageState: { cookies: [], origins: [] } });

const API_URL = process.env.API_URL || "http://localhost:3001/api";

const account = (email: string) => {
  const found = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!found) throw new Error(`No demo account ${email}`);
  return { email: found.email, password: found.password };
};

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const stamp = Date.now().toString(36).toUpperCase();
// Its own mark and its own units (SMA, SD): unit-accreditation.spec.ts keeps
// the SMP's record and clears "E2E-" numbers there, in parallel with this file.
const MARK = "PUB-E2E-";
const IN_FORCE = `${MARK}${stamp}/32/SMA/2026`;
const RAN_OUT = `${MARK}${stamp}/32/SD/2020`;

/** yyyy-MM-dd, `days` from today — never a fixed date that goes stale. */
const dayFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

let smaAdmin: AuthSession;
let sdAdmin: AuthSession;
let smaUnit = "";
let sdUnit = "";
let inForce: UnitAccreditation;
let ranOut: UnitAccreditation;

async function record(
  session: AuthSession,
  unitId: string,
  fields: Record<string, string>,
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append(
    "certificate",
    new Blob([PDF], { type: "application/pdf" }),
    "sertifikat.pdf",
  );
  const res = await fetch(`${API_URL}/units/${unitId}/accreditations`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
    body: form,
  });
  expect(res.status, await res.clone().text()).toBe(201);
  return ((await res.json()) as { data: UnitAccreditation }).data;
}

/** What this file recorded: certificates whose number carries its mark. */
async function purge(session: AuthSession, unitId: string) {
  const list = await apiRequest<{ data: UnitAccreditationList }>(
    session,
    "GET",
    `/units/${unitId}/accreditations`,
  );
  for (const a of list.data.accreditations) {
    if (a.certificateNumber.startsWith(MARK)) {
      await apiRequest(
        session,
        "DELETE",
        `/units/${unitId}/accreditations/${a.id}`,
      );
    }
  }
}

/** Open a public page and wait for the certificates in force to arrive. */
async function openPublic(page: Page, path: string) {
  const loaded = page.waitForResponse(
    (r) => r.url().includes("/units/public/accreditations") && r.ok(),
  );
  await page.goto(path);
  await loaded;
}

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini menulis catatan akreditasi, jadi dilewati",
  );
  smaAdmin = await apiLogin(account("smaq.admin@cipansor.or.id"));
  sdAdmin = await apiLogin(account("sdit.admin@cipansor.or.id"));
  smaUnit = (smaAdmin.user as { unitId: string }).unitId;
  sdUnit = (sdAdmin.user as { unitId: string }).unitId;
  await purge(smaAdmin, smaUnit);
  await purge(sdAdmin, sdUnit);
  // Decreed yesterday, so it is the SMA's latest whatever else is on record.
  inForce = await record(smaAdmin, smaUnit, {
    rating: "A",
    certificateNumber: IN_FORCE,
    decreeNumber: `E2E-${stamp}/BAN-PDM/SK`,
    decreedAt: dayFromNow(-1),
    validUntil: dayFromNow(5 * 365),
  });
  // Its last day was yesterday.
  ranOut = await record(sdAdmin, sdUnit, {
    rating: "B",
    certificateNumber: RAN_OUT,
    decreeNumber: `E2E-${stamp}/BAN-PDM/SK-SD`,
    decreedAt: dayFromNow(-6 * 365),
    validUntil: dayFromNow(-1),
  });
});

test.afterAll(async () => {
  if (smaAdmin) await purge(smaAdmin, smaUnit);
  if (sdAdmin) await purge(sdAdmin, sdUnit);
});

test("Profil → Legalitas states the certificate in force, its PDF and the BAN-PDM check", async ({
  page,
  request,
}) => {
  await openPublic(page, "/profil/legalitas");
  const section = page.locator('section[aria-labelledby="akreditasi"]');
  await expect(
    section.getByRole("heading", { name: "Akreditasi Satuan Pendidikan" }),
  ).toBeVisible();

  const sma = section.getByRole("article", { name: "SMA Qur'an Cipansor" });
  await expect(sma).toContainText("Terakreditasi A");
  await expect(sma).toContainText(IN_FORCE);

  const pdf = sma.getByRole("link", { name: "Lihat sertifikat (PDF)" });
  const response = await request.get((await pdf.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString("latin1")).toBe(
    "%PDF-",
  );
  await expect(
    sma.getByRole("link", { name: "Cek di BAN-PDM" }),
  ).toHaveAttribute("href", "https://ban-pdm.id/data-akreditasi-sekolah");

  // The SD's certificate ran out yesterday: not stated, and its PDF is gone.
  await expect(section).not.toContainText(RAN_OUT);
  await expect(
    section.getByRole("article", { name: "SD IT Cipansor" }),
  ).toHaveCount(0);
  const gone = await request.get(
    `${API_URL}/units/public/accreditations/${ranOut.id}/certificate`,
  );
  expect(gone.status()).toBe(404);
});

test("the unit's page carries one line to it; a unit with none carries nothing", async ({
  page,
}) => {
  await openPublic(page, "/unit/sma-quran");
  const line = page.getByText(/^Terakreditasi A, berlaku sampai /);
  await expect(line).toBeVisible();
  await page.getByRole("link", { name: "Lihat sertifikatnya" }).click();
  await expect(page).toHaveURL(/\/profil\/legalitas#akreditasi$/);
  await expect(
    page.getByRole("heading", { name: "Akreditasi Satuan Pendidikan" }),
  ).toBeVisible();

  // TK Qur'an, newly founded, has none: nothing is said, not "belum".
  await openPublic(page, "/unit/tkq");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Terakreditasi/)).toHaveCount(0);
});

test("an English and an Arabic reader get the same facts", async ({
  page,
  context,
  baseURL,
}) => {
  const url = new URL(baseURL ?? "http://localhost:3000");
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: url.hostname, path: "/" },
  ]);
  await openPublic(page, "/profil/legalitas");
  const en = page.getByRole("article", { name: "SMA Qur'an Cipansor" });
  await expect(
    page.getByRole("heading", { name: "Accreditation of Our Schools" }),
  ).toBeVisible();
  await expect(en).toContainText("Accredited A");
  await expect(en).toContainText(IN_FORCE);

  await context.addCookies([
    { name: LOCALE_COOKIE, value: "ar", domain: url.hostname, path: "/" },
  ]);
  await openPublic(page, "/profil/legalitas");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const ar = page.getByRole("article", { name: "SMA Qur'an Cipansor" });
  await expect(ar).toContainText("معتمدة بدرجة A");
  // The number as issued, left to right inside the Arabic text.
  await expect(ar.locator('[dir="ltr"]', { hasText: IN_FORCE })).toHaveText(
    IN_FORCE,
  );
});
