/**
 * The merge-and-account step of `resolve-dynamic-routes.ts`, kept pure and
 * importable so it can be unit-tested without a running stack.
 *
 * The resolver used to overwrite `dynamic-routes.json` with only the patterns
 * it resolved in that one run. A pattern it could not reach that day vanished
 * from the file, and with it every page only that entry reached — the map is
 * the sweep's coverage contract. These two functions make the rule explicit:
 * keep the last good URL, and refuse to pass a pattern that is neither resolved
 * nor consciously allowlisted.
 */

export interface MergeResult {
  /** Every pattern that has a URL (fresh this run, or carried from before). */
  merged: Record<string, string>;
  /** Patterns with no URL in either the fresh run or the previous map. */
  dropped: string[];
}

export function mergeResolved(
  patterns: string[],
  resolved: Record<string, string>,
  previous: Record<string, string>,
): MergeResult {
  const merged: Record<string, string> = {};
  const dropped: string[] = [];
  for (const pattern of patterns) {
    const url = resolved[pattern] ?? previous[pattern];
    if (url) merged[pattern] = url;
    else dropped.push(pattern);
  }
  return { merged, dropped };
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
