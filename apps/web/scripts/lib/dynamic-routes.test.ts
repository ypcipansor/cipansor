import { describe, expect, it } from "vitest";
import {
  firstParamValue,
  mergeResolved,
  matchesDynamicPattern,
  staleCarriedPatterns,
  unaccountedPatterns,
} from "./dynamic-routes";

describe("mergeResolved", () => {
  it("carries a pattern's previous URL when this run resolved nothing", () => {
    // The regression Devin flagged: the previous map held a working URL for
    // /counseling/[id], this run's list call returned no row, and the old
    // resolver wrote the file without it — dropping the page from the sweep.
    const { merged, dropped, carried } = mergeResolved(
      ["/counseling/[id]", "/inventory/[id]"],
      { "/inventory/[id]": "/inventory/new-id" },
      { "/counseling/[id]": "/counseling/old-id" },
    );
    expect(merged).toEqual({
      "/counseling/[id]": "/counseling/old-id",
      "/inventory/[id]": "/inventory/new-id",
    });
    expect(dropped).toEqual([]);
    expect(carried).toEqual(["/counseling/[id]"]);
  });

  it("prefers the fresh URL over the previous one", () => {
    const { merged, resolved, carried } = mergeResolved(
      ["/inventory/[id]"],
      { "/inventory/[id]": "/inventory/new-id" },
      { "/inventory/[id]": "/inventory/old-id" },
    );
    expect(merged["/inventory/[id]"]).toBe("/inventory/new-id");
    expect(resolved).toEqual(["/inventory/[id]"]);
    expect(carried).toEqual([]);
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

  it("marks a carried URL stale when its id no longer exists", () => {
    // The reseed case: the list answered with no rows, so the id the previous
    // map holds is dead and the carried URL would 404.
    const { merged, carried, stale } = mergeResolved(
      ["/counseling/[id]"],
      {},
      { "/counseling/[id]": "/counseling/old-id" },
      new Set(["old-id"]),
    );
    expect(merged["/counseling/[id]"]).toBe("/counseling/old-id");
    expect(carried).toEqual(["/counseling/[id]"]);
    expect(stale).toEqual(["/counseling/[id]"]);
  });

  it("leaves a carried URL alone when its id is not known dead", () => {
    // The transient-failure case: the list never answered, so we know nothing
    // about the id and must not call the entry stale.
    const { carried, stale } = mergeResolved(
      ["/counseling/[id]"],
      {},
      { "/counseling/[id]": "/counseling/live-id" },
      new Set(["some-other-dead-id"]),
    );
    expect(carried).toEqual(["/counseling/[id]"]);
    expect(stale).toEqual([]);
  });
});

describe("firstParamValue", () => {
  it("gives the first parameter's value from a matching URL", () => {
    expect(firstParamValue("/counseling/abc", "/counseling/[id]")).toBe("abc");
    expect(
      firstParamValue("/counseling/abc/edit", "/counseling/[id]/edit"),
    ).toBe("abc");
    expect(
      firstParamValue(
        "/dormitories/d-1/rooms/r-1",
        "/dormitories/[id]/rooms/[roomId]",
      ),
    ).toBe("d-1");
  });

  it("ignores a query string on the URL", () => {
    expect(
      firstParamValue("/counseling/abc?tab=notes", "/counseling/[id]"),
    ).toBe("abc");
  });

  it("returns null when the URL is not an instance of the pattern", () => {
    expect(firstParamValue("/inventory/abc", "/counseling/[id]")).toBe(null);
    expect(firstParamValue("/counseling/abc/edit", "/counseling/[id]")).toBe(
      null,
    );
  });
});

describe("staleCarriedPatterns", () => {
  it("flags every carried URL that holds a dead id, action or not", () => {
    const merged = {
      "/counseling/[id]": "/counseling/dead",
      "/counseling/[id]/edit": "/counseling/dead/edit",
      "/inventory/[id]": "/inventory/live",
    };
    expect(
      staleCarriedPatterns(
        merged,
        ["/counseling/[id]", "/counseling/[id]/edit", "/inventory/[id]"],
        new Set(["dead"]),
      ),
    ).toEqual(["/counseling/[id]", "/counseling/[id]/edit"]);
  });

  it("flags nothing when no id is known dead", () => {
    expect(
      staleCarriedPatterns(
        { "/counseling/[id]": "/counseling/abc" },
        ["/counseling/[id]"],
        new Set(),
      ),
    ).toEqual([]);
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
