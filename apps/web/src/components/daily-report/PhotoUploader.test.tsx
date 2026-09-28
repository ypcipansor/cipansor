import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { PhotoUploader, type PhotoItem } from "./PhotoUploader";

/**
 * A preview URL keeps its file's bytes alive until revoked. `removePhoto`
 * freed the URL of a photo the user deleted, but a photo still present when
 * the uploader unmounts (e.g. the user leaves the wizard) leaked. Pin the
 * unmount path here.
 */
describe("PhotoUploader blob URL cleanup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("revokes every outstanding blob: preview URL on unmount", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const photos: PhotoItem[] = [
      { id: "a", url: "blob:a", order: 0 },
      { id: "b", url: "blob:b", order: 1 },
    ];

    const { unmount } = render(
      <PhotoUploader photos={photos} onChange={() => {}} maxPhotos={5} />,
    );
    unmount();

    expect(revoke).toHaveBeenCalledWith("blob:a");
    expect(revoke).toHaveBeenCalledWith("blob:b");
  });

  it("does not revoke non-blob URLs on unmount", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const photos: PhotoItem[] = [
      { id: "a", url: "https://cdn.example.com/a.png", order: 0 },
    ];

    const { unmount } = render(
      <PhotoUploader photos={photos} onChange={() => {}} maxPhotos={5} />,
    );
    unmount();

    expect(revoke).not.toHaveBeenCalled();
  });
});
