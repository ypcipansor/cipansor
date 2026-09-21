import { test, expect } from "@playwright/test";
import {
  loginAs,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

/**
 * Upload destination + discard authorization (BUG 1 and BUG 2).
 *
 * BUG 1: `POST /upload?destination=media-public` selects a WORLD-READABLE
 * container (`access: 'blob'`, served with no SAS). Before the fix any
 * authenticated user — a teacher, a parent — could choose it and publish an
 * arbitrary file to the open internet. The container is now chosen from the
 * caller's role, so a non-publisher is downgraded to the private container.
 *
 * BUG 2: `POST /upload/discard` deleted any orphan blob whose URL was known,
 * including an upload by someone else whose record was still committing. The
 * discard is now bound to the uploader recorded on the blob.
 *
 * Both behaviours are enforced server-side and are environment-independent in
 * the *refusal* direction, which is what these specs assert. On a local stack
 * with no Azure connection string, `/upload` falls back to a local `/uploads`
 * path, so the response carries no `containerName`; the specs then assert the
 * local contract (`/media-public/` never appears, discard is a documented
 * no-op) rather than skipping. The Azure delete/re-probe internals live in the
 * API unit tests, which CI runs without an Azure account.
 */

function pngBuffer() {
  // 1x1 PNG; the upload middleware sniffs real magic bytes, so a text stub
  // would be rejected before the destination logic is reached.
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  return Buffer.from(base64, "base64");
}

interface UploadResult {
  url: string;
  containerName?: string | null;
  blobName?: string | null;
}

/** POST /upload with an optional `destination`, returning the parsed payload. */
async function upload(
  session: AuthSession,
  destination?: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([pngBuffer()], { type: "image/png" }),
    "media.png",
  );
  const query = destination
    ? `?destination=${encodeURIComponent(destination)}`
    : "";
  const res = await fetch(`${API_URL}/upload${query}`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok || !json?.data?.url) {
    throw new Error(`upload failed: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data as UploadResult;
}

/** POST /upload/discard, returning the status so a refusal can be asserted. */
async function discard(session: AuthSession, url: string) {
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

test.describe("upload blob authorization (BUG 1 / BUG 2)", () => {
  test("a teacher asking for media-public never gets a public-container URL (BUG 1)", async ({
    page,
  }) => {
    const session = await loginAs(page, "teacher");

    const result = await upload(session, "media-public");

    // The core property, true with or without Azure: the world-readable
    // container is never selected for a role without publish authority.
    expect(result.url).not.toContain("/media-public/");
    if (result.containerName) {
      expect(result.containerName).toBe("cipansor-documents");
    }
  });

  test("an admin asking for media-public is honoured (BUG 1)", async ({
    page,
  }) => {
    const session = await loginAs(page, "superAdmin");

    const result = await upload(session, "media-public");

    // One build serves the local and Azure stacks; the container the caller
    // asked for survives the role check, which the local stack cannot show.
    if (result.containerName) {
      expect(result.containerName).toBe("media-public");
      expect(result.url).toContain("/media-public/");
    } else {
      // Local fallback: the request still succeeds and is served from disk.
      expect(result.url).toContain("/uploads/");
    }
  });

  test("an upload with no destination stays private", async ({ page }) => {
    const session = await loginAs(page, "teacher");

    const result = await upload(session);

    expect(result.url).not.toContain("/media-public/");
    if (result.containerName) {
      expect(result.containerName).toBe("cipansor-documents");
    }
  });

  test("a different user cannot discard someone else's orphan blob (BUG 2)", async ({
    page,
  }) => {
    // The uploader is the teacher; the parent is a second, unprivileged actor.
    const uploader = await loginAs(page, "teacher");
    const other = await loginAs(page, "parent");

    const result = await upload(uploader);

    // The local provider now gives the SAME ownership guarantee as Azure
    // (BUG 9): the uploader sidecar is read live, so a second actor is refused
    // on `/uploads` too — not just on a blob. The old spec asserted a no-op
    // 200 here, which the hardened local path correctly turns into a 403.
    const refused = await discard(other, result.url);
    expect(refused.status).toBe(403);

    // The uploader themself is still allowed to clean up their orphan.
    const allowed = await discard(uploader, result.url);
    expect(allowed.status).toBe(200);
  });

  test("an unrelated role cannot discard an orphan it did not upload (BUG 2)", async ({
    page,
  }) => {
    const admin = await loginAs(page, "superAdmin");
    const teacher = await loginAs(page, "teacher");

    const result = await upload(admin);

    // A foundation/super-admin role may sweep, so the admin is permitted...
    const swept = await discard(admin, result.url);
    expect(swept.status).toBe(200);

    // ...but a teacher has no authority over another actor's blob.
    const second = await upload(admin);
    const refused = await discard(teacher, second.url);
    expect(refused.status).toBe(403);
  });
});

// Referenced so the seed table is exercised even if the role set changes.
test.describe("seed roles used by these specs exist", () => {
  test("the teacher and parent seeds are distinct actors", () => {
    expect(SEED_USERS.teacher.email).not.toBe(SEED_USERS.parent.email);
  });
});
