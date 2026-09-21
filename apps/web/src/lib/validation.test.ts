import { describe, it, expect } from "vitest";
import { fileType } from "./validation";

function file(name: string, type: string): File {
  return new File(["x"], name, { type });
}

function allows(allowed: string[], f: File): boolean {
  return fileType(allowed).validate(f);
}

describe("fileType", () => {
  it("allows every file when the value is not a File", () => {
    expect(fileType(["image/png"]).validate(null)).toBe(true);
    expect(fileType(["image/png"]).validate("not-a-file")).toBe(true);
  });

  it("matches an exact MIME type", () => {
    expect(allows(["image/png"], file("a.png", "image/png"))).toBe(true);
    expect(allows(["image/png"], file("a.jpg", "image/jpeg"))).toBe(false);
  });

  it("matches a wildcard subtype by MIME major type", () => {
    expect(allows(["image/*"], file("a.png", "image/png"))).toBe(true);
    expect(allows(["image/*"], file("a.gif", "image/gif"))).toBe(true);
    expect(allows(["image/*"], file("a.pdf", "application/pdf"))).toBe(false);
    // Must not accept a major type that merely starts with the rule's text.
    expect(allows(["image/*"], file("a", "imagex/png"))).toBe(false);
  });

  it("matches a leading-dot extension rule against the filename", () => {
    expect(allows([".pdf"], file("doc.PDF", "application/octet-stream"))).toBe(
      true,
    );
    expect(allows([".pdf"], file("doc.txt", "text/plain"))).toBe(false);
  });

  it("rejects types that are not allowed", () => {
    expect(allows(["image/png", ".pdf"], file("a.html", "text/html"))).toBe(
      false,
    );
  });

  it("rejects malformed wildcard patterns instead of widening them", () => {
    // Deleting every `*` used to turn these into broad prefixes (`image/`,
    // `image/pn`), accepting far more than intended.
    expect(allows(["*"], file("a.png", "image/png"))).toBe(false);
    expect(allows(["*/*"], file("a.png", "image/png"))).toBe(false);
    expect(allows(["image/pn*"], file("a.png", "image/png"))).toBe(false);
    expect(allows(["image/*/extra"], file("a.png", "image/png"))).toBe(false);
    expect(allows(["image//*"], file("a.png", "image/png"))).toBe(false);
  });

  it("accepts when any one of several rules matches", () => {
    expect(
      allows(["application/pdf", "image/*"], file("a.png", "image/png")),
    ).toBe(true);
  });
});
