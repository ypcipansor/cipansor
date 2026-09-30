import { describe, it, expect, afterEach, vi } from "vitest";
import { authFileUrl, objectUrlForFile, releaseObjectUrl } from "./files";

describe("authFileUrl", () => {
  it("returns empty string for null/undefined", () => {
    expect(authFileUrl(null)).toBe("");
    expect(authFileUrl(undefined)).toBe("");
  });

  it("passes non-upload URLs through untouched", () => {
    expect(authFileUrl("https://example.com/doc.pdf")).toBe(
      "https://example.com/doc.pdf",
    );
  });

  it("appends no token to /uploads URLs", () => {
    // The session is an HttpOnly cookie now; there is no token in JS to append.
    expect(authFileUrl("http://localhost:3001/uploads/a.pdf")).toBe(
      "http://localhost:3001/uploads/a.pdf",
    );
  });

  it("keeps an existing query string on an upload URL", () => {
    expect(authFileUrl("http://localhost:3001/uploads/a.pdf?v=2")).toBe(
      "http://localhost:3001/uploads/a.pdf?v=2",
    );
  });
});

describe("objectUrlForFile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the blob URL createObjectURL produced", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue(
      "blob:http://localhost/abc-123",
    );
    expect(objectUrlForFile({} as File)).toBe("blob:http://localhost/abc-123");
  });

  it("returns an IPv6-origin blob URL byte-for-byte", () => {
    // A blob URL embeds the page origin. On an IPv6 host the serialized host
    // has square brackets; the browser registered `blob:http://[::1]:3000/abc`
    // and any re-encoding (`%5B`) names a different, unregistered URL, so the
    // preview 404s. The exact string must come back.
    const ipv6Url = "blob:http://[::1]:3000/abc-123";
    vi.spyOn(URL, "createObjectURL").mockReturnValue(ipv6Url);

    const result = objectUrlForFile({} as File);

    expect(result).toBe(ipv6Url);
    expect(result).not.toContain("%5B");
  });

  it("drops anything that is not a blob: URL", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("javascript:alert(1)");
    expect(objectUrlForFile({} as File)).toBe("");
  });
});

describe("releaseObjectUrl", () => {
  afterEach(() => vi.restoreAllMocks());

  it("revokes a blob URL", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    releaseObjectUrl("blob:http://localhost/abc-123");
    expect(revoke).toHaveBeenCalledWith("blob:http://localhost/abc-123");
  });

  it("ignores empty and non-blob URLs", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    releaseObjectUrl(null);
    releaseObjectUrl(undefined);
    releaseObjectUrl("https://example.com/a.png");
    expect(revoke).not.toHaveBeenCalled();
  });
});
