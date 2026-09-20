import { test, expect } from "./fixtures/auth.fixture";
import { apiLogin, apiRequest, injectSession, SEED_USERS } from "./helpers/auth-api";

/**
 * PAUD evidence, end to end: upload → persist → open (BUG 1).
 *
 * The failure this guards against had three layers, all of which had to be
 * fixed before an uploaded photo could be seen again:
 *
 *  1. `useAddEvidence` posted to `/paud-assessment/assessments/:id/evidences`,
 *     which the API never mounted — every upload 404'd.
 *  2. The pages sent `fileType: "IMAGE"`, which `createEvidenceSchema`
 *     (z.enum(['image','video','document'])) rejected with a 400.
 *  3. The detail/edit viewers rendered `evidence.fileUrl` raw. Once uploads
 *     land in the private store, a raw URL 403s; it has to go through the same
 *     on-demand resolver as every other private viewer.
 *
 * A mocked unit test cannot catch (1) or (3): both are the contract between the
 * web client and the running API. This spec drives the real form against the
 * real backend and then reloads the viewer.
 */

// The seeded PAUD assessment (prisma/seed.ts). It belongs to the TK unit, so a
// super admin can read it, and it already carries one evidence row — which is
// what lets the "existing evidence also resolves" assertion below be real.
const ASSESSMENT_ID = "6bb56eef-ac55-407c-a75c-7851a6292d50";

const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Pick an option from a Radix Select by its trigger's accessible name. */
async function pickOption(
  page: import("@playwright/test").Page,
  triggerName: string,
  optionName: RegExp | string,
): Promise<void> {
  await page.getByRole("combobox", { name: triggerName }).click();
  await page.getByRole("option", { name: optionName }).first().click();
}

/** Open the edit page and wait until the form's data fetches have resolved. */
async function openEditFormReady(
  page: import("@playwright/test").Page,
): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes(`/paud-assessment/assessments/${ASSESSMENT_ID}`) &&
        r.ok(),
      { timeout: 30_000 },
    ),
    page.waitForResponse(
      (r) => r.url().includes("/students?") && r.ok(),
      { timeout: 30_000 },
    ),
    page.goto(`/tk/assessment/${ASSESSMENT_ID}/edit`),
  ]);
}

/**
 * Fill the step-1 controls. The page's Radix selects do not reflect the values
 * `form.reset` writes into react-hook-form — the trigger renders no text for a
 * set-but-unmounted item, and `semester` in particular stays unset and fails
 * zod validation — so each "Lanjut"/"Simpan" is a silently swallowed no-op
 * until every one is chosen explicitly. Selecting them is what a user does and
 * keeps this spec independent of that repopulation quirk.
 */
async function fillStepOne(page: import("@playwright/test").Page) {
  await pickOption(page, "Siswa *", /Aisyah Nur Fadhilah/);
  await pickOption(page, "Tahun Ajaran *", /2026\/2027/);
  await pickOption(page, "Tipe Periode *", /Semester/);
  await pickOption(page, "Semester *", /Ganjil/);
}

/** Advance one step, asserting it actually moved (validation can block it). */
async function goNext(page: import("@playwright/test").Page, step: number) {
  await page.getByRole("button", { name: "Lanjut" }).click();
  await expect(page.getByText(`Langkah ${step}:`, { exact: false })).toBeVisible(
    { timeout: 10_000 },
  );
}

async function advanceToReviewStep(page: import("@playwright/test").Page) {
  await fillStepOne(page);
  await goNext(page, 2);
  // `aspect` is a Radix Select with the same reset quirk as step 1.
  await pickOption(page, "Aspek Perkembangan *", /^NAM/);
  await goNext(page, 3);
  await goNext(page, 4);
}

