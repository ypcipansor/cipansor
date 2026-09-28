import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhotoGallery, DailyReportPhotoPreview } from "./photo-gallery";

/**
 * A resolved photo URL carries a short-lived SAS/file token in its query
 * string. Next's image optimizer refuses such a source ("url" parameter is not
 * allowed), so routing it through `<Image>` rewrote the DOM `src` to
 * `/_next/image?url=…%3Ftoken%3D…` — a request that 400s, with the token
 * URL-encoded so even `src*="token="` could never match. The gallery must hand
 * the credential-bearing URL to a plain `<img>`, verbatim.
 *
 * Regression for the e2e failure
 * `daily-report-detail.spec.ts › the detail viewer resolves a private report
 * photo instead of using the raw URL (finding 14)`.
 */
const TOKEN_URL =
  "http://localhost:3001/uploads/abc-123.png?token=eyJhbGciOiJIUzI1NiJ9.payload.sig";

const photo = (url: string | null, id = "p1") => ({
  id,
  url,
  caption: "Kegiatan",
  category: "Kegiatan",
  uploadedAt: new Date("2026-01-01T00:00:00Z"),
});

describe("PhotoGallery credentialed photo sources", () => {
  it("renders a resolved token URL verbatim, never through the image optimizer", () => {
    render(<PhotoGallery photos={[photo(TOKEN_URL)]} editable={false} />);

    const img = screen.getByRole("img", { name: "Kegiatan" });
    const src = img.getAttribute("src") ?? "";

    expect(src).toContain("token=");
    // The optimizer re-encodes `=` to `%3D` and 400s on the credentialed URL.
    expect(src).not.toContain("_next/image");
  });

  it("shows a placeholder, not a broken image, while the credential is unresolved", () => {
    const { container } = render(
      <PhotoGallery photos={[photo(null)]} editable={false} />,
    );

    // `url: null` means "SAS still minting"; nothing uncredentialised is requested.
    expect(container.querySelector("img[src]")).toBeNull();
  });
});

describe("DailyReportPhotoPreview credentialed photo sources", () => {
  it("renders a resolved token URL verbatim", () => {
    const { container } = render(
      <DailyReportPhotoPreview photos={[photo(TOKEN_URL)]} />,
    );

    const img = container.querySelector("img[src]");
    const src = img?.getAttribute("src") ?? "";
    expect(src).toContain("token=");
    expect(src).not.toContain("_next/image");
  });
});
