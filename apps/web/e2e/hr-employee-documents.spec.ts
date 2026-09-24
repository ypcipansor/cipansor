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

/** POST /upload/discard, returning the status so a refusal can be asserted. */
async function discardUpload(session: AuthSession, url: string) {
  const res = await fetch(`${API_URL}/upload/discard`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ url }),
  });
  return { status: res.status, body: await res.text() };
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
    const list = await apiRequest<{
      data: Array<{ id: string; userId: string }>;
    }>(session, "GET", "/hr/employees?limit=1");
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

  test("a discard never removes a blob a record references (real stack)", async () => {
    // The race's observable contract: once a record points at the blob, the
    // discard endpoint must not destroy it and the document must survive. The
    // discard now REFUSES with a 409 (a referenced blob is not an orphan), for
    // the local and Azure providers alike — the old spec expected a silent 200
    // from the pre-hardening local no-op.
    const list = await apiRequest<{
      data: Array<{ id: string; userId: string }>;
    }>(session, "GET", "/hr/employees?limit=1");
    const employee = list.data[0];
    if (!employee) throw new Error("seeded stack has no employees");

    const fileUrl = await uploadPdf(session, "e2e race");

    const created = await apiRequest<{ data: { id: string } }>(
      session,
      "POST",
      "/hr/documents",
      { userId: employee.userId, name: "E2E Race", type: "IJAZAH", fileUrl },
    );

    const discard = await discardUpload(session, fileUrl);
    expect(discard.status).toBe(409);

    // The document still resolves: the discard did not remove a live record.
    const documents = await apiRequest<{
      data: Array<{ id: string; fileUrl: string }>;
    }>(session, "GET", `/hr/employees/${employee.userId}/documents`);
    expect(documents.data.some((d) => d.id === created.data.id)).toBe(true);
  });

  test("discards an upload whose record create failed (no record references it)", async () => {
    // The normal discard path: a create that definitively failed leaves an
    // orphan, and the discard is accepted for the local provider too.
    const fileUrl = await uploadPdf(session, "e2e orphan");

    const discard = await discardUpload(session, fileUrl);
    expect(discard.status).toBe(200);

    // Idempotent: a second discard of the same orphan must not error either.
    const again = await discardUpload(session, fileUrl);
    expect(again.status).toBe(200);
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
    const res = await fetch(`${API_URL}/hr/documents/${created.data.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
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

/**
 * The access-control half of the employee directory (BUG 1, BUG 5): what a
 * plain teacher may see and reach. Every assertion drives the real endpoint —
 * the service scopes the query, the response is what the page receives.
 */
test.describe("HR employee directory access control", () => {
  // A privileged session for building the cross-unit fixtures; the assertions
  // themselves use the plain teacher's own session.
  let session: AuthSession;

  test.beforeEach(async ({ page }) => {
    session = await loginAs(page, "superAdmin");
  });

  test("a plain teacher's directory never leaks NIK or bank details (BUG 1)", async () => {
    const teacher = await apiLogin(SEED_USERS.teacher);

    const list = await apiRequest<{
      success: boolean;
      data: Array<Record<string, unknown>>;
    }>(teacher, "GET", "/hr/employees?limit=100");

    expect(list.success).toBe(true);
    expect(list.data.length).toBeGreaterThan(0);
    for (const row of list.data) {
      // Own record may carry them; every colleague's must not.
      if (row.id === teacher.user.id) continue;
      expect(row.nik).toBeUndefined();
      expect(row.bankName).toBeUndefined();
      expect(row.bankAccountNumber).toBeUndefined();
      expect(row.bankAccountName).toBeUndefined();
    }
  });

  test("a plain teacher is pinned to their own unit in the directory (BUG 1)", async () => {
    const teacher = await apiLogin(SEED_USERS.teacher);
    const teacherUnitId = teacher.user.unitId as string;

    const list = await apiRequest<{
      data: Array<{ unitId: string | null }>;
    }>(
      teacher,
      "GET",
      "/hr/employees?limit=100&unitId=00000000-0000-0000-0000-000000000000",
    );

    expect(list.data.length).toBeGreaterThan(0);
    // The spoofed query unitId is ignored; every row stays in the actor's unit.
    for (const row of list.data) {
      expect(row.unitId).toBe(teacherUnitId);
    }
  });

  test("a unit admin is pinned to their own unit and cannot read a foreign roster (BUG 3)", async () => {
    // A unit admin's token covers one unit. The old branch trusted the client's
    // `unitId` for anyone with `mayAdministerEmployeeDocuments`, so SDIT_ADMIN
    // could request another unit's id and read its whole roster.
    const unitAdmin = await apiLogin(SEED_USERS.adminSdit);
    const ownUnitId = unitAdmin.user.unitId as string;

    const roster = await apiRequest<{
      data: Array<{ id: string; unitId: string | null }>;
    }>(session, "GET", "/hr/employees?limit=100");
    const foreignUnitId = roster.data
      .map((e) => e.unitId)
      .find((u): u is string => !!u && u !== ownUnitId);
    if (!foreignUnitId) {
      test.skip(true, "seeded directory has no employee in another unit");
      return;
    }

    const pinned = await apiRequest<{
      data: Array<{ unitId: string | null }>;
    }>(unitAdmin, "GET", `/hr/employees?limit=100&unitId=${foreignUnitId}`);

    // The spoofed query unitId is ignored: every row stays in the admin's unit.
    expect(pinned.data.length).toBeGreaterThan(0);
    for (const row of pinned.data) {
      expect(row.unitId).toBe(ownUnitId);
    }
  });

  test("a foundation role may still choose any unit (BUG 3)", async () => {
    const roster = await apiRequest<{
      data: Array<{ unitId: string | null }>;
    }>(session, "GET", "/hr/employees?limit=100");
    const unitId = roster.data.find((e) => !!e.unitId)?.unitId;
    if (!unitId) {
      test.skip(true, "seeded directory is empty");
      return;
    }

    const chosen = await apiRequest<{
      data: Array<{ unitId: string | null }>;
    }>(session, "GET", `/hr/employees?limit=100&unitId=${unitId}`);

    // A `seesAllUnits` caller's explicit unitId is honored verbatim.
    expect(chosen.data.length).toBeGreaterThan(0);
    for (const row of chosen.data) {
      expect(row.unitId).toBe(unitId);
    }
  });

  test("a plain teacher cannot read an employee in another unit (BUG 1)", async () => {
    const teacher = await apiLogin(SEED_USERS.teacher);
    const teacherUnitId = teacher.user.unitId as string;

    const roster = await apiRequest<{
      data: Array<{ id: string; unitId: string | null }>;
    }>(session, "GET", "/hr/employees?limit=100");
    const foreign = roster.data.find((e) => e.unitId !== teacherUnitId);
    if (!foreign) {
      test.skip(true, "seeded directory has no employee in another unit");
      return;
    }

    const res = await fetch(`${API_URL}/hr/employees/${foreign.id}`, {
      headers: { authorization: `Bearer ${teacher.accessToken}` },
    });
    expect(res.status).toBe(404);
  });

  test("a plain teacher cannot list another unit's employee documents (BUG 5)", async () => {
    const teacher = await apiLogin(SEED_USERS.teacher);
    const teacherUnitId = teacher.user.unitId as string;

    const roster = await apiRequest<{
      data: Array<{ userId: string; unitId: string | null }>;
    }>(session, "GET", "/hr/employees?limit=100");
    const foreign = roster.data.find((e) => e.unitId !== teacherUnitId);
    if (!foreign) {
      test.skip(true, "seeded directory has no employee in another unit");
      return;
    }

    const res = await fetch(
      `${API_URL}/hr/employees/${foreign.userId}/documents`,
      { headers: { authorization: `Bearer ${teacher.accessToken}` } },
    );
    expect(res.status).toBe(403);
  });

  test("a plain teacher can list their own employee documents (BUG 5)", async () => {
    const teacher = await apiLogin(SEED_USERS.teacher);

    const documents = await apiRequest<{
      success: boolean;
      data: Array<{ id: string }>;
    }>(teacher, "GET", `/hr/employees/${teacher.user.id}/documents`);

    expect(documents.success).toBe(true);
    expect(Array.isArray(documents.data)).toBe(true);
  });

  test("the directory's TEACHER and STAFF labels come from live RoleCodes (BUG 6)", async () => {
    const list = await apiRequest<{
      data: Array<{ role: string }>;
    }>(session, "GET", "/hr/employees?limit=100");

    expect(list.data.length).toBeGreaterThan(0);
    // Every row still resolves to a TEACHER/STAFF label — roleCode-derived,
    // never the deprecated User.role column.
    for (const row of list.data) {
      expect(["TEACHER", "STAFF"]).toContain(row.role);
    }

    const teachers = await apiRequest<{ data: Array<{ role: string }> }>(
      session,
      "GET",
      "/hr/employees?limit=100&role=TEACHER",
    );
    for (const row of teachers.data) {
      expect(row.role).toBe("TEACHER");
    }
  });
});
