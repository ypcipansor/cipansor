import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  appendFileToken,
  displayableResolvedUrl,
  evidenceFileType,
  isImageEvidence,
  isLocalUploadUrl,
  isPrivateAzureBlob,
  needsResolvedAccess,
  resolveFileUrl,
  resolveFileWithExpiry,
} from "./files";

// Control the /upload/sas response from top level so vi.mock stays hoisted.
const apiMock = { post: vi.fn() };
vi.mock("@/lib/api", () => ({ default: apiMock }));

describe("appendFileToken", () => {
  it("appends the token and drops any token already in the URL", () => {
    expect(appendFileToken("https://host/uploads/a.pdf", "tok")).toBe(
      "https://host/uploads/a.pdf?token=tok",
    );
    // Refreshing must REPLACE the token, not chain a second one onto a URL that
    // already carries an (about to expire) one.
    expect(appendFileToken("https://host/uploads/a.pdf?token=old", "new")).toBe(
      "https://host/uploads/a.pdf?token=new",
    );
  });

  it("URL-encodes the token", () => {
    expect(appendFileToken("https://host/uploads/a.pdf", "a+b/c")).toBe(
      "https://host/uploads/a.pdf?token=a%2Bb%2Fc",
    );
  });

  it("never emits the session access token from storage (BUG 6)", () => {
    // The old authFileUrl read localStorage.accessToken and put it in the URL.
    // Nothing in the resolver may touch it now.
    localStorage.setItem("accessToken", "session-bearer-secret");
    const resolved = appendFileToken(
      "https://host/uploads/a.pdf",
      "file-scoped",
    );
    expect(resolved).not.toContain("session-bearer-secret");
    expect(resolved).toContain("file-scoped");
    localStorage.clear();
  });
});

describe("isPrivateAzureBlob", () => {
  it("returns true for a blob in a private container", () => {
    expect(
      isPrivateAzureBlob(
        "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf",
      ),
    ).toBe(true);
  });

  it("returns false for a blob in the public media container", () => {
    expect(
      isPrivateAzureBlob(
        "https://acct.blob.core.windows.net/media-public/pic.jpg",
      ),
    ).toBe(false);
  });

  it("returns false for non-blob URLs", () => {
    expect(isPrivateAzureBlob("https://cipansor.or.id/uploads/a.pdf")).toBe(
      false,
    );
    expect(isPrivateAzureBlob("https://example.com/a.pdf")).toBe(false);
    expect(isPrivateAzureBlob(null)).toBe(false);
    expect(isPrivateAzureBlob(undefined)).toBe(false);
  });
});

describe("isLocalUploadUrl / needsResolvedAccess", () => {
  it("recognises both spellings of a local upload", () => {
    expect(isLocalUploadUrl("/uploads/a.pdf")).toBe(true);
    expect(isLocalUploadUrl("https://host/uploads/a.pdf")).toBe(true);
    expect(isLocalUploadUrl("https://host/api/a.pdf")).toBe(false);
    expect(isLocalUploadUrl(null)).toBe(false);
  });

  it("needs resolution for private blobs and local uploads, not for public/external", () => {
    expect(needsResolvedAccess("https://host/uploads/a.pdf")).toBe(true);
    expect(
      needsResolvedAccess("https://acct.blob.core.windows.net/documents/a.pdf"),
    ).toBe(true);
    expect(
      needsResolvedAccess(
        "https://acct.blob.core.windows.net/media-public/a.jpg",
      ),
    ).toBe(false);
    expect(needsResolvedAccess("https://example.com/a.pdf")).toBe(false);
  });
});

