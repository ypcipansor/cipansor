import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { createElement, useState, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import {
  generateCertificateNumber,
  useCertificateNumber,
  PENDING_CERTIFICATE_NUMBER,
} from "./use-certificate";

/** The shape of a final number the user must never see as the placeholder. */
const CERTIFICATE_NUMBER_PATTERN = /^[A-Z]+\/[A-Z]{3}\/\d{6}\/\d{4}$/;

/** The random source spy most recently installed by `mockSamples`. */
let certRandomSpy: ReturnType<typeof vi.spyOn> | undefined;

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
  certRandomSpy = spy;
  return spy;
}

/**
 * Keep the real `getRandomValues` behaviour but count calls, so a test can
 * assert that the server render never touched the random source while still
 * checking that the post-mount value has the expected shape.
 */
function trackSamples() {
  const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
  certRandomSpy = spy;
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  certRandomSpy = undefined;
});

/** Renders the hook's current value as text; the placeholder while pending. */
function NumberProbe({
  type,
  unitCode,
}: {
  type: "SANAD";
  unitCode: string;
}): ReactElement {
  const { value } = useCertificateNumber(type, unitCode);
  return createElement(
    "span",
    { "data-testid": "number" },
    value ?? PENDING_CERTIFICATE_NUMBER,
  );
}

/**
 * Render `element` with `renderToString`, then hydrate the same tree and
 * capture whatever React logs to `console.error` (hydration mismatches land
 * there). `containerMarkup` overrides the server markup so the harness can be
 * proven to actually surface a mismatch.
 */
