import { describe, it, expect, vi, afterEach } from "vitest";
import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { useFilePreviews } from "./use-file-previews";

/**
 * The wizards leak a blob URL per picked-then-removed (or abandoned) preview
 * unless each one is revoked. `useFilePreviews` is the single owner of those
 * URLs, so pin both release routes: an explicit remove and unmount.
 *
 * Two runtime shapes get dedicated cases because they are where the preview
 * handling broke: an IPv6 origin (whose blob URL must not be re-encoded) and
 * React Strict Mode (which double-invokes state updaters, so anything that
 * creates a URL inside one registers twice and leaks one).
 */

function file(name: string) {
  return new File(["x"], name, { type: "image/png" });
}

const strict = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);

describe("useFilePreviews", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates a blob URL per added file", () => {
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:one")
      .mockReturnValueOnce("blob:two");

    const { result } = renderHook(() => useFilePreviews());
    act(() => result.current.addFiles([file("a.png"), file("b.png")]));

    expect(result.current.previews).toEqual(["blob:one", "blob:two"]);
    expect(result.current.files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
  });

  it("keeps an IPv6-origin blob URL byte-for-byte", () => {
    const ipv6Url = "blob:http://[::1]:3000/abc-123";
    vi.spyOn(URL, "createObjectURL").mockReturnValue(ipv6Url);

    const { result } = renderHook(() => useFilePreviews());
    act(() => result.current.addFiles([file("a.png")]));

    expect(result.current.previews).toEqual([ipv6Url]);
    expect(result.current.previews[0]).not.toContain("%5B");
  });

  it("creates one URL per file under Strict Mode", () => {
    // Strict Mode double-invokes state updaters. Creating the object URL inside
    // the updater registered two blobs per file and only ever revoked one, so
    // the count must stay at one.
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:one")
      .mockReturnValueOnce("blob:leaked");

    const { result } = renderHook(() => useFilePreviews(), {
      wrapper: strict,
    });
    act(() => result.current.addFiles([file("a.png")]));

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.current.previews).toEqual(["blob:one"]);
  });

  it("revokes the removed file's URL on removeAt", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:one")
      .mockReturnValueOnce("blob:two");

    const { result } = renderHook(() => useFilePreviews());
    act(() => result.current.addFiles([file("a.png"), file("b.png")]));
    act(() => result.current.removeAt(0));

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:one");
    expect(result.current.previews).toEqual(["blob:two"]);
  });

  it("revokes every outstanding URL on unmount", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:one")
      .mockReturnValueOnce("blob:two");

    const { result, unmount } = renderHook(() => useFilePreviews());
    act(() => result.current.addFiles([file("a.png"), file("b.png")]));
    unmount();

    expect(revoke).toHaveBeenCalledWith("blob:one");
    expect(revoke).toHaveBeenCalledWith("blob:two");
  });

  it("does not revoke a URL that was already removed at unmount", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:one");

    const { result, unmount } = renderHook(() => useFilePreviews());
    act(() => result.current.addFiles([file("a.png")]));
    act(() => result.current.removeAt(0));
    unmount();

    expect(revoke).toHaveBeenCalledTimes(1);
  });
});
