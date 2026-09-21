import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  generateCertificateNumber,
  useCertificateNumber,
} from "./use-certificate";

/** Feed `generateCertificateNumber` a fixed sequence of 16-bit samples. */
function mockSamples(...values: number[]) {
  let i = 0;
  const spy = vi
    .spyOn(globalThis.crypto, "getRandomValues")
    .mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (array) {
        (array as unknown as Uint16Array)[0] =
          values[Math.min(i, values.length - 1)];
      }
      i++;
      return array;
    });
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateCertificateNumber", () => {
  it("formats as unit/type/yearmonth/random", () => {
    mockSamples(0);
    expect(generateCertificateNumber("GRADUATION", "CPN")).toMatch(
      /^CPN\/GRA\/\d{6}\/\d{4}$/,
    );
  });

  it("derives the type code from the first three letters, uppercased", () => {
    mockSamples(0);
    expect(generateCertificateNumber("TAHFIDZ", "CPN")).toContain("/TAH/");
    expect(generateCertificateNumber("IJAZAH", "CPN")).toContain("/IJA/");
  });

  it("uses the caller's unit code", () => {
    mockSamples(0);
    expect(generateCertificateNumber("SANAD", "SDIT")).toMatch(/^SDIT\//);
  });

  it("maps accepted samples into 0..9999", () => {
    mockSamples(12345);
    expect(generateCertificateNumber("SANAD", "CPN").endsWith("/2345")).toBe(
      true,
    );
  });

  it("rejects an out-of-range sample and resamples", () => {
    // 60000 is the first value that would bias the modulo, so it must be
    // rejected; the next sample decides the number.
    const spy = mockSamples(60000, 7);
    const result = generateCertificateNumber("SANAD", "CPN");

    expect(spy.mock.calls.length).toBe(2);
    expect(result.endsWith("/0007")).toBe(true);
  });

  it("never returns a random part outside 0000..9999", () => {
    mockSamples(59999);
    const random = generateCertificateNumber("SANAD", "CPN").split("/").pop()!;
    expect(random).toMatch(/^\d{4}$/);
    expect(Number(random)).toBeLessThanOrEqual(9999);
  });
});

describe("useCertificateNumber", () => {
  it("keeps the number stable across unrelated re-renders", () => {
    const spy = mockSamples(4, 8, 12);
    const { result, rerender } = renderHook(
      ({ type }: { type: "SANAD" }) => useCertificateNumber(type, "CPN"),
      { initialProps: { type: "SANAD" as const } },
    );

    const first = result.current;
    rerender({ type: "SANAD" });
    rerender({ type: "SANAD" });

    expect(result.current).toBe(first);
    // One sample consumed: re-rendering must not draw a new number.
    expect(spy.mock.calls.length).toBe(1);
  });

  it("changes the number when the type changes", () => {
    mockSamples(4);
    const { result, rerender } = renderHook(
      ({ type }: { type: "SANAD" | "TAHFIDZ" }) =>
        useCertificateNumber(type, "CPN"),
      { initialProps: { type: "SANAD" as "SANAD" | "TAHFIDZ" } },
    );

    const first = result.current;
    rerender({ type: "TAHFIDZ" });

    expect(result.current).not.toBe(first);
    expect(result.current).toContain("/TAH/");
  });
});
