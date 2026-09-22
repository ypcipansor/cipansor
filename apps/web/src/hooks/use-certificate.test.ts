import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { createElement, useState } from "react";
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
  vi.useRealTimers();
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

  it("changes the number when the unit code changes", () => {
    mockSamples(4);
    const { result, rerender } = renderHook(
      ({ unitCode }: { unitCode: string }) =>
        useCertificateNumber("SANAD", unitCode),
      { initialProps: { unitCode: "CPN" } },
    );

    const first = result.current;
    rerender({ unitCode: "SDIT" });

    expect(result.current).not.toBe(first);
    expect(result.current.startsWith("SDIT/")).toBe(true);
  });

  it("refreshes the number after the calendar month rolls over, without remounting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 23, 59, 0)); // Jan 31
    mockSamples(4, 9);

    const { result } = renderHook(() => useCertificateNumber("SANAD", "CPN"));
    const first = result.current;
    expect(first).toContain("/202601/");

    // Cross into February while the component stays mounted.
    act(() => {
      vi.setSystemTime(new Date(2026, 1, 1, 0, 0, 1));
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).not.toBe(first);
    expect(result.current).toContain("/202602/");
  });

  it("re-arms across a boundary that is longer than the setTimeout maximum", () => {
    // From Jan 1 the next boundary is ~31 days out (2.68e9 ms), above the
    // 2^31-1 ms `setTimeout` ceiling. A single unclamped timer would overflow
    // and fire almost immediately, leaving the number stamped 202601 forever.
    // The clamped chain must re-arm until the real boundary is crossed.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
    mockSamples(4, 9);

    const { result } = renderHook(() => useCertificateNumber("SANAD", "CPN"));
    expect(result.current).toContain("/202601/");

    // One clamp interval: not yet February, so the number must not change...
    act(() => {
      vi.advanceTimersByTime(2 ** 31 - 1);
    });
    expect(result.current).toContain("/202601/");
    // ...but a timer must still be pending for the remainder.
    expect(vi.getTimerCount()).toBe(1);

    // ...and the next wake-up lands in February, minting a new number.
    act(() => {
      vi.setSystemTime(new Date(2026, 1, 1, 0, 0, 0));
      vi.advanceTimersByTime(2 ** 31 - 1);
    });
    expect(result.current).toContain("/202602/");
  });

  it("clears the month-rollover timer on unmount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
    mockSamples(4);

    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = renderHook(() => useCertificateNumber("SANAD", "CPN"));
    const timersBefore = vi.getTimerCount();

    unmount();

    expect(vi.getTimerCount()).toBeLessThan(timersBefore);
    expect(clearSpy).toHaveBeenCalled();
  });

  it("schedules a single timer rather than polling on every render", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
    mockSamples(4);

    const { rerender } = renderHook(
      ({ type }: { type: "SANAD" }) => useCertificateNumber(type, "CPN"),
      { initialProps: { type: "SANAD" as const } },
    );

    rerender({ type: "SANAD" });
    rerender({ type: "SANAD" });

    // One pending timeout — not one per render, and not an interval.
    expect(vi.getTimerCount()).toBe(1);
  });

  it("does not read browser-only APIs while rendering (SSR-safe)", () => {
    // No window/document in this render path; a reference to them during
    // render would throw here.
    const { result } = renderHook(() => useCertificateNumber("SANAD", "CPN"));
    expect(result.current).toMatch(/^CPN\/SAN\/\d{6}\/\d{4}$/);
  });

  it("uses one identity for both preview and the printed document", () => {
    // The page holds a single hook value and hands it to both surfaces, so a
    // re-render between viewing and printing must not change what the print
    // document receives.
    mockSamples(4);
    function Page() {
      const number = useCertificateNumber("SANAD", "CPN");
      const [printed, setPrinted] = useState("");
      return createElement(
        "div",
        null,
        createElement("span", { "data-label": "preview" }, number),
        createElement(
          "button",
          { "data-label": "print", onClick: () => setPrinted(number) },
          "print",
        ),
        createElement("span", { "data-label": "printed" }, printed),
      );
    }
    const { container, rerender } = render(createElement(Page));

    const text = (label: string) =>
      container.querySelector(`[data-label="${label}"]`)?.textContent ?? "";
    const preview = text("preview");

    rerender(createElement(Page));
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-label="print"]')!
        .click();
    });

    expect(text("preview")).toBe(preview);
    expect(text("printed")).toBe(preview);
  });
});
