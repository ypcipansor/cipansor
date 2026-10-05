/**
 * The merge-and-account step of `resolve-dynamic-routes.ts`, kept pure and
 * importable so it can be unit-tested without a running stack.
 *
 * The resolver used to overwrite `dynamic-routes.json` with only the patterns
 * it resolved in that one run. A pattern it could not reach that day vanished
 * from the file, and with it every page only that entry reached — the map is
 * the sweep's coverage contract. So a pattern is kept even when this run could
 * not resolve it, with the last good URL.
 *
 * Keeping that URL is not free: after a reseed the id in it no longer exists,
 * and a sweep that visits it captures a 404 while believing the page is
 * covered. `staleIds` (the ids the previous map held that no longer exist in
 * the current data) is how the caller tells us which carried URLs are suspect.
 * A carried URL is reported as stale when it carries one of those ids — a
 * carried URL whose id is not known to be dead (e.g. the list request merely
 * failed) is reported as carried, not stale, so a transient API failure does
 * not read as a reseed.
 */

export interface MergeResult {
  /** Every pattern that has a URL (fresh this run, or carried from before). */
  merged: Record<string, string>;
  /** Patterns the run resolved to a fresh URL. */
  resolved: string[];
  /** Patterns that reused the previous map's URL. */
  carried: string[];
  /** Carried patterns whose URL carries an id known to no longer exist. */
  stale: string[];
  /** Patterns with no URL in either the fresh run or the previous map. */
  dropped: string[];
}

/**
 * The path segments of a concrete URL, without the query string.
 * `/counseling/abc/edit?x=1` -> `["counseling", "abc", "edit"]`.
 */
function concreteSegments(url: string): string[] {
  return url.split("?")[0].split("/").filter(Boolean);
}

/** The path segments of a `[param]` pattern. */
function patternSegments(pattern: string): string[] {
  return pattern.split("/").filter(Boolean);
}

/**
 * The concrete value of the pattern's *first* parameter in a URL that matches
 * its shape (`/counseling/abc` and `/counseling/abc/edit` both give `abc` for
 * `/counseling/[id]…`). This is the id a reseed replaces; the second and later
 * parameters of a multi-param pattern are not checked, but their first one is,
 * which is enough to catch a stale URL. Returns null when the URL does not
 * match the pattern at all.
 */
export function firstParamValue(url: string, pattern: string): string | null {
  const pathname = url.split("?")[0];
  if (!matchesDynamicPattern(pathname, pattern)) return null;
  const path = concreteSegments(pathname);
  const idx = patternSegments(pattern).findIndex((s) => s.startsWith("["));
  if (idx < 0 || idx >= path.length) return null;
  return path[idx];
}

/**
 * Carried patterns whose URL holds an id known to no longer exist. These are
 * the entries a reseed invalidates and the ones the caller must report as
 * failures (or refresh), because the sweep would otherwise visit an old id.
 */
export function staleCarriedPatterns(
  merged: Record<string, string>,
  carried: string[],
  staleIds: Set<string>,
): string[] {
  if (staleIds.size === 0) return [];
  return carried.filter((pattern) => {
    const id = firstParamValue(merged[pattern], pattern);
    return id !== null && staleIds.has(id);
  });
}

export function mergeResolved(
  patterns: string[],
  resolved: Record<string, string>,
  previous: Record<string, string>,
  staleIds: Set<string> = new Set(),
): MergeResult {
  const merged: Record<string, string> = {};
  const resolvedPatterns: string[] = [];
  const carried: string[] = [];
  const dropped: string[] = [];
  for (const pattern of patterns) {
    const fresh = resolved[pattern];
    if (fresh) {
      merged[pattern] = fresh;
      resolvedPatterns.push(pattern);
      continue;
    }
    const carriedUrl = previous[pattern];
    if (carriedUrl) {
      merged[pattern] = carriedUrl;
      carried.push(pattern);
    } else {
      dropped.push(pattern);
    }
  }
  return {
    merged,
    resolved: resolvedPatterns,
    carried,
    stale: staleCarriedPatterns(merged, carried, staleIds),
    dropped,
  };
}

/** The dropped patterns that `dynamic-routes.unresolved.json` does not name. */
export function unaccountedPatterns(
  dropped: string[],
  allowlisted: Record<string, unknown>,
): string[] {
  return dropped.filter((pattern) => !(pattern in allowlisted));
}

/**
 * Whether a concrete route path is an instance of a `[param]` pattern.
 * `[param]` matches exactly one path segment; every other segment is literal.
 *
 * One definition, used by `screenshot-all.ts` (to decide what the sweep still
 * needs to reach) and by `dynamic-routes.guard.test.ts` (to check each resolved
 * URL). Two copies would drift, and a mismatch there is invisible until a page
 * silently leaves the gallery.
 */
export function matchesDynamicPattern(
  routePath: string,
  pattern: string,
): boolean {
  const rx = new RegExp(
    "^" +
      pattern
        .split("/")
        .map((seg) =>
          /^\[.*\]$/.test(seg)
            ? "[^/]+"
            : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        )
        .join("/") +
      "/?$",
  );
  return rx.test(routePath);
}
