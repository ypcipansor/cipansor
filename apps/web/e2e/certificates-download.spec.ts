import { test, expect, type Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { gotoAuthedPage } from "./helpers/page-helpers";

/**
 * Certificates — the download and verification flows users actually click.
 *
 * The list and detail pages stopped opening a stored `pdfUrl` and now fetch the
 * bytes from the scoped `/certificates/:id/download` route; the public
 * verification page stopped linking to the sanad *verification form* and now
 * downloads the real PDF from the session-free
 * `/certificates/public/:code/download`. The access-control fix that made the
 * public route answer only for an `isPublic` certificate is pinned here too: a
 * private certificate must not verify and must not download, and it must answer
 * exactly as an unknown number does so the route cannot confirm its existence.
 *
 * These are real browser flows, not mocked handlers: the download assertion
 * reads the bytes Playwright received and checks the `%PDF-` header.
 */

/** The seeded public certificate (`prisma/seed.ts`). */
const PUBLIC_NUMBER = "CERT-TFZ-30-2024001";

/**
 * The portal's verification page. It is the page the Devin finding points at
 * (`/certificates/verify/:code`), and it lives inside the portal, so it needs a
 * session — the *printed* QR opens `/public/verify-sanad` instead, which is a
 * different, genuinely session-free page. Signed in, it is the same code the
 * recipient's download button runs, and the private/unknown assertions below do
 * not depend on who is signed in.
 */
test.describe("Sertifikat publik — verifikasi dan unduh", () => {
  let session: AuthSession;

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini membaca data, jadi dilewati",
    );
    session = await apiLogin(SEED_USERS.superAdmin);
  });

  test("halaman verifikasi mengunduh PDF asli, bukan membuka formulir verifikasi", async ({
    page,
  }) => {
    await injectSession(page, session);
    await page.goto(`/certificates/verify/${PUBLIC_NUMBER}`);
    // CardTitle renders a `div`, not an ARIA heading.
    await expect(page.getByText("Sertifikat Terverifikasi")).toBeVisible();

    // The button fetches the file, not `/public/verify-sanad` — the bug was a
    // download action that only re-opened the verification form.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Unduh Sertifikat" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    // The bytes are a PDF, not a redirect page or a JSON error envelope.
    const stream = await download.createReadStream();
    const first = await new Promise<Buffer>((resolve, reject) => {
      stream.once("data", (chunk: Buffer) => resolve(chunk));
      stream.once("error", reject);
    });
    expect(first.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("nomor yang tidak dikenal ditolak dan tidak menawarkan unduhan", async ({
    page,
  }) => {
    await injectSession(page, session);
    await page.goto("/certificates/verify/THIS-IS-NOT-A-CERTIFICATE");
    await expect(page.getByText("Sertifikat Tidak Valid")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Unduh Sertifikat" }),
    ).toHaveCount(0);
  });
});

/**
 * The private/unknown half of the same route, driven through the API the page
 * calls. The API is asked directly because the seed exposes no private
 * certificate to click, and the property under test — a private number is
 * indistinguishable from an unknown one — is exactly what a browser would see.
 */
test.describe("Sertifikat privat — akses publik ditolak", () => {
  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini membaca/menulis data, jadi dilewati",
    );
  });

  test("nomor privat tidak terverifikasi dan tidak terunduh, persis seperti nomor tak dikenal", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Make the seeded certificate private for the duration of the test, then
    // restore it — the public route is what is being probed, not the row.
    const publicBefore = await apiRequest<{
      data: Array<{ id: string; isPublic: boolean }>;
    }>(session, "GET", `/certificates?search=${PUBLIC_NUMBER}&limit=1`);
    const cert = publicBefore.data[0];
    expect(cert, "seed should expose the public certificate").toBeTruthy();

    const setPublic = (isPublic: boolean) =>
      apiRequest(session, "PATCH", `/certificates/${cert.id}`, { isPublic });

    try {
      await setPublic(false);

      // Verification: the public answer is `valid: false`, byte-for-byte the
      // same shape an unknown number gets — no holder, unit or grade.
      const privateVerify = await apiRequest<{
        data: { valid: boolean; certificate?: unknown; message?: string };
      }>(session, "GET", `/certificates/verify/${PUBLIC_NUMBER}`);
      const unknownVerify = await apiRequest<typeof privateVerify>(
        session,
        "GET",
        "/certificates/verify/NO-SUCH-NUMBER-0000",
      );
      expect(privateVerify.data.valid).toBe(false);
      expect(privateVerify.data.certificate).toBeFalsy();
      expect(privateVerify.data.message).toBe(unknownVerify.data.message);

      // Download: the public PDF route must 404 a private certificate.
      const download = await fetch(
        `${process.env.API_URL || "http://localhost:3001/api"}/certificates/public/${PUBLIC_NUMBER}/download`,
      );
      expect(download.status).toBe(404);
    } finally {
      await setPublic(true);
    }
  });
});

/**
 * The authenticated list → detail → download chain. A regression here (a
 * download button that toasts an error, a detail page that does not open)
 * would otherwise only be caught by a human clicking through.
 */
test.describe("Sertifikat — daftar dan detail mengunduh PDF", () => {
  let session: AuthSession;

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini melewati data produksi",
    );
    session = await apiLogin(SEED_USERS.superAdmin);
  });

  const signIn = (page: Page) => injectSession(page, session);

  test("daftar sertifikat mengunduh PDF dari baris", async ({ page }) => {
    await signIn(page);
    await gotoAuthedPage(page, "/certificates", /Sertifikat Digital/i);

    // The per-row action trigger is an icon-only button; open it, then choose
    // Download PDF from the menu.
    await page.locator("table tbody tr").first().getByRole("button").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^sertifikat-.*\.pdf$/i);
  });

  test("detail sertifikat mengunduh PDF dari kartu aksi", async ({ page }) => {
    await signIn(page);

    const list = await apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      "/certificates?limit=1",
    );
    const id = list.data[0]?.id;
    expect(id, "seed should provide a certificate").toBeTruthy();

    await gotoAuthedPage(page, `/certificates/${id}`, /Detail Sertifikat/i);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
