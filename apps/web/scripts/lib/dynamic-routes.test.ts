import { describe, expect, it } from "vitest";
import {
  mergeResolved,
  matchesDynamicPattern,
  unaccountedPatterns,
} from "./dynamic-routes";

describe("mergeResolved", () => {
  it("carries a pattern's previous URL when this run resolved nothing", () => {
    // The regression Devin flagged: the previous map held a working URL for
    // /counseling/[id], this run's list call returned no row, and the old
    // resolver wrote the file without it — dropping the page from the sweep.
    const { merged, dropped } = mergeResolved(
      ["/counseling/[id]", "/inventory/[id]"],
      { "/inventory/[id]": "/inventory/new-id" },
      { "/counseling/[id]": "/counseling/old-id" },
    );
    expect(merged).toEqual({
      "/counseling/[id]": "/counseling/old-id",
      "/inventory/[id]": "/inventory/new-id",
    });
    expect(dropped).toEqual([]);
  });

  it("prefers the fresh URL over the previous one", () => {
    const { merged } = mergeResolved(
      ["/inventory/[id]"],
      { "/inventory/[id]": "/inventory/new-id" },
      { "/inventory/[id]": "/inventory/old-id" },
    );
    expect(merged["/inventory/[id]"]).toBe("/inventory/new-id");
  });

  it("reports a pattern that neither run could resolve", () => {
    const { merged, dropped } = mergeResolved(
      ["/research/themes/[id]"],
      {},
      {},
    );
    expect(merged).toEqual({});
    expect(dropped).toEqual(["/research/themes/[id]"]);
  });

  it("drops a pattern that no longer exists in the app", () => {
    const { merged } = mergeResolved(
      ["/still-here/[id]"],
      {},
      { "/removed/[id]": "/removed/x", "/still-here/[id]": "/still-here/x" },
    );
    expect(merged).toEqual({ "/still-here/[id]": "/still-here/x" });
  });
});

describe("unaccountedPatterns", () => {
  it("passes a dropped pattern the allowlist names", () => {
    expect(
      unaccountedPatterns(["/research/themes/[id]"], {
        "/research/themes/[id]": { reason: "no seeded row" },
      }),
    ).toEqual([]);
  });

  it("flags a dropped pattern the allowlist does not name", () => {
    expect(
      unaccountedPatterns(["/counseling/[id]", "/inventory/[id]"], {
        "/inventory/[id]": { reason: "no seeded row" },
      }),
    ).toEqual(["/counseling/[id]"]);
  });
});

describe("matchesDynamicPattern", () => {
  it("matches a concrete URL against its pattern", () => {
    expect(
      matchesDynamicPattern("/counseling/abc-123", "/counseling/[id]"),
    ).toBe(true);
    expect(
      matchesDynamicPattern(
        "/counseling/abc-123/edit",
        "/counseling/[id]/edit",
      ),
    ).toBe(true);
  });

  it("does not let one segment cover two", () => {
    expect(
      matchesDynamicPattern("/counseling/abc/edit", "/counseling/[id]"),
    ).toBe(false);
    expect(
      matchesDynamicPattern("/counseling/abc", "/counseling/[id]/edit"),
    ).toBe(false);
  });

  it("requires literal segments to match exactly", () => {
    expect(matchesDynamicPattern("/inventory/abc", "/counseling/[id]")).toBe(
      false,
    );
  });

  it("treats multi-param patterns positionally", () => {
    expect(
      matchesDynamicPattern(
        "/assessment/skhun/s-1/y-1",
        "/assessment/skhun/[studentId]/[academicYearId]",
      ),
    ).toBe(true);
  });
});
