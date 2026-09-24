import { pengawasanAccessOf } from "@cipansor/shared";

/**
 * The governance tabs a role may actually use, in display order.
 *
 * Extracted from `app/pengawasan/page.tsx` so the ordering is testable without
 * mounting the whole page. Order is load-bearing: the first entry is the tab an
 * account lands on, and it must be one the account can see.
 */
export function visiblePengawasanTabs(roleCode: string | null | undefined): string[] {
  const access = pengawasanAccessOf(roleCode);
  const tabs: string[] = [];
  if (access.canReadAudits) tabs.push("audits");
  if (access.canHandleWbs) tabs.push("wbs");
  if (access.canReadSuspensions) tabs.push("suspensions");
  if (access.canViewArrears) tabs.push("arrears");
  if (access.canSubmitPeriodicReport) tabs.push("eoffice");
  return tabs;
}

/**
 * The tab a page should select, given the tabs currently visible and whatever
 * was selected before.
 *
 * Returns the previous selection when it is still visible, so a user who picks a
 * tab keeps it across a re-render; otherwise the first visible tab. The callers
 * mount with `""` while auth resolves, and an auth state with no governance
 * access yields `""` — never `"eoffice"`, which is what trapped a Pengawas on a
 * panel their role does not render.
 */
export function resolvePengawasanTab(
  visibleTabs: string[],
  previous: string,
): string {
  if (visibleTabs.includes(previous)) return previous;
  return visibleTabs[0] ?? "";
}
