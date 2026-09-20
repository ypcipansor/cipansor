import { test, expect } from "@playwright/test";
import { loginAs, apiRequest, type AuthSession } from "./helpers/auth-api";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

/**
 * Daily-report detail page + the photo lifecycle.
 *
 * `apps/web/src/app/daily-report/[id]/page.tsx` switched from the Next 15
 * `params` prop to the React 19 `useParams()` hook in this PR. These specs
 * exercise that page for real, and drive the create → add photo → remove photo
 * → delete path whose service gained blob-cleanup (BUG 4).
 */

/** A 1×1 PNG so the upload middleware's magic-byte check accepts it. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function uploadPng(session: AuthSession, name: string) {
  const form = new FormData();
  form.append("file", new Blob([PNG_BYTES], { type: "image/png" }), name);
  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok || !json?.data?.url) {
    throw new Error(`upload failed: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data.url as string;
}

test.describe("Daily report detail", () => {
  let session: AuthSession;

  test.beforeEach(async ({ page }) => {
    session = await loginAs(page, "superAdmin");
  });

  test("renders the detail of a seeded report, including its photo", async ({
    page,
  }) => {
    const list = await apiRequest<{
      data: Array<{ id: string; student: { user: { name: string } } }>;
    }>(session, "GET", "/daily-report?limit=1");
    const report = list.data[0];
    if (!report) {
      test.skip(true, "no seeded daily report");
      return;
    }

    await page.goto(`/daily-report/${report.id}`);

    await expect(
      page.getByRole("heading", { name: /Detail Laporan Harian/i }),
    ).toBeVisible({ timeout: 10000 });
    // The student identity card is populated from the fetched record.
    await expect(
      page.getByText(report.student.user.name).first(),
    ).toBeVisible();
    // The page resolves persisted photo references through the SAS helper.
    await expect(page.locator("img").first()).toBeVisible();

    // Edit navigates to the nested route (the useParams-derived id must be
    // correct or this lands on a 404).
    await page.getByRole("button", { name: /^Edit$/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/daily-report/${report.id}/edit`),
    );
  });

  test("the tk detail viewer resolves a private report photo instead of using the raw URL (finding 14)", async ({
    page,
  }) => {
    // `/tk/daily-reports/[id]` renders `photo.photoUrl` directly before the
    // fix, so once uploads land in the private container the tile 403s. It must
    // go through the same resolver as every other private viewer.
    const template = await apiRequest<{
      data: Array<{ studentId: string; unitId: string; academicYearId: string }>;
    }>(session, "GET", "/daily-report?limit=1");
    const base = template.data[0];
    if (!base) {
      test.skip(true, "no seeded daily report to derive student/unit/year");
      return;
    }

    const photoUrl = await uploadPng(session, "e2e-tk-photo.png");

    const existing = await apiRequest<{ data: Array<{ reportDate: string }> }>(
      session,
      "GET",
      `/daily-report?studentId=${base.studentId}&limit=100`,
    );
    const taken = new Set(existing.data.map((r) => r.reportDate.slice(0, 10)));
    let reportDate = "";
    for (let offset = 900; offset < 1400; offset += 1) {
      const candidate = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      if (!taken.has(candidate)) {
        reportDate = candidate;
        break;
      }
    }
    expect(reportDate).not.toBe("");

    const created = await apiRequest<{ data: { id: string } }>(
      session,
      "POST",
      "/daily-report",
      {
        studentId: base.studentId,
        unitId: base.unitId,
        academicYearId: base.academicYearId,
        reportDate: `${reportDate}T00:00:00.000Z`,
        activitiesSummary: "E2E tk photo resolution",
        photoUrls: [photoUrl],
      },
    );

    try {
      await page.goto(`/tk/daily-reports/${created.data.id}`);
      await page.waitForLoadState("domcontentloaded");

      // The reporter photo must be resolved through `/upload/sas` into a
      // token-bearing URL, never the raw persisted path...
      const resolvedPhoto = page.locator('img[src*="token="]').first();
      await expect(resolvedPhoto).toBeVisible({ timeout: 20_000 });
      // ...and the bytes must actually load (a resolved-but-still-403 URL would
      // leave naturalWidth at 0).
      await expect
        .poll(
          async () =>
            resolvedPhoto.evaluate(
              (el) =>
                (el as HTMLImageElement).complete &&
                (el as HTMLImageElement).naturalWidth > 0,
            ),
          { timeout: 20_000 },
        )
        .toBe(true);
    } finally {
      await apiRequest(session, "DELETE", `/daily-report/${created.data.id}`);
    }
  });

  test("create → attach photo → remove photo → delete (real stack)", async () => {
    const template = await apiRequest<{
      data: Array<{ studentId: string; unitId: string; academicYearId: string }>;
    }>(session, "GET", "/daily-report?limit=1");
    const base = template.data[0];
    if (!base) {
      test.skip(true, "no seeded daily report to derive student/unit/year");
      return;
    }

    const photoUrl = await uploadPng(session, "e2e-daily-report.png");

    // A report is unique per (student, date). Re-runs and retries leave future
    // fixtures behind, so walk forward from a far-future base until a date the
    // student does not already have a report for.
    const existing = await apiRequest<{ data: Array<{ reportDate: string }> }>(
      session,
      "GET",
      `/daily-report?studentId=${base.studentId}&limit=100`,
    );
    const taken = new Set(
      existing.data.map((r) => r.reportDate.slice(0, 10)),
    );
    let reportDate = "";
    for (let offset = 400; offset < 900; offset += 1) {
      const candidate = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      if (!taken.has(candidate)) {
        reportDate = candidate;
        break;
      }
    }
    expect(reportDate).not.toBe("");

    const created = await apiRequest<{
      success: boolean;
      data: { id: string; photos: Array<{ photoUrl: string }> };
    }>(session, "POST", "/daily-report", {
      studentId: base.studentId,
      unitId: base.unitId,
      academicYearId: base.academicYearId,
      reportDate: `${reportDate}T00:00:00.000Z`,
      activitiesSummary: "E2E daily report",
      photoUrls: [photoUrl],
    });
    expect(created.success).toBe(true);
    expect(created.data.photos.map((p) => p.photoUrl)).toContain(photoUrl);

    // Removing the photo deletes the row; the service reclaims the blob
    // best-effort after the write (BUG 4). The PUT response carries the report
    // as it was read before the photo rows were rewritten, so re-read to assert
    // the persisted state.
    await apiRequest(session, "PUT", `/daily-report/${created.data.id}`, {
      photoUrls: [],
    });
    const reloaded = await apiRequest<{
      data: { photos: Array<{ photoUrl: string }> };
    }>(session, "GET", `/daily-report/${created.data.id}`);
    expect(reloaded.data.photos).toHaveLength(0);

    await apiRequest(session, "DELETE", `/daily-report/${created.data.id}`);
    const listAfter = await apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      "/daily-report?limit=100",
    );
    expect(listAfter.data.some((r) => r.id === created.data.id)).toBe(false);
  });
});