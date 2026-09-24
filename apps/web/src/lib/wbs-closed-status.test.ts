import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLOSED_WBS_STATUSES,
  WBS_STATUSES,
  isClosedWbsStatus,
} from "@cipansor/shared";

/**
 * A terminal WBS case is immutable for BOTH sides of the thread. The API
 * refuses a handler comment under its row lock; the web must hide the reply
 * control for the same statuses, or the operator is offered a button whose only
 * outcome is a 409. These pin the shared contract used by both sides.
 */
describe("closed WBS statuses", () => {
  it("is a subset of the known statuses", () => {
    for (const status of CLOSED_WBS_STATUSES) {
      expect(WBS_STATUSES).toContain(status);
    }
  });

  it("treats SELESAI and TIDAK_DAPAT_DITINDAKLANJUTI as terminal", () => {
    expect(isClosedWbsStatus("SELESAI")).toBe(true);
    expect(isClosedWbsStatus("TIDAK_DAPAT_DITINDAKLANJUTI")).toBe(true);
  });

  it("leaves the in-progress statuses open", () => {
    for (const status of [
      "DIAJUKAN",
      "DALAM_PENYELIDIKAN",
      "DITINDAKLANJUTI",
    ]) {
      expect(isClosedWbsStatus(status)).toBe(false);
    }
  });

  it("drives the reply control from the shared predicate, not a local list", () => {
    // A local literal in the page is exactly how the API and the UI drifted
    // before; the guard fails if the page stops consulting the shared rule.
    const page = readFileSync(
      join(__dirname, "../app/pengawasan/page.tsx"),
      "utf8",
    );
    expect(page).toContain("isClosedWbsStatus");
  });
});
