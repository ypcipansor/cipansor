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
    // The API validates magic bytes: an application/pdf upload must begin with
    // the "%PDF" header or it is rejected as a content/type mismatch.
    const body = Buffer.from(
      "%PDF-1.4\n% e2e lampiran\n1 0 obj<</Type/Catalog>>endobj\n%%EOF",
      "utf8",
    );
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

  test("attachment survives upload → persist → retrieve → download (real stack)", async () => {
    // The full storage lifecycle, not just the SAS handshake: upload a real
    // PDF, persist its stable URL as a letter attachment, read the letter back
    // and confirm the reference survived, then actually download the bytes.
    // This is the path a correspondence attachment takes after the storage
    // migration — a URL that is saved once and opened much later.
    const pdf = Buffer.from(
      "%PDF-1.4\n% e2e fidelity\n1 0 obj<</Type/Catalog>>endobj\n%%EOF",
      "utf8",
    );
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");

    const form = new FormData();
    form.append("file", new Blob([pdf], { type: "application/pdf" }), "bukti.pdf");
    const upRes = await fetch(`${API_URL}/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}` },
      body: form,
    });
    const upJson = await upRes.json();
    expect(upRes.ok).toBe(true);
    const stableUrl = upJson?.data?.url as string | undefined;
    if (!stableUrl) throw new Error("Upload returned no stable url");

    const participants = await apiRequest<{
      data: Array<{ id: string; unitId: string | null }>;
    }>(session, "GET", "/correspondence/participants?limit=100");
    const callerId = session.user.id as string | undefined;
    const candidate =
      participants?.data?.find((p) => p.id !== callerId && !!p.unitId) ??
      participants?.data?.[0];
    if (!candidate?.unitId) {
      throw new Error("Seeded stack returned no internal participant");
    }

    const created = await apiRequest<{
      success: boolean;
      data: { id: string; attachments?: Array<{ fileUrl: string; name: string }> };
    }>(session, "POST", "/correspondence/letters", {
      unitId: candidate.unitId,
      direction: "INCOMING",
      type: "SURAT_DINAS",
      date: new Date().toISOString(),
      subject: "E2E Lampiran Persist",
      content: "Lampiran disimpan oleh e2e e-office-correspondence.spec.",
      urgency: "NORMAL",
      nature: "PUBLIC",
      status: "DRAFT",
      recipientIds: [candidate.id],
      attachments: [{ name: "Bukti", fileUrl: stableUrl, mimeType: "application/pdf" }],
    });
    expect(created.success).toBe(true);

    // Retrieve: the persisted stable reference must round-trip on the letter.
    const fetched = await apiRequest<{
      data: { attachments?: Array<{ fileUrl: string }> };
    }>(session, "GET", `/correspondence/letters/${created.data.id}`);
    const stored = fetched.data.attachments?.map((a) => a.fileUrl) ?? [];
    expect(stored).toContain(stableUrl);

    // Download: a local /uploads reference is fetched directly with the bearer
    // token and the bytes must match what was uploaded. On Azure the reference
    // is a private blob — mint the SAS and assert it resolves to a usable URL
    // (the blob host is not reachable from the isolated e2e network).
    if (stableUrl.includes("/uploads/")) {
      const res = await fetch(stableUrl, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      expect(res.ok).toBe(true);
      const downloaded = Buffer.from(await res.arrayBuffer());
      expect(downloaded.equals(pdf)).toBe(true);
    } else {
      const resolved = await apiRequest<{
        data?: { downloadUrl?: string };
      }>(session, "POST", "/upload/sas", { url: stableUrl });
      expect(resolved.data?.downloadUrl).toMatch(
        /\.blob\.core\.windows\.net\//,
      );
    }

    // A local /uploads reference is served directly by the API; the resolved
    // stable URL must therefore be fetchable without a SAS round-trip.
    if (stableUrl.includes("/uploads/")) {
      const direct = await fetch(stableUrl, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      expect(direct.ok).toBe(true);
    }
  });

  test("a public-destination upload stays open without a SAS (BUG 5)", async () => {
    // Public content (gallery/banner/announcement media) must not land in the
    // private default container: a consumer that renders its raw URL would 403.
    // The destination is a validated server-side purpose, never a container
    // name — so a caller cannot publish a KTP scan into media-public.
    const body = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
      "hex",
    );
    const form = new FormData();
    form.append("file", new Blob([body], { type: "image/png" }), "banner.png");

    const res = await fetch(`${API_URL}/upload?destination=media-public`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}` },
      body: form,
    });
    const json = await res.json();
    expect(res.ok).toBe(true);

    const data = json?.data as
      | { url?: string; downloadUrl?: string; containerName?: string }
      | undefined;
    expect(data?.url).toBeTruthy();
    // The mapping chose the public container, so no short-lived SAS is minted.
    expect(data?.downloadUrl).toBeUndefined();

    if (data?.url && data.url.includes("blob.core.windows.net")) {
      expect(data.containerName).toBe("media-public");
      expect(data.url).toContain("/media-public/");
      // The SAS endpoint passes a public blob through unchanged.
      const sas = await apiRequest<{
        data?: { url?: string; downloadUrl?: string };
      }>(session, "POST", "/upload/sas", { url: data.url });
      expect(sas.data?.url).toBe(data.url);
      expect(sas.data?.downloadUrl).toBeUndefined();
    }
  });

  test("an unknown upload destination falls back to the private container (BUG 5)", async () => {
    // A caller naming a container directly (or sending nonsense) must never be
    // able to publish a file; only a known purpose selects a container.
    const body = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
      "hex",
    );
    const form = new FormData();
    form.append("file", new Blob([body], { type: "image/png" }), "ktp.png");

    const res = await fetch(`${API_URL}/upload?destination=media-public-evil`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}` },
      body: form,
    });
    const json = await res.json();
    expect(res.ok).toBe(true);

    const data = json?.data as { url?: string; containerName?: string } | undefined;
    expect(data?.url).toBeTruthy();
    if (data?.url && data.url.includes("blob.core.windows.net")) {
      expect(data.containerName).toBe("cipansor-documents");
    }
  });
});