async function ssrThenHydrate(
  element: ReactElement,
  containerMarkup?: string,
): Promise<{
  errors: string[];
  containerText: string;
  serverText: string;
  callsAfterServerRender: number;
}> {
  const callsAfterServerRender = certRandomSpy?.mock.calls.length ?? 0;
  const serverHtml = renderToString(element);
  const serverText = new DOMParser()
    .parseFromString(serverHtml, "text/html")
    .querySelector('[data-testid="number"]')?.textContent;

  const container = document.createElement("div");
  container.innerHTML =
    containerMarkup === undefined
      ? serverHtml
      : `<span data-testid="number">${containerMarkup}</span>`;
  document.body.appendChild(container);

  // React reports a hydration mismatch through `onRecoverableError`, and also
  // logs it to `console.error`; collect both so either route is caught.
  const errors: string[] = [];
  const errorSpy = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

  let root: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, element, {
      onRecoverableError: (error) => errors.push(String(error)),
    });
  });
  // The mint effect flushes here, after hydration has completed.
  await act(async () => {});
  const containerText = container.textContent ?? "";
  root!.unmount();
  errorSpy.mockRestore();

  return {
    errors,
    containerText,
    serverText: serverText ?? "",
    callsAfterServerRender,
  };
}

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
  it("placeholder cannot be mistaken for a final certificate number", () => {
    expect(PENDING_CERTIFICATE_NUMBER).not.toMatch(CERTIFICATE_NUMBER_PATTERN);
  });

  it("is null on the server and on the initial client render, then mints after mount", () => {
    const spy = mockSamples(4, 8);

    const seen: Array<string | null> = [];
    function Probe() {
      const { value } = useCertificateNumber("SANAD", "CPN");
      seen.push(value);
      return null;
    }

    // Server render: deterministic, and the random source is never touched.
    renderToString(createElement(Probe));
    expect(seen[0]).toBeNull();
    expect(spy.mock.calls.length).toBe(0);

    // Client mount: the render React hydrates against is still the
    // placeholder — `seen[0]` is that first render, before the effect runs —
    // so the server and client markup agree (confirmed again by the hydration
    // test below, which must observe no mismatch).
    seen.length = 0;
    function MountProbe() {
      const result = useCertificateNumber("SANAD", "CPN");
      seen.push(result.value);
      return null;
    }
    render(createElement(MountProbe));
    expect(seen[0]).toBeNull();

    // Only the post-mount effect mints it.
    expect(seen[seen.length - 1]).toMatch(CERTIFICATE_NUMBER_PATTERN);
    expect(spy.mock.calls.length).toBe(1);
  });

  it("keeps the number stable across unrelated re-renders", () => {
    const spy = mockSamples(4, 8, 12);
    const { result, rerender } = renderHook(
      ({ type }: { type: "SANAD" }) => useCertificateNumber(type, "CPN"),
      { initialProps: { type: "SANAD" as const } },
    );

    const first = result.current.value;
    expect(first).toMatch(CERTIFICATE_NUMBER_PATTERN);
    rerender({ type: "SANAD" });
    rerender({ type: "SANAD" });

    expect(result.current.value).toBe(first);
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

    const first = result.current.value;
    rerender({ type: "TAHFIDZ" });

    expect(result.current.value).not.toBe(first);
    expect(result.current.value).toContain("/TAH/");
  });

  it("changes the number when the unit code changes", () => {
    mockSamples(4);
    const { result, rerender } = renderHook(
      ({ unitCode }: { unitCode: string }) =>
        useCertificateNumber("SANAD", unitCode),
      { initialProps: { unitCode: "CPN" } },
    );

    const first = result.current.value;
    rerender({ unitCode: "SDIT" });

    expect(result.current.value).not.toBe(first);
    expect(result.current.value!.startsWith("SDIT/")).toBe(true);
  });

  it("refreshes the number after the calendar month rolls over, without remounting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 23, 59, 0)); // Jan 31
    mockSamples(4, 9);

    const { result } = renderHook(() => useCertificateNumber("SANAD", "CPN"));
    const first = result.current.value;
    expect(first).toContain("/202601/");
    expect(result.current.monthBucket).toBe("202601");

    // Cross into February while the component stays mounted.
    act(() => {
      vi.setSystemTime(new Date(2026, 1, 1, 0, 0, 1));
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.value).not.toBe(first);
    expect(result.current.value).toContain("/202602/");
    expect(result.current.monthBucket).toBe("202602");
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
    expect(result.current.value).toContain("/202601/");

    // One clamp interval: not yet February, so the number must not change...
    act(() => {
      vi.advanceTimersByTime(2 ** 31 - 1);
    });
    expect(result.current.value).toContain("/202601/");
    // ...but a timer must still be pending for the remainder.
    expect(vi.getTimerCount()).toBe(1);

    // ...and the next wake-up lands in February, minting a new number.
    act(() => {
      vi.setSystemTime(new Date(2026, 1, 1, 0, 0, 0));
      vi.advanceTimersByTime(2 ** 31 - 1);
    });
    expect(result.current.value).toContain("/202602/");
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

  it("does not update state after unmount and leaks no timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
    mockSamples(4, 9);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderHook(() => useCertificateNumber("SANAD", "CPN"));
    unmount();

    // Winding the clock past the boundary must not fire the torn-down chain.
    act(() => {
      vi.setSystemTime(new Date(2026, 1, 1, 0, 0, 0));
      vi.advanceTimersByTime(2 ** 31 - 1);
      vi.advanceTimersByTime(2 ** 31 - 1);
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(
      errorSpy.mock.calls.map((args) => args.map(String).join(" ")).join("\n"),
    ).not.toMatch(/unmounted component|memory leak/i);
  });

  it("keeps exactly one timer when the identity changes while a chain is pending", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
    mockSamples(4);

    const { rerender } = renderHook(
      ({ unitCode }: { unitCode: string }) =>
        useCertificateNumber("SANAD", unitCode),
      { initialProps: { unitCode: "CPN" } },
    );

    // Changing the identity tears down the old chain before arming the new
    // one — exactly one timeout must remain, never two.
    rerender({ unitCode: "SDIT" });
    expect(vi.getTimerCount()).toBe(1);
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

  it("renders on the server without reading a browser-only API", () => {
    // `renderToString` runs the component in the Node render path; a reference
    // to `window`/`document` during render would throw here.
    const html = renderToString(
      createElement(NumberProbe, { type: "SANAD", unitCode: "CPN" }),
    );
    expect(html).toContain(PENDING_CERTIFICATE_NUMBER);
  });

  it("server markup and the initial client render agree — no hydration mismatch", async () => {
    const spy = trackSamples();
    const element = createElement(NumberProbe, {
      type: "SANAD",
      unitCode: "CPN",
    });

    const { errors, containerText, serverText, callsAfterServerRender } =
      await ssrThenHydrate(element);

    // The server produced the deterministic placeholder and never consulted
    // the random generator.
    expect(serverText).toBe(PENDING_CERTIFICATE_NUMBER);
    expect(callsAfterServerRender).toBe(0);

    // React reported no mismatch while adopting the server markup...
    expect(errors.join("\n")).not.toMatch(/hydrat|did not match|mismatch/i);
    // ...and afterwards the mounted hook shows the real number.
    expect(containerText).toMatch(CERTIFICATE_NUMBER_PATTERN);
    expect(spy.mock.calls.length).toBeGreaterThan(0);
  });

  it("detects a real mismatch (control for the hydration harness)", async () => {
    trackSamples();
    const element = createElement(NumberProbe, {
      type: "SANAD",
      unitCode: "CPN",
    });

    // Feed the container markup that does NOT match what the component renders
    // on the server, so the harness is proven able to surface a mismatch.
    const { errors } = await ssrThenHydrate(element, "CPN/SAN/202601/9999");

    expect(errors.join("\n")).toMatch(/hydrat|did not match|mismatch/i);
  });

  it("uses one identity for both preview and the printed document", () => {
    // The page holds a single hook value and hands it to both surfaces, so a
    // re-render between viewing and printing must not change what the print
    // document receives.
    mockSamples(4);
    function Page() {
      const { value } = useCertificateNumber("SANAD", "CPN");
      const [printed, setPrinted] = useState("");
      const shown = value ?? PENDING_CERTIFICATE_NUMBER;
      return createElement(
        "div",
        null,
        createElement("span", { "data-label": "preview" }, shown),
        createElement(
          "button",
          { "data-label": "print", onClick: () => setPrinted(shown) },
          "print",
        ),
        createElement("span", { "data-label": "printed" }, printed),
      );
    }
    const { container, rerender } = render(createElement(Page));

    const text = (label: string) =>
      container.querySelector(`[data-label="${label}"]`)?.textContent ?? "";
    const preview = text("preview");
    expect(preview).toMatch(CERTIFICATE_NUMBER_PATTERN);

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
