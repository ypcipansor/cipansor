import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  useResolvedFileUrl,
  useResolvedFileUrls,
  REFRESH_MARGIN_MS,
} from "./use-resolved-file-url";

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

  it("mints a SAS for a private blob and exposes only the signed url", async () => {
    mockResolve.mockResolvedValue({ url: `${RAW}?sig=sas`, expiresAt: null });
    const { result } = renderHook(() => useResolvedFileUrl(RAW));

    // The raw url is NEVER exposed; the signed one appears once minted.
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(`${RAW}?sig=sas`));
    expect(mockResolve).toHaveBeenCalledWith(RAW);
  });

  it("re-resolves before the credential expires (BUG 3)", async () => {
    // The whole point of the refresh: a page left open past the SAS TTL must
    // not keep pointing at a dead link. Fake timers prove the second mint is
    // driven by the clock, with no re-mount and no user action.
    vi.useFakeTimers();
    const ttlMs = 60 * 60 * 1000;
    const first =
      "https://store.blob.core.windows.net/cipansor-documents/a.pdf?sig=first";
    const second =
      "https://store.blob.core.windows.net/cipansor-documents/a.pdf?sig=second";
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

  it("does NOT publish the raw private reference before its credential exists (finding 4)", async () => {
    // The raw blob URL 403s. Publishing it first would make the browser fire a
    // failing request and show a broken element.
    let release: (v: {
      url: string;
      expiresAt: number | null;
    }) => void = () => {};
    mockResolve.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { result } = renderHook(() => useResolvedFileUrl(RAW));

    // In flight: null, never the raw URL.
    expect(result.current).toBeNull();

    await act(async () => {
      release({ url: `${RAW}?sig=sas`, expiresAt: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current).toBe(`${RAW}?sig=sas`));
  });

  it("renders a public/external URL immediately (no credential needed)", () => {
    const external = "https://example.com/public.pdf";
    const { result } = renderHook(() => useResolvedFileUrl(external));
    expect(result.current).toBe(external);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("stays null when the resolver could not mint a credential for a private file", async () => {
    // The resolver falls back to the raw URL on failure; the hook must not
    // forward it to the browser.
    mockResolve.mockResolvedValue({ url: RAW, expiresAt: null });
    const { result } = renderHook(() => useResolvedFileUrl(RAW));

    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("keeps the last good credential through a failed refresh (no raw downgrade)", async () => {
    vi.useFakeTimers();
    const ttlMs = 60 * 60 * 1000;
    const first =
      "https://store.blob.core.windows.net/cipansor-documents/a.pdf?sig=first";
    mockResolve
      .mockResolvedValueOnce({ url: first, expiresAt: Date.now() + ttlMs })
      // The refresh cannot mint: the resolver returns the raw reference.
      .mockResolvedValueOnce({ url: RAW, expiresAt: null });

    const { result } = renderHook(() => useResolvedFileUrl(RAW));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe(first);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ttlMs - REFRESH_MARGIN_MS + 1);
    });
    // Not RAW, and not null: the previously-good credentialised URL is kept.
    expect(result.current).toBe(first);
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });

  it("never renders one file's credential for a different input", async () => {
    const a = "https://store.blob.core.windows.net/cipansor-documents/a.pdf";
    const b = "https://store.blob.core.windows.net/cipansor-documents/b.pdf";
    mockResolve.mockImplementation(async (u: string) => ({
      url: `${u}?sig=ok`,
      expiresAt: null,
    }));

    const { result, rerender } = renderHook(
      ({ url }) => useResolvedFileUrl(url),
      {
        initialProps: { url: a },
      },
    );
    await waitFor(() => expect(result.current).toBe(`${a}?sig=ok`));

    // Changing the input must clear the old value, not keep showing a's URL.
    rerender({ url: b });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(`${b}?sig=ok`));
  });

  it("does not reject when the resolver throws", async () => {
    mockResolve.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useResolvedFileUrl(RAW));
    await act(async () => {
      await Promise.resolve();
    });
    // No unhandled rejection, and no raw URL leaked to the browser.
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("ignores a stale async result after the input changed", async () => {
    const a = "https://store.blob.core.windows.net/cipansor-documents/a.pdf";
    const b = "https://store.blob.core.windows.net/cipansor-documents/b.pdf";
    let releaseA: (v: {
      url: string;
      expiresAt: number | null;
    }) => void = () => {};
    mockResolve
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseA = resolve;
          }),
      )
      .mockImplementationOnce(async () => ({
        url: `${b}?sig=b`,
        expiresAt: null,
      }));

    const { result, rerender } = renderHook(
      ({ url }) => useResolvedFileUrl(url),
      {
        initialProps: { url: a },
      },
    );
    rerender({ url: b });
    await waitFor(() => expect(result.current).toBe(`${b}?sig=b`));

    // a's late resolution must not overwrite b's credential.
    await act(async () => {
      releaseA({ url: `${a}?sig=a`, expiresAt: null });
      await Promise.resolve();
    });
    expect(result.current).toBe(`${b}?sig=b`);
  });

  it("clears its refresh timer on unmount (no timer leak)", async () => {
    vi.useFakeTimers();
    mockResolve.mockResolvedValue({
      url: `${RAW}?sig=sas`,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

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
    let release: (v: {
      url: string;
      expiresAt: number | null;
    }) => void = () => {};
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

  it("returns null for a protected batch file until each credential is minted (finding 4)", async () => {
    const a = "https://store.blob.core.windows.net/cipansor-documents/a.pdf";
    let release: (v: {
      url: string;
      expiresAt: number | null;
    }) => void = () => {};
    mockResolve.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const { result } = renderHook(() => useResolvedFileUrls([a]));
    // Nothing yet: not even the raw reference.
    expect(result.current[a] ?? null).toBeNull();
    expect(mockResolve).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ url: `${a}?sig=x`, expiresAt: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current[a]).toBe(`${a}?sig=x`));
  });

  it("keeps the last good credential for a batch entry when its refresh fails", async () => {
    vi.useFakeTimers();
    const a = "https://store.blob.core.windows.net/cipansor-documents/a.pdf";
    const ttlMs = 30 * 60 * 1000;
    mockResolve
      .mockResolvedValueOnce({
        url: `${a}?sig=first`,
        expiresAt: Date.now() + ttlMs,
      })
      .mockResolvedValueOnce({ url: a, expiresAt: null });

    const { result } = renderHook(() => useResolvedFileUrls([a]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current[a]).toBe(`${a}?sig=first`);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ttlMs - REFRESH_MARGIN_MS + 1);
    });
    // The failed refresh must not downgrade to the raw url.
    expect(result.current[a]).toBe(`${a}?sig=first`);
  });
});