describe("resolveFileWithExpiry", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("accessToken", "session-bearer-secret");
    apiMock.post.mockReset();
  });

  it("returns empty string for null/undefined", async () => {
    expect(await resolveFileUrl(null)).toBe("");
    expect(await resolveFileUrl(undefined)).toBe("");
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("mints a fresh SAS for a private Azure blob via /upload/sas", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          url: "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf",
          downloadUrl:
            "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf?sig=fresh",
          expiresIn: 3600,
        },
      },
    });

    const result = await resolveFileWithExpiry(
      "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf",
    );
    expect(result.url).toBe(
      "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf?sig=fresh",
    );
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(apiMock.post).toHaveBeenCalledWith("/upload/sas", {
      url: "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf",
    });
  });

  it("uses the single-file accessToken for a local upload (never the session JWT)", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          url: "/uploads/a.pdf",
          downloadUrl: "/uploads/a.pdf",
          accessToken: "file-scoped-token",
          expiresIn: 300,
        },
      },
    });

    const result = await resolveFileWithExpiry("/uploads/a.pdf");
    // Anchored to the API origin of this split-origin build (web :3000 / API
    // :3001). A bare `/uploads/a.pdf` would resolve against the page origin and
    // 404 against the web container.
    expect(result.url).toBe(
      "http://localhost:3001/uploads/a.pdf?token=file-scoped-token",
    );
    expect(result.url).not.toContain("session-bearer-secret");
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(apiMock.post).toHaveBeenCalledWith("/upload/sas", {
      url: "/uploads/a.pdf",
    });
  });

  it("anchors a relative local upload to the API origin (finding 1 regression)", async () => {
    // The upload middleware now persists a host-independent `/uploads/<file>`
    // path (finding 1). In a split-origin deployment the browser would resolve
    // it against the WEB origin, where it 404s; the resolver must hand back a
    // URL the API origin actually serves.
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          url: "/uploads/3f9b3824-fc01-452b-96d4-2caec27c1a4d.png",
          downloadUrl: "/uploads/3f9b3824-fc01-452b-96d4-2caec27c1a4d.png",
          accessToken: "file-scoped-token",
          expiresIn: 300,
        },
      },
    });

    const result = await resolveFileWithExpiry(
      "/uploads/3f9b3824-fc01-452b-96d4-2caec27c1a4d.png",
    );
    expect(result.url).toBe(
      "http://localhost:3001/uploads/3f9b3824-fc01-452b-96d4-2caec27c1a4d.png?token=file-scoped-token",
    );
  });

  it("anchors the canonical /uploads path the API returns for a legacy absolute row (finding B)", async () => {
    // The API canonicalizes a legacy absolute row (`https://old-host/uploads/x`)
    // down to `/uploads/x` before minting the token (finding B). The client must
    // therefore anchor the canonical path to the API origin, never echo the dead
    // host back to the browser.
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          url: "/uploads/legacy.png",
          downloadUrl: "/uploads/legacy.png",
          accessToken: "file-scoped-token",
          expiresIn: 300,
        },
      },
    });

    const result = await resolveFileWithExpiry(
      "http://oldhost:3000/uploads/legacy.png",
    );
    expect(result.url).toBe(
      "http://localhost:3001/uploads/legacy.png?token=file-scoped-token",
    );
    expect(result.url).not.toContain("oldhost");
  });

  it("falls back to the stable URL when the SAS request fails", async () => {
    apiMock.post.mockRejectedValue(new Error("network"));

    const result = await resolveFileUrl(
      "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf",
    );
    expect(result).toBe(
      "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf",
    );
  });

  it("passes a public blob URL through untouched (no SAS call)", async () => {
    const result = await resolveFileUrl(
      "https://acct.blob.core.windows.net/media-public/pic.jpg",
    );
    expect(result).toBe(
      "https://acct.blob.core.windows.net/media-public/pic.jpg",
    );
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("leaves external URLs alone (no session token appended)", async () => {
    const result = await resolveFileUrl("https://example.com/doc.pdf");
    expect(result).toBe("https://example.com/doc.pdf");
    expect(result).not.toContain("session-bearer-secret");
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe("evidenceFileType (PAUD evidence upload contract)", () => {
  const file = (type: string, name = "x") =>
    ({ type, name }) as unknown as File;

  it("maps an image MIME type to the `image` bucket the API accepts", () => {
    expect(evidenceFileType(file("image/png"))).toBe("image");
    expect(evidenceFileType(file("image/jpeg"))).toBe("image");
  });

  it("maps a video MIME type to `video`", () => {
    expect(evidenceFileType(file("video/mp4"))).toBe("video");
  });

  it("falls back to `document` for anything else", () => {
    expect(evidenceFileType(file("application/pdf"))).toBe("document");
    expect(evidenceFileType(file(""))).toBe("document");
  });

  it("never returns the uppercase bucket that failed schema validation", () => {
    // Regression: the pages sent "IMAGE"/"VIDEO", which `createEvidenceSchema`
    // (z.enum(['image','video','document'])) rejected with a 400.
    expect(evidenceFileType(file("image/png"))).not.toBe("IMAGE");
    expect(evidenceFileType(file("video/mp4"))).not.toBe("VIDEO");
  });
});

describe("isImageEvidence", () => {
  it("accepts the server bucket used by new rows", () => {
    expect(isImageEvidence("image")).toBe(true);
  });

  it("accepts the MIME spelling used by legacy rows and the seed fixture", () => {
    expect(isImageEvidence("image/jpeg")).toBe(true);
    expect(isImageEvidence("image/png")).toBe(true);
  });

  it("rejects video/document buckets and empty values", () => {
    expect(isImageEvidence("video")).toBe(false);
    expect(isImageEvidence("video/mp4")).toBe(false);
    expect(isImageEvidence("document")).toBe(false);
    expect(isImageEvidence(null)).toBe(false);
    expect(isImageEvidence(undefined)).toBe(false);
    expect(isImageEvidence("")).toBe(false);
  });
});

describe("displayableResolvedUrl (finding 4 — never leak a raw protected ref)", () => {
  const PRIVATE = "https://acct.blob.core.windows.net/documents/a.pdf";
  const LOCAL = "/uploads/a.pdf";
  const PUBLIC = "https://acct.blob.core.windows.net/media-public/a.jpg";
  const EXTERNAL = "https://example.com/a.pdf";

  it("returns the resolved credential when the map has one", () => {
    expect(
      displayableResolvedUrl(PRIVATE, { [PRIVATE]: `${PRIVATE}?sig=ok` }),
    ).toBe(`${PRIVATE}?sig=ok`);
  });

  it("returns null for a protected ref not yet resolved (the old `|| u` bug)", () => {
    // The exact pattern `resolvedMap[u] || u` returned PRIVATE here, sending the
    // browser a guaranteed-403 request.
    expect(displayableResolvedUrl(PRIVATE, {})).toBeNull();
    expect(displayableResolvedUrl(LOCAL, {})).toBeNull();
    // A resolved entry that is explicitly null (failed mint) is still null.
    expect(displayableResolvedUrl(PRIVATE, { [PRIVATE]: null })).toBeNull();
  });

  it("passes through a public/external URL that needs no credential", () => {
    expect(displayableResolvedUrl(PUBLIC, {})).toBe(PUBLIC);
    expect(displayableResolvedUrl(EXTERNAL, {})).toBe(EXTERNAL);
  });

  it("returns null for empty input", () => {
    expect(displayableResolvedUrl(null, {})).toBeNull();
    expect(displayableResolvedUrl(undefined, {})).toBeNull();
    expect(displayableResolvedUrl("", {})).toBeNull();
  });
});
