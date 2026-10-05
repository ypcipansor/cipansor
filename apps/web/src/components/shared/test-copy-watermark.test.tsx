import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TEST_COPY_STAMP } from "@cipansor/shared";

/**
 * A test copy (staging) labels the screen and stamps every printed page, so
 * nothing printed from it passes for a document of the yayasan. Production,
 * and a page whose answer has not arrived, show nothing.
 */
const environment = vi.hoisted(() => ({
  data: undefined as { testCopy: boolean } | undefined,
}));
vi.mock("@/hooks/use-environment", () => ({
  useEnvironment: () => environment,
}));

import { TestCopyWatermark } from "./test-copy-watermark";

beforeEach(() => {
  environment.data = undefined;
});

describe("TestCopyWatermark", () => {
  it("labels a test copy and stamps its printed pages", () => {
    environment.data = { testCopy: true };
    render(<TestCopyWatermark />);

    expect(screen.getByRole("note")).toHaveTextContent(
      "Lingkungan uji · data demo",
    );
    const stamp = screen.getByTestId("test-copy-print-stamp");
    expect(stamp).toHaveTextContent(TEST_COPY_STAMP);
    // Hidden on screen, shown in print — and kept visible on pages that
    // print with `body * { visibility: hidden }`.
    expect(stamp.className).toMatch(/\bhidden\b/);
    expect(stamp.className).toMatch(/print:block/);
    expect(stamp.className).toMatch(/print:visible/);
  });

  it.each([
    ["production", { testCopy: false }],
    ["while the answer is not in", undefined],
  ])("shows nothing in %s", (_, data) => {
    environment.data = data;
    const { container } = render(<TestCopyWatermark />);

    expect(container).toBeEmptyDOMElement();
  });
});
