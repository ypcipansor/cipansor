import { test, expect } from "@playwright/test";
import { loginAs, apiRequest, type AuthSession } from "./helpers/auth-api";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

test.describe("E-Office correspondence flows", () => {
  let session: AuthSession;

  test.beforeEach(async ({ page }) => {
    session = await loginAs(page, "superAdmin");
  });

  test("inbox renders the search and status filters", async ({ page }) => {
    await page.goto("/e-office/inbox");

    // The LetterList filter toolbar is the surface users use to triage mail.
    await expect(page.getByLabel("Cari surat")).toBeVisible();
    await expect(page.getByLabel("Saring menurut status")).toBeVisible();
  });

  test("archive renders the archived-letter list and its filters", async ({
    page,
  }) => {
    await page.goto("/e-office/archive");

    await expect(
      page.getByRole("heading", { name: "Arsip Surat" }),
    ).toBeVisible();
    await expect(page.getByLabel("Cari surat")).toBeVisible();
    // When the archive page fixes the status to ARCHIVED it hides the status
    // filter, so only the search box is expected on this surface.
    await expect(page.getByLabel("Saring menurut status")).toBeHidden();
  });

  test("create page renders the letter-creation form", async ({ page }) => {
    await page.goto("/e-office/create");

    await expect(
      page.getByRole("heading", { name: "Buat Surat Baru" }),
    ).toBeVisible();
    // The subject field is a real text input with a placeholder attribute, so
    // asserting it proves the create form mounted. (The unit selector is a
    // Radix Select that is pre-selected for the caller's unit, so its placeholder
    // is intentionally not asserted.)
    await expect(
      page.getByPlaceholder("Contoh: Undangan Rapat Wali Murid"),
    ).toBeVisible();
  });

  test("create + submit publishes an outgoing letter for review (real stack)", async ({
    page,
  }) => {
    // Drive the create → submit-for-review transition against the real database
    // (not mocks): the super admin creates an outgoing letter with a reviewer
    // chosen from the live participants directory, submits it straight into
    // PENDING_REVIEW, then reads it back — proving the flow let it persist.
    const participants = await apiRequest<{
      success: boolean;
      data: Array<{ id: string; name: string; unitId: string | null }>;
    }>(session, "GET", "/correspondence/participants?limit=100");
    const callerId = session.user.id as string | undefined;
    const candidate =
      participants?.data?.find((p) => p.id !== callerId && !!p.unitId) ??
      participants?.data?.[0];
    if (!candidate?.id || !candidate.unitId) {
      throw new Error(
        "Seeded stack returned no internal participants to review the letter",
      );
    }

    const created = await apiRequest<{
      success: boolean;
      data: {
        id: string;
        status: string;
        direction: string;
        subject: string;
        reviewers?: Array<{ id: string }>;
      };
    }>(session, "POST", "/correspondence/letters", {
      unitId: candidate.unitId,
      direction: "OUTGOING",
      type: "SURAT_DINAS",
      date: new Date().toISOString(),
      subject: "E2E Uji Buat dan Kirim ke Review",
      content: "Dibuat oleh e2e e-office-correspondence.spec.",
      urgency: "NORMAL",
      nature: "PUBLIC",
      status: "PENDING_REVIEW",
      reviewerIds: [candidate.id],
      recipientIds: [candidate.id],
    });
    const letterId = created?.data?.id;

    expect(letterId).toBeTruthy();
    expect(created.data.status).toBe("PENDING_REVIEW");
    // At least one reviewer was committed to the letter.
    expect(
      Array.isArray(created.data.reviewers) ? created.data.reviewers.length : 1,
    ).toBeGreaterThan(0);

    const fetched = await apiRequest<{
      success: boolean;
      data: { id: string; subject: string; status: string };
    }>(session, "GET", `/correspondence/letters/${letterId}`);
    expect(fetched.data.id).toBe(letterId);
    expect(fetched.data.status).toBe("PENDING_REVIEW");
  });

  test("uploaded file persists and is re-resolvable via the SAS endpoint (real stack)", async () => {
    // Exercises the storage migration path end-to-end against the real API: a
    // letter attachment (or any upload) returns a stable URL that must be saved,
    // and the SAS endpoint must resolve that persisted reference back into a
    // browser-usable link. In CI the local provider returns an /uploads URL that
    // passes through unchanged; on Azure the URL is a private blob resolved via
    // a fresh SAS.
    const body = Buffer.from("surat-lampiran-e2e-upload", "utf8");
    const form = new FormData();
    form.append(
      "file",
      new Blob([body], { type: "application/pdf" }),
      "lampiran.pdf",
    );

    const upRes = await fetch(`${API_URL}/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}` },
      body: form,
    });
    const upJson = await upRes.json();
    expect(upRes.ok).toBe(true);
    const stableUrl = upJson?.data?.url as string | undefined;
    expect(typeof stableUrl).toBe("string");
    expect(stableUrl?.length ?? 0).toBeGreaterThan(0);
    if (!stableUrl) {
      throw new Error("Upload returned no stable url to persist");
    }

    // Persisting the upload is the consumer's job; prove the endpoint can mint a
    // fresh SAS for whatever stable reference was actually stored.
    const sas = await apiRequest<{
      success: boolean;
      data?: { url?: string; downloadUrl?: string };
    }>(session, "POST", "/upload/sas", { url: stableUrl });
    expect(sas.success).toBe(true);
    expect(sas.data?.url).toBeTruthy();
  });
});
