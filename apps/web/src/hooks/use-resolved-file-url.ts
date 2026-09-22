"use client";

import { useEffect, useRef, useState } from "react";
import { needsResolvedAccess, resolveFileWithExpiry } from "@/lib/files";

/**
 * Refresh a temporary file credential this long before it actually expires.
 * Minting is cheap and a small margin costs nothing; a link that dies while the
 * user is still looking at the page is the failure this avoids.
 */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Keep at least this long between refreshes, even if a TTL looks very short. */
const MIN_REFRESH_DELAY_MS = 30 * 1000;

/**
 * The URL a browser element may receive, or null while the credential is still
 * in flight.
 *
 * A protected reference (private Azure blob or local `/uploads` file) is ONLY
 * usable with a short-lived SAS / file token. Emitting the raw reference before
 * that credential exists makes the browser issue a request that is guaranteed
 * to 403 (and may render a broken `<img>`/media element). The raw reference is
 * therefore never returned: the hook returns null until a credentialised URL is
 * ready.
 */
function browserSafeUrl(
  source: string,
  resolved: string,
  protectedRef: boolean,
): string | null {
  if (!resolved) return null;
  // The resolver returns the input unchanged when it could not mint a
  // credential, so "still the source" means "not ready".
  if (protectedRef && resolved === source) return null;
  return resolved;
}

/**
 * Resolve a persisted upload reference into a browser-usable URL, and keep it
 * usable while the page stays open.
 *
 * A private Azure blob needs a SAS, and a local `/uploads` file needs a
 * single-file token; both are short-lived. Resolving once and caching the
 * result means an image still on screen an hour later points at an expired
 * link, so this re-resolves shortly before the credential dies.
 *
 * Findings this hook fixes:
 *
 *  - **No raw flash.** The previous version published the stable/raw reference
 *    for a private file immediately, then swapped in the credential — so the
 *    browser fired a failing request and showed a broken element on every mount
 *    and every refresh. A protected reference is now `null` until it is
 *    credentialised.
 *  - **No credential downgrade on refresh.** When a refresh fails, the last
 *    good credentialised URL is kept rather than reverting to the raw link.
 *  - **No stale credential across inputs.** Changing `url` clears the previous
 *    URL's resolved value, so one file's SAS/token is never rendered for
 *    another.
 *
 * The timer is cleared on unmount and before every re-run, and a resolution
 * that lands after a re-run or unmount is discarded, so a page navigated away
 * from never fires a late `setState`, and no timer is left behind.
 */
export function useResolvedFileUrl(
  url: string | null | undefined,
): string | null {
  const [resolved, setResolved] = useState<string | null>(() => {
    // A public/external URL needs no credential and can render immediately; a
    // protected one must wait for its SAS/token.
    if (!url || needsResolvedAccess(url)) return null;
    return url;
  });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);
  const currentUrl = useRef<string | null>(url ?? null);

  useEffect(() => {
    active.current = true;
    let disposed = false;
    const source = url ?? null;
    const changed = currentUrl.current !== source;
    currentUrl.current = source;

    const clearTimer = () => {
      if (refreshTimer.current !== null) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };

    const run = async (isRefresh: boolean) => {
      if (!source) {
        if (!disposed) setResolved(null);
        return;
      }
      const protectedRef = needsResolvedAccess(source);

      if (!protectedRef) {
        // A public blob or external URL needs no credential: expose it and
        // never call the resolver.
        if (!disposed) setResolved(source);
        return;
      }

      if (changed && !disposed) {
        // A different input must never render the previous URL's credential.
        setResolved(null);
      }

      let result: { url: string; expiresAt: number | null };
      try {
        result = await resolveFileWithExpiry(source);
      } catch {
        // `resolveFileWithExpiry` swallows its own errors, but guard the await
        // so a rejection here can never surface as an unhandled rejection.
        result = { url: source, expiresAt: null };
      }
      if (disposed || !active.current) return;

      const next = browserSafeUrl(source, result.url, protectedRef);
      if (next === null) {
        // No credential (a failed mint). On a refresh keep the last good URL
        // rather than dropping to the raw reference; on first resolution stay
        // in the loading state.
        if (!isRefresh && !disposed) setResolved(null);
        return;
      }
      setResolved(next);

      clearTimer();
      if (result.expiresAt !== null) {
        const delay = Math.max(
          result.expiresAt - Date.now() - REFRESH_MARGIN_MS,
          MIN_REFRESH_DELAY_MS,
        );
        refreshTimer.current = setTimeout(() => {
          void run(true);
        }, delay);
      }
    };

    void run(false);

    return () => {
      disposed = true;
      active.current = false;
      clearTimer();
    };
  }, [url]);

  return resolved;
}

/**
 * Resolve a list of persisted upload references, keyed by the original URL.
 *
 * Same guarantees as {@link useResolvedFileUrl}, for pages that render a
 * grid/list of files: a protected reference is absent/null until it carries a
 * credential, a failed refresh keeps the last good value, and the result is
 * keyed by the original stable URL so a caller looks up
 * `resolvedMap[evidence.fileUrl]`.
 */
export function useResolvedFileUrls(
  urls: readonly (string | null | undefined)[],
): Record<string, string | null> {
  const [resolved, setResolved] = useState<Record<string, string | null>>({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A stable dependency: the caller rebuilds the array every render, so keying
  // the effect on the array identity would re-resolve on every render.
  const key = JSON.stringify(urls.map((u) => u ?? null));

  useEffect(() => {
    let disposed = false;
    const clearTimer = () => {
      if (refreshTimer.current !== null) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };

    const run = async (isRefresh: boolean) => {
      const settled = await Promise.all(
        urls.map(async (u) => {
          if (!u) return { source: "", url: null, expiresAt: null };
          const protectedRef = needsResolvedAccess(u);
          if (!protectedRef) {
            // Public blob / external URL: usable as-is, no resolver call.
            return { source: u, url: u, expiresAt: null };
          }
          let r: { url: string; expiresAt: number | null };
          try {
            r = await resolveFileWithExpiry(u);
          } catch {
            r = { url: u, expiresAt: null };
          }
          return {
            source: u,
            url: browserSafeUrl(u, r.url, protectedRef),
            expiresAt: r.expiresAt,
          };
        }),
      );
      if (disposed) return;

      setResolved((prev) => {
        const next: Record<string, string | null> = {};
        for (const s of settled) {
          if (!s.source) continue;
          // A failed refresh keeps the last good URL; a changed input starts
          // fresh (null for a still-uncredentialised protected file).
          next[s.source] =
            isRefresh && s.url === null && s.source in prev
              ? prev[s.source]
              : s.url;
        }
        return next;
      });

      // Refresh the whole batch shortly before whichever credential expires
      // first: they were minted together, so refreshing the set keeps a grid
      // from half-expiring and leaving some tiles broken.
      const expiries = settled
        .map((s) => s.expiresAt)
        .filter((e): e is number => e !== null);
      clearTimer();
      if (expiries.length > 0) {
        const next = Math.min(...expiries) - REFRESH_MARGIN_MS;
        const delay = Math.max(next - Date.now(), MIN_REFRESH_DELAY_MS);
        refreshTimer.current = setTimeout(() => {
          void run(true);
        }, delay);
      }
    };

    void run(false);

    return () => {
      disposed = true;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolved;
}
