/**
 * Client-side handoff for a WBS report's tracking token.
 *
 * The token is a bearer credential: whoever holds it can read the report and
 * post as the reporter. The submission dialog used to navigate to
 * `/public/wbs/track?ticket=…&token=…`, which puts that credential in the URL —
 * browser history, telemetry, proxy logs, copied links, and the `Referer` of
 * any third-party resource the page loads. None of those are under the
 * reporter's control, so the token must never travel in a query string.
 *
 * `sessionStorage` is the handoff: it is scoped to the tab, cleared when the
 * tab closes, and never sent to the server. The URL carries only the ticket
 * code, which is a non-secret lookup handle. If the storage entry is missing —
 * a different tab, a bookmarked URL, storage disabled — the tracking page falls
 * back to asking the reporter for the token directly.
 *
 * This is a browser-only module: every accessor tolerates a missing
 * `sessionStorage` (SSR, private mode) and returns null rather than throwing.
 */
const TOKEN_KEY_PREFIX = "wbs-tracking-token:";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    // Storage can throw when disabled by policy; treat it as absent.
    return null;
  }
}

export function storeWbsTrackingToken(
  ticketCode: string,
  trackingToken: string,
): void {
  try {
    storage()?.setItem(`${TOKEN_KEY_PREFIX}${ticketCode}`, trackingToken);
  } catch {
    // Best-effort: the reporter can still type the token on the tracking page.
  }
}

export function readWbsTrackingToken(ticketCode: string): string | null {
  try {
    return storage()?.getItem(`${TOKEN_KEY_PREFIX}${ticketCode}`) ?? null;
  } catch {
    return null;
  }
}

export function clearWbsTrackingToken(ticketCode: string): void {
  try {
    storage()?.removeItem(`${TOKEN_KEY_PREFIX}${ticketCode}`);
  } catch {
    // Nothing to do; the entry is per-tab and short-lived.
  }
}
