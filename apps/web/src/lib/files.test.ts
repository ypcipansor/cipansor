import { describe, it, expect, beforeEach, vi } from "vitest";
import { authFileUrl, isPrivateAzureBlob, resolveFileUrl } from "./files";

// Control the /upload/sas response from top level so vi.mock stays hoisted.
const apiMock = { post: vi.fn() };
vi.mock("@/lib/api", () => ({ default: apiMock }));

describe("authFileUrl", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty string for null/undefined", () => {
    expect(authFileUrl(null)).toBe("");
    expect(authFileUrl(undefined)).toBe("");
  });

  it("passes non-upload URLs through untouched", () => {
    expect(authFileUrl("https://example.com/doc.pdf")).toBe(
      "https://example.com/doc.pdf",
    );
  });

  it("appends the stored access token to /uploads URLs", () => {
    localStorage.setItem("accessToken", "tok-123");
    expect(authFileUrl("http://localhost:3001/uploads/a.pdf")).toBe(
      "http://localhost:3001/uploads/a.pdf?token=tok-123",
    );
  });

  it("uses & when the URL already has a query string", () => {
    localStorage.setItem("accessToken", "tok-123");
    expect(authFileUrl("http://localhost:3001/uploads/a.pdf?v=2")).toBe(
      "http://localhost:3001/uploads/a.pdf?v=2&token=tok-123",
    );
  });

  it("URL-encodes the token", () => {
    localStorage.setItem("accessToken", "a+b/c");
    expect(authFileUrl("http://localhost:3001/uploads/a.pdf")).toBe(
      "http://localhost:3001/uploads/a.pdf?token=a%2Bb%2Fc",
    );
  });

  it("returns the bare URL when no token is stored", () => {
    expect(authFileUrl("http://localhost:3001/uploads/a.pdf")).toBe(
      "http://localhost:3001/uploads/a.pdf",
    );
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

describe("resolveFileUrl", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("accessToken", "tok-123");
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
        },
      },
    });

    const result = await resolveFileUrl(
      "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf",
    );
    expect(result).toBe(
      "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf?sig=fresh",
    );
    expect(apiMock.post).toHaveBeenCalledWith("/upload/sas", {
      url: "https://acct.blob.core.windows.net/e-office-documents/naskah.pdf",
    });
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
    expect(result).toBe("https://acct.blob.core.windows.net/media-public/pic.jpg");
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("appends the token to a local /uploads URL", async () => {
    const result = await resolveFileUrl("https://cipansor.or.id/uploads/a.pdf");
    expect(result).toBe("https://cipansor.or.id/uploads/a.pdf?token=tok-123");
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