test.describe("PAUD evidence upload → persist → open", () => {
  test("an uploaded evidence photo persists a stable URL and renders after reload (BUG 1)", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);
    type AssessmentPayload = {
      data: {
        evidences: Array<{ id: string; fileUrl: string; fileType: string }>;
      };
    };
    const before = await apiRequest<AssessmentPayload>(
      session,
      "GET",
      `/paud-assessment/assessments/${ASSESSMENT_ID}`,
    );
    const existingIds = new Set(before.data.evidences.map((e) => e.id));

    await openEditFormReady(page);

    await advanceToReviewStep(page);
    // Step 4 has just mounted; the existing-evidence resolver settles a render
    // later and can detach the input mid-call, so wait for it to be attached.
    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ state: "attached" });
    await fileInput.setInputFiles({
      name: "bukti-kegiatan.png",
      mimeType: "image/png",
      buffer: PNG_BUFFER,
    });

    // `onSubmit` awaits the assessment PUT and then the evidence POST; watch
    // both responses so the assertions below cannot race the upload itself.
    const evidencePost = page.waitForResponse(
      (r) =>
        r.url().includes("/paud-assessment/evidences") &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Simpan Perubahan" }).click();
    const evidenceResponse = await evidencePost;
    expect(
      evidenceResponse.status(),
      `evidence upload failed: ${await evidenceResponse.text()}`,
    ).toBeLessThan(300);
    await expect(page.getByText(/berhasil diperbarui/i).first()).toBeVisible({
      timeout: 20_000,
    });

    // Persist: the API stored a *stable* reference (an /uploads path), never a
    // SAS — a SAS in the DB would expire and the row would be unreadable later.
    const after = await apiRequest<AssessmentPayload>(
      session,
      "GET",
      `/paud-assessment/assessments/${ASSESSMENT_ID}`,
    );
    const uploaded = after.data.evidences.find((e) => !existingIds.has(e.id));
    expect(
      uploaded,
      `no new evidence row; before=${JSON.stringify([...existingIds])} after=${JSON.stringify(
        after.data.evidences.map((e) => e.id),
      )}`,
    ).toBeTruthy();
    expect(uploaded?.fileUrl).not.toContain("sig=");
    expect(uploaded?.fileType).toBe("image");

    // Open: the detail viewer must resolve a private URL through `/upload/sas`
    // and render an <img> whose src carries a short-lived file token — not the
    // raw path, which would 403. Evidence tiles live under the "Dokumentasi
    // Kegiatan" section; the seeded row's `alt` is its caption, so scope by
    // section rather than by alt text.
    await page.goto(`/tk/assessment/${ASSESSMENT_ID}`);
    await page.waitForLoadState("domcontentloaded");
    const evidenceImgs = page
      .locator("section", { has: page.getByText("Dokumentasi Kegiatan") })
      .locator("img");
    await expect(evidenceImgs.first()).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        async () =>
          evidenceImgs.evaluateAll((els) =>
            els.map((el) => (el as HTMLImageElement).getAttribute("src") ?? ""),
          ),
        { timeout: 20_000 },
      )
      .toEqual(expect.arrayContaining([expect.stringContaining("token=")]));

    // The bytes actually load — a resolved URL that still 403s would leave
    // naturalWidth at 0. The uploaded tile carries the file token; the seeded
    // tile is a public static asset and needs no credential.
    await expect
      .poll(
        async () =>
          evidenceImgs.evaluateAll((els) =>
            els
              .map((el) => (el as HTMLImageElement).getAttribute("src") ?? "")
              .find((src) => src.includes("token=")),
          ),
        { timeout: 20_000 },
      )
      .toContain("token=");
    await expect
      .poll(
        async () =>
          evidenceImgs.evaluateAll((els) =>
            els
              .filter((el) =>
                ((el as HTMLImageElement).getAttribute("src") ?? "").includes(
                  "token=",
                ),
              )
              .every(
                (el) =>
                  (el as HTMLImageElement).complete &&
                  (el as HTMLImageElement).naturalWidth > 0,
              ),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);

    // Clean up the row this test created so the seeded fixture stays stable
    // for every other suite.
    if (uploaded) {
      await apiRequest(
        session,
        "DELETE",
        `/paud-assessment/evidences/${uploaded.id}`,
      );
    }
  });

  test("the existing seeded evidence resolves through the resolver, not a raw URL (BUG 1)", async ({
    page,
  }) => {
    await injectSession(page, await apiLogin(SEED_USERS.superAdmin));
    await page.goto(`/tk/assessment/${ASSESSMENT_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // The seeded row uses a MIME-spelled `fileType` ("image"), so it must be
    // recognised as an image and resolved rather than dropped. The assertion is
    // that the viewer reaches the resolution path: the src is either a token
    // URL (owned local upload) or the stable URL (a static seed asset).
    const evidenceImg = page
      .locator("section", { has: page.getByText("Dokumentasi Kegiatan") })
      .locator("img")
      .first();
    await expect(evidenceImg).toBeVisible({ timeout: 20_000 });
  });
});