import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authFileUrl, objectUrlForFile } from "./files";

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

describe("objectUrlForFile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the blob URL createObjectURL produced", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue(
      "blob:http://localhost/abc-123",
    );
    expect(objectUrlForFile({} as File)).toBe("blob:http://localhost/abc-123");
  });

  it("drops anything that is not a blob: URL", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("javascript:alert(1)");
    expect(objectUrlForFile({} as File)).toBe("");
  });
});
