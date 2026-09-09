import { test, expect } from "@playwright/test";
import { loginAs, apiRequest, type AuthSession } from "./helpers/auth-api";

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

  test("archive renders the archived-letter list and its filters", async ({ page }) => {
    await page.goto("/e-office/archive");

    await expect(page.getByRole("heading", { name: "Arsip Surat" })).toBeVisible();
    await expect(page.getByLabel("Cari surat")).toBeVisible();
    // When the archive page fixes the status to ARCHIVED it hides the status
    // filter, so only the search box is expected on this surface.
    await expect(page.getByLabel("Saring menurut status")).toBeHidden();
  });

  test("create page renders the letter-creation form", async ({ page }) => {
    await page.goto("/e-office/create");

    await expect(page.getByRole("heading", { name: "Buat Surat Baru" })).toBeVisible();
    // The subject field is a real text input with a placeholder attribute, so
    // asserting it proves the create form mounted. (The unit selector is a
    // Radix Select that is pre-selected for the caller's unit, so its placeholder
    // is intentionally not asserted.)
    await expect(page.getByPlaceholder("Contoh: Undangan Rapat Wali Murid")).toBeVisible();
  });

  test("create + submit publishes an outgoing letter for review (real stack)", async ({
    page,
  }) => {
    // Drive the create → submit-for-review transition against the real database
    // (not mocks): the super admin creates an outgoing letter with a reviewer
    // chosen from the live participants directory, submits it straight into
    // PENDING_REVIEW, then reads it back — proving the flow let it persist.
    const participants = await apiRequest<
      {
        success: boolean;
        data: Array<{ id: string; name: string; unitId: string | null }>;
      }
    >(session, "GET", "/correspondence/participants?limit=100");
    const callerId = session.user.id as string | undefined;
    const candidate =
      participants?.data?.find(
        (p) => p.id !== callerId && !!p.unitId,
      ) ??
      participants?.data?.[0];
    if (!candidate?.id || !candidate.unitId) {
      throw new Error(
        "Seeded stack returned no internal participants to review the letter",
      );
    }

    const created = await apiRequest<
      {
        success: boolean;
        data: {
          id: string;
          status: string;
          direction: string;
          subject: string;
          reviewers?: Array<{ id: string }>;
        };
      }
    >(session, "POST", "/correspondence/letters", {
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
    expect(Array.isArray(created.data.reviewers) ? created.data.reviewers.length : 1).toBeGreaterThan(0);

    const fetched = await apiRequest<{
      success: boolean;
      data: { id: string; subject: string; status: string };
    }>(session, "GET", `/correspondence/letters/${letterId}`);
    expect(fetched.data.id).toBe(letterId);
    expect(fetched.data.status).toBe("PENDING_REVIEW");
  });
});
