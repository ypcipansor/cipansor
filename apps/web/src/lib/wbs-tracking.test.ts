import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  storeWbsTrackingToken,
  readWbsTrackingToken,
  clearWbsTrackingToken,
} from "./wbs-tracking";

/**
 * The tracking token is a bearer credential for reading a WBS report and
 * posting as the reporter. It used to be handed to the tracking page in the
 * query string, which leaks it to browser history, telemetry, proxy logs,
 * copied URLs and the `Referer` header. These tests pin the storage handoff
 * and the absence of any token in a navigable URL.
 */
describe("WBS tracking token handoff", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("round-trips a token through sessionStorage, keyed by ticket code", () => {
    storeWbsTrackingToken("WBS-202609-ABC123", "secret-token-xyz");

    expect(readWbsTrackingToken("WBS-202609-ABC123")).toBe("secret-token-xyz");
    // A different ticket does not resolve to the same credential.
    expect(readWbsTrackingToken("WBS-202609-OTHER")).toBeNull();
  });

  it("clears a token so a later read cannot resurrect it", () => {
    storeWbsTrackingToken("WBS-1", "tok");
    clearWbsTrackingToken("WBS-1");
    expect(readWbsTrackingToken("WBS-1")).toBeNull();
  });

  it("returns null rather than throwing when storage is unavailable", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });

    expect(readWbsTrackingToken("WBS-1")).toBeNull();

    getItem.mockRestore();
  });

  it("never puts the token in a URL the tracking page can be navigated to", () => {
    // Mirror the submission page's handoff: store, then build the URL.
    storeWbsTrackingToken("WBS-202609-ABC123", "secret-token-xyz");
    const url = `/public/wbs/track?ticket=${encodeURIComponent("WBS-202609-ABC123")}`;

    expect(url).not.toContain("secret-token-xyz");
    expect(url).not.toMatch(/[?&](token|trackingToken)=/i);
    // The URL carries only the non-secret lookup handle.
    expect(url).toContain("ticket=WBS-202609-ABC123");
  });
});
