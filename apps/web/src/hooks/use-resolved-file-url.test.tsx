import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useResolvedFileUrl, useResolvedFileUrls, REFRESH_MARGIN_MS } from "./use-resolved-file-url";

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));

vi.mock("@/lib/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/files")>();
  return { ...actual, resolveFileWithExpiry: mockResolve };
});

const RAW = "https://store.blob.core.windows.net/cipansor-documents/ktp.pdf";

describe("useResolvedFileUrl", () => {
  beforeEach(() => {
    mockResolve.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns null for a missing url without calling the resolver", () => {
    const { result } = renderHook(() => useResolvedFileUrl(null));
    expect(result.current).toBeNull();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("mints a SAS for a private blob and swaps in the signed url", async () => {
    mockResolve.mockResolvedValue({ url: `${RAW}?sig=sas`, expiresAt: null });
    const { result } = renderHook(() => useResolvedFileUrl(RAW));

    // The raw url is shown immediately, then upgraded to the signed one.
    expect(result.current).toBe(RAW);
    await waitFor(() => expect(result.current).toBe(`${RAW}?sig=sas`));
    expect(mockResolve).toHaveBeenCalledWith(RAW);
  });

  it("keeps the raw url when the resolver returns no credential", async () => {
    mockResolve.mockResolvedValue({ url: RAW, expiresAt: null });
    const { result } = renderHook(() => useResolvedFileUrl(RAW));

    await waitFor(() => expect(result.current).toBe(RAW));
  });

  it("re-resolves before the credential expires (BUG 3)", async () => {
    // The whole point of the refresh: a page left open past the SAS TTL must
    // not keep pointing at a dead link. Fake timers prove the second mint is
    // driven by the clock, with no re-mount and no user action.
    vi.useFakeTimers();
    const ttlMs = 60 * 60 * 1000;
    const first = "https://store.blob.core.windows.net/cipansor-documents/a.pdf?sig=first";
    const second = "https://store.blob.core.windows.net/cipansor-documents/a.pdf?sig=second";
    mockResolve
      .mockResolvedValueOnce({ url: first, expiresAt: Date.now() + ttlMs })
      .mockResolvedValueOnce({ url: second, expiresAt: Date.now() + ttlMs });

    const { result } = renderHook(() => useResolvedFileUrl(RAW));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe(first);

    // Advance to just past (TTL - margin): the refresh fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ttlMs - REFRESH_MARGIN_MS + 1);
    });
    expect(result.current).toBe(second);
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });

  it("clears its refresh timer on unmount (no timer leak)", async () => {
    vi.useFakeTimers();
    mockResolve.mockResolvedValue({ url: `${RAW}?sig=sas`, expiresAt: Date.now() + 60 * 60 * 1000 });

    const { result, unmount } = renderHook(() => useResolvedFileUrl(RAW));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe(`${RAW}?sig=sas`);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    // The refresh timer must be gone, and no further mint may fire.
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    });
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  it("does not write state after unmount when the mint resolves late", async () => {
    let release: (v: { url: string; expiresAt: number | null }) => void = () => {};
    mockResolve.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { unmount } = renderHook(() => useResolvedFileUrl(RAW));
    unmount();

    // Resolving now must be a no-op rather than a setState-after-unmount warn.
    await act(async () => {
      release({ url: `${RAW}?sig=late`, expiresAt: null });
      await Promise.resolve();
    });
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });
});

describe("useResolvedFileUrls", () => {
  beforeEach(() => {
    mockResolve.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("resolves a batch and keys the result by the original stable URL", async () => {
    const a = "https://store.blob.core.windows.net/cipansor-documents/a.pdf";
    const b = "/uploads/b.pdf";
    mockResolve.mockImplementation(async (url: string) => ({
      url: `${url}?sig=x`,
      expiresAt: null,
    }));

    const { result } = renderHook(() => useResolvedFileUrls([a, b]));
    await waitFor(() => expect(result.current[a]).toBe(`${a}?sig=x`));
    expect(result.current[b]).toBe(`${b}?sig=x`);
  });

  it("refreshes the whole batch before the earliest credential expires", async () => {
    vi.useFakeTimers();
    const a = "https://store.blob.core.windows.net/cipansor-documents/a.pdf";
    const ttlMs = 30 * 60 * 1000;
    let mint = 0;
    mockResolve.mockImplementation(async (url: string) => {
      mint += 1;
      return { url: `${url}?mint=${mint}`, expiresAt: Date.now() + ttlMs };
    });

    const { result } = renderHook(() => useResolvedFileUrls([a]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current[a]).toBe(`${a}?mint=1`);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ttlMs - REFRESH_MARGIN_MS + 1);
    });
    expect(result.current[a]).toBe(`${a}?mint=2`);
  });

  it("does not re-resolve on every render when the array identity changes", async () => {
    mockResolve.mockResolvedValue({ url: `${RAW}?sig=sas`, expiresAt: null });
    const { rerender } = renderHook(({ urls }) => useResolvedFileUrls(urls), {
      initialProps: { urls: [RAW] as string[] },
    });
    await waitFor(() => expect(mockResolve).toHaveBeenCalledTimes(1));

    // A new array with the same contents must not trigger another batch.
    rerender({ urls: [RAW] });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });
});