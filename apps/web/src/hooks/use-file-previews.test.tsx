import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFilePreviews } from "./use-file-previews";

/**
 * The wizards leak a blob URL per picked-then-removed (or abandoned) preview
 * unless each one is revoked. `useFilePreviews` is the single owner of those
 * URLs, so pin both release routes: an explicit remove and unmount.
 */

function file(name: string) {
  return new File(["x"], name, { type: "image/png" });
}

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
