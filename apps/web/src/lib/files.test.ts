import { describe, it, expect } from "vitest";
import { authFileUrl } from "./files";

describe("authFileUrl", () => {
  it("returns empty string for null/undefined", () => {
    expect(authFileUrl(null)).toBe("");
    expect(authFileUrl(undefined)).toBe("");
  });

  it("passes URLs through untouched", () => {
    expect(authFileUrl("https://example.com/doc.pdf")).toBe(
      "https://example.com/doc.pdf",
    );
  });

  it("never appends a token query parameter", () => {
    // The session token is `HttpOnly`; putting it (or anything token-shaped)
    // in a URL would leak it into access logs and the Referer header.
    expect(authFileUrl("http://localhost:3001/uploads/a.pdf")).toBe(
      "http://localhost:3001/uploads/a.pdf",
    );
  });
});
