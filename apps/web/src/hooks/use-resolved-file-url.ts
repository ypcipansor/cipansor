"use client";

import { useEffect, useRef, useState } from "react";
import { resolveFileWithExpiry } from "@/lib/files";

/**
 * Refresh a temporary file credential this long before it actually expires.
 * Minting is cheap and a small margin costs nothing; a link that dies while the
 * user is still looking at the page is the failure this avoids.
 */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Keep at least this long between refreshes, even if a TTL looks very short. */
const MIN_REFRESH_DELAY_MS = 30 * 1000;

/**
 * Resolve a persisted upload reference into a browser-usable URL, and keep it
 * usable while the page stays open.
 *
 * A private Azure blob needs a SAS, and a local `/uploads` file needs a
 * single-file token; both are short-lived. Resolving once and caching the
 * result means an image still on screen an hour later points at an expired
 * link, so this re-resolves shortly before the credential dies.
 *
 * The timer is cleared on unmount and before every re-run, and a resolution
 * that lands after unmount is discarded — so a page navigated away from never
 * fires a late `setState`, and no timer is left behind.
 */
export function useResolvedFileUrl(
  url: string | null | undefined,
): string | null {
  const [resolved, setResolved] = useState<string | null>(url ?? null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    let disposed = false;

    const clearTimer = () => {
      if (refreshTimer.current !== null) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };

    const run = async () => {
      if (!url) {
        if (!disposed) setResolved(null);
        return;
      }
      // Show the stable reference immediately so a re-render does not flash
      // empty while the credential is in flight.
      if (!disposed) setResolved(url);
      const { url: next, expiresAt } = await resolveFileWithExpiry(url);
      if (disposed || !active.current) return;
      setResolved(next);

      clearTimer();
      if (expiresAt !== null) {
        const delay = Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, MIN_REFRESH_DELAY_MS);
        refreshTimer.current = setTimeout(() => {
          void run();
        }, delay);
      }
    };

    void run();

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
 * Same refresh behaviour as {@link useResolvedFileUrl}, for pages that render a
 * grid/list of files. The result is keyed by the original stable URL, so a
 * caller looks up `resolvedMap[evidence.fileUrl]`.
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

    const run = async () => {
      const settled = await Promise.all(
        urls.map(async (u) => {
          if (!u) return { source: "", url: null, expiresAt: null };
          const r = await resolveFileWithExpiry(u);
          return { source: u, url: r.url, expiresAt: r.expiresAt };
        }),
      );
      if (disposed) return;

      setResolved(
        Object.fromEntries(settled.filter((s) => s.source).map((s) => [s.source, s.url])),
      );

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
          void run();
        }, delay);
      }
    };

    void run();

    return () => {
      disposed = true;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolved;
}
