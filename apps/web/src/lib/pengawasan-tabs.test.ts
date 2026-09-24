import { describe, it, expect } from "vitest";
import { resolvePengawasanTab, visiblePengawasanTabs } from "./pengawasan-tabs";

/**
 * Regression for the blank governance page: the tab bar was uncontrolled, so
 * its `defaultValue` was read once at mount — while the auth store was still
 * empty and every `can*` flag was false. It fell through to `"eoffice"`, a
 * panel a Pengawas never renders, leaving an empty page with no tab to click
 * back to. The tab is now resolved from the visible set on every change.
 */
describe("visiblePengawasanTabs", () => {
  it("returns no tab while the role is unknown (auth still loading)", () => {
    expect(visiblePengawasanTabs(null)).toEqual([]);
    expect(visiblePengawasanTabs(undefined)).toEqual([]);
    expect(visiblePengawasanTabs("")).toEqual([]);
  });

  it("gives a Pengawas the audit, WBS, suspension and reports tabs", () => {
    const tabs = visiblePengawasanTabs("YAYASAN_PENGAWAS");
    expect(tabs).toEqual(["audits", "wbs", "suspensions", "arrears", "eoffice"]);
  });

  it("gives a unit treasurer the audit and arrears tabs, never eoffice", () => {
    const tabs = visiblePengawasanTabs("SDIT_BENDAHARA");
    expect(tabs).toEqual(["audits", "arrears"]);
    expect(tabs).not.toContain("eoffice");
  });

  it("gives a school teacher only the audit tab", () => {
    expect(visiblePengawasanTabs("SDIT_GURU")).toEqual(["audits"]);
  });

  it("gives a Super Admin every tab, in display order", () => {
    expect(visiblePengawasanTabs("SUPER_ADMIN")).toEqual([
      "audits",
      "wbs",
      "suspensions",
      "arrears",
      "eoffice",
    ]);
  });
});

describe("resolvePengawasanTab", () => {
  it("keeps the selection when it is still visible", () => {
    expect(resolvePengawasanTab(["audits", "wbs"], "wbs")).toBe("wbs");
  });

  it("falls back to the first visible tab, never eoffice, when the selection is hidden", () => {
    // The delayed-auth case: mount resolves to "" and the role has no eoffice.
    expect(resolvePengawasanTab(["audits", "wbs", "suspensions"], "")).toBe("audits");
  });

  it("re-selects when access shrinks after a role switch", () => {
    // A Super Admin was on `eoffice`, then switched to a role that cannot
    // report. The panel must not stay pointed at a tab that is gone.
    expect(resolvePengawasanTab(["arrears"], "eoffice")).toBe("arrears");
  });

  it("returns empty when the account may see nothing", () => {
    expect(resolvePengawasanTab([], "eoffice")).toBe("");
  });
});
