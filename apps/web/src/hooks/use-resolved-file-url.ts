"use client";

import { useEffect, useState } from "react";
import { resolveFileUrl } from "@/lib/files";

/**
 * Resolve a persisted upload reference into a browser-usable URL.
 *
 * Private Azure blobs (the default for generic uploads) are not readable from
 * a raw `<img src>` / `<a href>`: the browser sends no auth and the container
 * has no public access, so the request 403s. {@link resolveFileUrl} mints a
 * short-lived SAS server-side. Public blobs and local `/uploads` paths pass
 * through unchanged.
 *
 * While the SAS is in flight the previous value is kept, so a re-render with
 * the same URL does not flash empty.
 */
export function useResolvedFileUrl(
  url: string | null | undefined,
): string | null {
  const [resolved, setResolved] = useState<string | null>(url ?? null);

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    let active = true;
    setResolved(url);
    resolveFileUrl(url)
      .then((next) => {
        if (active) setResolved(next);
      })
      .catch(() => {
        if (active) setResolved(url);
      });
    return () => {
      active = false;
    };
  }, [url]);

  return resolved;
}
