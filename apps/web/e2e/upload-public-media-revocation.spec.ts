import { test, expect } from "@playwright/test";
import { loginAs, apiRequest, type AuthSession } from "./helpers/auth-api";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

/**
 * Finding E — revoked publisher cannot keep writing to the public container.
 *
 * `POST /upload?destination=media-public` selects the WORLD-READABLE container
 * (`access: 'blob'`, served with no SAS). Before this fix the decision read
 * `req.user.roleCode` straight from the JWT — a snapshot that stays valid until
 * the token expires. A user whose publisher role was revoked (or whose
 * assignment expired) kept uploading public media until that token ran out.
 *
 * The destination resolver now re-reads the caller's CURRENT active primary
 * role from the database, so the observable contract is: the same, still-valid
 * token that could publish BEFORE revocation must stop selecting the public
 * container AFTER it. The tests below drive the real role API to revoke the
 * role, then re-use the unchanged token — exactly the attacker's position.
 */

function pngBuffer() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  return Buffer.from(base64, "base64");
}

interface UploadResult {
  url: string;
  containerName?: string | null;
}

/** POST /upload?destination=media-public with an already-minted bearer. */
async function uploadPublic(
  accessToken: string,
): Promise<{ status: number; data: UploadResult }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([pngBuffer()], { type: "image/png" }),
    "public.png",
  );
  const res = await fetch(`${API_URL}/upload?destination=media-public`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const json = await res.json();
  return { status: res.status, data: json?.data as UploadResult };
}

interface RoleAssignment {
  id: string;
  isPrimary: boolean;
  role: { id: string; code: string };
}

/**
 * A throwaway account whose primary role is a publisher (TATA_USAHA), created
 * by the super admin so the test owns the whole lifecycle and never mutates a
 * seed account another suite depends on.
 */
async function createPublisher(
  admin: AuthSession,
  label: string,
): Promise<{
  userId: string;
  email: string;
  password: string;
  assignmentId: string;
}> {
  const email = `e2e-revoke-${label}-${Date.now()}@cipansor.or.id`;
  const password = "RevokeE2e123!";

  const units = await apiRequest<{ data: Array<{ id: string; type: string }> }>(
    admin,
    "GET",
    "/units?limit=100",
  );
  const unit = units.data.find((u) => u.type === "SD_IT") ?? units.data[0];
  expect(unit, "a unit must be seeded for the publisher account").toBeTruthy();

  const created = await apiRequest<{ data: { id: string } }>(
    admin,
    "POST",
    "/users",
    {
      name: `E2E Revoke ${label}`,
      email,
      password,
      role: "TEACHER",
      unitId: unit.id,
    },
  );
  const userId = created.data.id;

  // TEACHER is not a publisher, so the upload below must be refused; a
  // TATA_USAHA assignment is what grants publish authority.
  const roles = await apiRequest<{ data: Array<{ id: string; code: string }> }>(
    admin,
    "GET",
    "/roles",
  );
  const role = roles.data.find((r) => r.code === "SDIT_TATA_USAHA");
  expect(role, "the SDIT_TATA_USAHA role must be seeded").toBeTruthy();

  const assignment = await apiRequest<{ data: RoleAssignment }>(
    admin,
    "POST",
    "/roles/assign",
    { userId, roleId: role!.id, unitId: unit.id, isPrimary: true },
  );

  return { userId, email, password, assignmentId: assignment.data.id };
}

/** Log in as the throwaway account, returning its session. */
async function loginThrowaway(
  email: string,
  password: string,
): Promise<AuthSession> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  // The account is a TATA_USAHA publisher, not an admin, so no 2FA gate.
  expect(json?.data?.accessToken, JSON.stringify(json)).toBeTruthy();
  return json.data as AuthSession;
}

test.describe("public-media live revocation (finding E)", () => {
  test("a revoked publisher's still-valid token can no longer reach the public container", async ({
    page,
  }) => {
    const admin = await loginAs(page, "superAdmin");
    const user = await createPublisher(admin, "revoke");
    const publisher = await loginThrowaway(user.email, user.password);

    // Sanity: while the assignment is live, the publisher IS allowed.
    const before = await uploadPublic(publisher.accessToken);
    expect(before.status).toBe(200);
    if (before.data.containerName) {
      expect(before.data.containerName).toBe("media-public");
    }

    // Revoke the publisher assignment; the bearer token is deliberately NOT
    // refreshed, so it still claims TATA_USAHA in its snapshot.
    await apiRequest(
      admin,
      "DELETE",
      `/roles/assignments/${user.assignmentId}`,
    );

    const after = await uploadPublic(publisher.accessToken);
    expect(after.status).toBe(200);
    // The ROLE SNAPSHOT still says publisher, but the live check downgraded it.
    if (after.data.containerName) {
      expect(after.data.containerName).toBe("cipansor-documents");
      expect(after.data.url).not.toContain("/media-public/");
    } else {
      expect(after.data.url).toContain("/uploads/");
    }

    // Cleanup: remove the throwaway account.
    await apiRequest(admin, "DELETE", `/users/${user.userId}`);
  });

  test("a disabled account's token cannot reach the public container", async ({
    page,
  }) => {
    const admin = await loginAs(page, "superAdmin");
    const user = await createPublisher(admin, "disable");
    const publisher = await loginThrowaway(user.email, user.password);

    const before = await uploadPublic(publisher.accessToken);
    expect(before.status).toBe(200);
    if (before.data.containerName) {
      expect(before.data.containerName).toBe("media-public");
    }

    const users = await apiRequest<{
      data: Array<{ id: string; email: string }>;
    }>(admin, "GET", `/users?search=${encodeURIComponent(user.email)}`);
    const row = users.data.find((u) => u.email === user.email);
    expect(row, "the throwaway account must be listable").toBeTruthy();
    await apiRequest(admin, "PUT", `/users/${row!.id}`, { isActive: false });

    const after = await uploadPublic(publisher.accessToken);
    expect(after.status).toBe(200);
    if (after.data.containerName) {
      expect(after.data.containerName).toBe("cipansor-documents");
      expect(after.data.url).not.toContain("/media-public/");
    }

    await apiRequest(admin, "DELETE", `/users/${user.userId}`);
  });

  test("a currently-active publisher keeps public-container access (positive control)", async ({
    page,
  }) => {
    const admin = await loginAs(page, "superAdmin");
    const user = await createPublisher(admin, "active");
    const publisher = await loginThrowaway(user.email, user.password);

    const result = await uploadPublic(publisher.accessToken);
    expect(result.status).toBe(200);
    if (result.data.containerName) {
      expect(result.data.containerName).toBe("media-public");
      expect(result.data.url).toContain("/media-public/");
    } else {
      // Local stack: the destination survives as a served /uploads path.
      expect(result.data.url).toContain("/uploads/");
    }

    await apiRequest(admin, "DELETE", `/users/${user.userId}`);
  });
});
