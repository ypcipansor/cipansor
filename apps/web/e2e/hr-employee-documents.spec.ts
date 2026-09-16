import { test, expect } from "@playwright/test";
import {
  loginAs,
  apiLogin,
  apiRequest,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

/**
 * Employee documents — the HR flow that had the cross-unit destruction bug
 * (BUG 1) and the orphaned-blob gap (BUG 4). These specs drive the real
 * upload → persist → list → delete path against the seeded stack, and assert
 * the API refuses a document belonging to someone outside the caller's unit.
 *
 * The employee directory endpoints (`GET /hr/employees[/:id]`) are exercised
 * first: the detail page that hosts the documents tab loads the employee
 * through them, so a broken directory means a blank tab.
 */

function pdfBuffer(text: string) {
  return Buffer.from(
    `%PDF-1.4\n% ${text}\n1 0 obj<</Type/Catalog>>endobj\n%%EOF`,
    "utf8",
  );
}

async function uploadPdf(session: AuthSession, label: string) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([pdfBuffer(label)], { type: "application/pdf" }),
    "dokumen.pdf",
  );
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

test.describe("HR employee directory + documents", () => {
  let session: AuthSession;

  test.beforeEach(async ({ page }) => {
    session = await loginAs(page, "superAdmin");
  });

  test("employee directory loads teachers and staff with the DTO the page renders", async () => {
    const list = await apiRequest<{
      success: boolean;
      data: Array<Record<string, unknown>>;
      meta: { total: number; page: number; limit: number; totalPages: number };
    }>(session, "GET", "/hr/employees?limit=50");

    expect(list.success).toBe(true);
    expect(Array.isArray(list.data)).toBe(true);
    expect(list.data.length).toBeGreaterThan(0);
    expect(list.meta.total).toBeGreaterThan(0);

    const first = list.data[0];
    // The fields the list page actually reads (name/email/NIP/role/unit/status).
    expect(typeof first.id).toBe("string");
    expect(typeof first.fullName).toBe("string");
    expect(typeof first.email).toBe("string");
    expect(["TEACHER", "STAFF"]).toContain(first.role);
    expect(["ACTIVE", "INACTIVE"]).toContain(first.status);
    expect(first.unit).toBeTruthy();
  });

  test("employee detail renders its own shell and the documents tab", async ({
    page,
  }) => {
    const list = await apiRequest<{
      data: Array<{ id: string; fullName: string }>;
    }>(session, "GET", "/hr/employees?limit=1");
    const employee = list.data[0];
    if (!employee) throw new Error("seeded stack has no employees");

    await page.goto(`/hr/employees/${employee.id}`);
    await expect(
      page.getByRole("heading", { name: employee.fullName }),
    ).toBeVisible({ timeout: 10000 });

    // The documents tab is the surface BUG 1 touched; opening it must not crash
    // and must render its upload affordance and empty state.
    await page.getByRole("tab", { name: /Dokumen/i }).click();
    await expect(
      page.getByRole("button", { name: /Upload Dokumen/i }),
    ).toBeVisible();
  });

  test("upload → persist → list → delete a document (real stack)", async ({
    page,
  }) => {
    const list = await apiRequest<{ data: Array<{ id: string; userId: string }> }>(
      session,
      "GET",
      "/hr/employees?limit=1",
    );
    const employee = list.data[0];
    if (!employee) throw new Error("seeded stack has no employees");

    const fileUrl = await uploadPdf(session, "e2e employee document");

    const created = await apiRequest<{
      success: boolean;
      data: { id: string; name: string; fileUrl: string; type: string };
    }>(session, "POST", "/hr/documents", {
      userId: employee.userId,
      name: "E2E Ijazah",
      type: "IJAZAH",
      fileUrl,
    });
    expect(created.success).toBe(true);
    expect(created.data.fileUrl).toBe(fileUrl);

    // The record is listed for the employee it belongs to.
    const documents = await apiRequest<{
      success: boolean;
      data: Array<{ id: string; name: string }>;
    }>(session, "GET", `/hr/employees/${employee.userId}/documents`);
    expect(documents.data.some((d) => d.id === created.data.id)).toBe(true);

    // Deleting the record succeeds (DB row first, blob cleanup best-effort).
    await apiRequest(session, "DELETE", `/hr/documents/${created.data.id}`);

    const after = await apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      `/hr/employees/${employee.userId}/documents`,
    );
    expect(after.data.some((d) => d.id === created.data.id)).toBe(false);
  });

  test("a unit admin cannot delete another unit's employee document (BUG 1)", async () => {
    // Pick an employee outside adminSdit's own unit and have the super admin
    // plant a document on them, then prove the unit admin is refused. The
    // admin session is fetched via the API only — injecting it into this page
    // would replace the super-admin session the super-admin DELETE calls use.
    const admin = await apiLogin(SEED_USERS.adminSdit);
    const adminUnitId = admin.user.unitId as string | undefined;

    const list = await apiRequest<{
      data: Array<{ userId: string; unitId: string }>;
    }>(session, "GET", "/hr/employees?limit=100");
    const foreign = list.data.find((e) => e.unitId !== adminUnitId);
    if (!foreign) {
      test.skip(true, "seeded directory has no employee in another unit");
      return;
    }

    const fileUrl = await uploadPdf(session, "cross-unit document");
    const created = await apiRequest<{ data: { id: string } }>(
      session,
      "POST",
      "/hr/documents",
      {
        userId: foreign.userId,
        name: "E2E Cross Unit",
        type: "LAINNYA",
        fileUrl,
      },
    );

    // The unit admin's DELETE must be refused (403), and the row must survive.
    const res = await fetch(
      `${API_URL}/hr/documents/${created.data.id}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${admin.accessToken}` },
      },
    );
    expect(res.status).toBe(403);

    const stillThere = await apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      `/hr/employees/${foreign.userId}/documents`,
    );
    expect(stillThere.data.some((d) => d.id === created.data.id)).toBe(true);

    // Clean up with the privileged session so the fixture does not linger.
    await apiRequest(session, "DELETE", `/hr/documents/${created.data.id}`);
  });
});
