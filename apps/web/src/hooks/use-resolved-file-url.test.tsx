import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useResolvedFileUrl } from "./use-resolved-file-url";

vi.mock("@/lib/files", () => ({
  resolveFileUrl: vi.fn(async (url: string) => `${url}?sig=sas`),
}));

import { resolveFileUrl } from "@/lib/files";

describe("useResolvedFileUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for a missing url without calling the resolver", () => {
    const { result } = renderHook(() => useResolvedFileUrl(null));
    expect(result.current).toBeNull();
    expect(resolveFileUrl).not.toHaveBeenCalled();
  });

  it("mints a SAS for a private blob and swaps in the signed url", async () => {
    const raw = "https://store.blob.core.windows.net/cipansor-documents/ktp.pdf";
    const { result } = renderHook(() => useResolvedFileUrl(raw));

    // The raw url is shown immediately, then upgraded to the signed one.
    expect(result.current).toBe(raw);
    await waitFor(() => expect(result.current).toBe(`${raw}?sig=sas`));
    expect(resolveFileUrl).toHaveBeenCalledWith(raw);
  });

  it("keeps the raw url when the resolver refuses it", async () => {
    // An external or orphan reference must not blank the link: the page still
    // shows what the record holds.
    (resolveFileUrl as any).mockRejectedValueOnce(new Error("not found"));
    const raw = "https://store.blob.core.windows.net/cipansor-documents/none.pdf";
    const { result } = renderHook(() => useResolvedFileUrl(raw));

    await waitFor(() => expect(result.current).toBe(raw));
  });
});
