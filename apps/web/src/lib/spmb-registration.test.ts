import { describe, it, expect } from "vitest";
import { resolveFeeOwed, canPreviewDocument } from "./spmb-registration";

describe("resolveFeeOwed", () => {
  it("prefers the wave fee over the period fee (backend assertAdmissionFeeSettled)", () => {
    expect(resolveFeeOwed(250000, 0)).toBe(250000);
    expect(resolveFeeOwed(250000, 100000)).toBe(250000);
  });

  it("falls back to the period fee when the wave fee is absent or zero", () => {
    expect(resolveFeeOwed(0, 100000)).toBe(100000);
    expect(resolveFeeOwed(null, 100000)).toBe(100000);
    expect(resolveFeeOwed(undefined, 100000)).toBe(100000);
  });

  it("returns 0 when neither wave nor period charges a fee", () => {
    expect(resolveFeeOwed(0, 0)).toBe(0);
    expect(resolveFeeOwed(null, null)).toBe(0);
    expect(resolveFeeOwed(undefined, undefined)).toBe(0);
  });
});

describe("canPreviewDocument (SSRF guard)", () => {
  it("allows only self-contained data: URIs", () => {
    expect(canPreviewDocument("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(canPreviewDocument("data:application/pdf;base64,JVBERi0=")).toBe(true);
  });

  it("refuses remote URLs, http(s)/protocol-relative, and other strings", () => {
    expect(canPreviewDocument("https://evil.example.com/doc.png")).toBe(false);
    expect(canPreviewDocument("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(canPreviewDocument("//evil.example.com/doc.png")).toBe(false);
    expect(canPreviewDocument("file:///etc/passwd")).toBe(false);
    expect(canPreviewDocument("/local/path/only.png")).toBe(false);
    expect(canPreviewDocument("")).toBe(false);
    expect(canPreviewDocument(null)).toBe(false);
    expect(canPreviewDocument(undefined)).toBe(false);
  });
});
