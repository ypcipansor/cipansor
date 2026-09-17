/**
 * The `auth-storage` cookie, kept inside the browser's per-cookie size limit.
 *
 * `middleware.ts` cannot read `localStorage`, so the zustand auth store mirrors
 * its persisted state into this cookie. The mirror is the *whole* persisted
 * payload — user, unit, every role assignment, the permission list — and a
 * single cookie tops out near 4 KB: Chromium's CDP rejects one over ~4084
 * encoded bytes with `Invalid cookie fields`, and a `document.cookie` write
 * past the same point is silently dropped.
 *
 * A dropped cookie is not a cosmetic failure. `getAuthState` then falls back to
 * the `accessToken` cookie, which returns `{ isAuthenticated: true }` with no
 * role — and the RBAC gate in `middleware.ts` is guarded by `role &&`, so every
 * route check is skipped. The user keeps a valid session and can open pages
 * their role does not grant.
 *
 * When the full payload does not fit we store the slice the middleware actually
 * reads — `isAuthenticated`, `user.role`, `user.userRoles[].role.code` (see
 * `getEffectiveRole` / `getPrimaryRoleCode` in `lib/rbac.ts`) — rather than drop
 * the cookie, so routing stays enforced. `localStorage` still carries the full
 * user for the store to rehydrate.
 */

/** The largest encoded cookie value browsers accept before rejecting it. */
export const MAX_AUTH_COOKIE_BYTES = 4084;

export interface CookieAuthUser {
  role?: unknown;
  userRoles?: Array<{
    isPrimary?: boolean;
    role?: { code?: string | null } | null;
  }> | null;
}

/**
 * The minimal payload `middleware.ts` can still resolve a role from.
 *
 * The assignment shape is preserved rather than flattened to a single code:
 * `getEffectiveRole` reads `isPrimary` to pick the deciding assignment, and
 * `getPrimaryRoleCode` reads the same field, so collapsing to the primary code
 * would silently change which role decides routing.
 */
export function authCookiePayload(
  user: CookieAuthUser | null | undefined,
  isAuthenticated: boolean,
): string {
  return JSON.stringify({
    state: {
      user: {
        role: user?.role ?? null,
        userRoles: Array.isArray(user?.userRoles)
          ? user.userRoles.map((a) => ({
              isPrimary: a?.isPrimary ?? false,
              role: { code: a?.role?.code ?? null },
            }))
          : [],
      },
      isAuthenticated,
    },
    version: 0,
  });
}

/**
 * Serialize a persisted auth payload for the cookie, trimming it to the slice
 * above when the full form would not fit. An unparseable payload is returned
 * untouched — the middleware's own `JSON.parse` guard already handles that, and
 * guessing here could only lose data.
 */
export function authCookieValue(persisted: string): string {
  if (encodeURIComponent(persisted).length <= MAX_AUTH_COOKIE_BYTES) {
    return persisted;
  }

  let parsed:
    | { state?: { user?: CookieAuthUser; isAuthenticated?: boolean } }
    | undefined;
  try {
    parsed = JSON.parse(persisted);
  } catch {
    return persisted;
  }

  return authCookiePayload(
    parsed?.state?.user,
    parsed?.state?.isAuthenticated === true,
  );
}
