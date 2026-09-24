import type { RbacUser } from "./rbac";

/**
 * The `auth-storage` COOKIE carries only what `middleware.ts` reads.
 *
 * The zustand store persists the whole user — profile, unit, every role
 * assignment with its role object — to localStorage, and `customStorage`
 * mirrored that same string into a cookie for the middleware. Browsers drop a
 * cookie over 4 KB without a word, and the middleware then falls back to the
 * bare `accessToken`: signed in, but with no role, so no route is gated at all.
 * Measured 2026-09-24 on a copy of production: `fatimah@` (guru + wali kelas)
 * 5,705 bytes, `admin.sdit@` 4,869 bytes, the kepala sekolah 4,308 bytes
 * already on 2026-09-11. Playwright refuses such a cookie outright
 * ("Invalid cookie fields"), which is how the e2e suite noticed.
 *
 * The middleware needs exactly what `getEffectiveRole` and `getPrimaryRoleCode`
 * read: `user.role` and the PRIMARY assignment's `role.code` (the one marked
 * `isPrimary`, else the first). So the cookie keeps that one assignment and
 * nothing else — a constant few hundred bytes, however many roles or however
 * much profile a user has. localStorage still holds the full user for the UI.
 */
interface PersistedAuth {
  state?: {
    user?: (RbacUser & { id?: string }) | null;
    isAuthenticated?: boolean;
  };
  version?: number;
}

/** The persisted store JSON reduced to what the middleware reads, or null when it is not ours to read. */
export function middlewareAuthCookieValue(persisted: string): string | null {
  let parsed: PersistedAuth;
  try {
    parsed = JSON.parse(persisted) as PersistedAuth;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const user = parsed.state?.user;
  const assignments = user?.userRoles ?? [];
  const primary = assignments.find((a) => a?.isPrimary) ?? assignments[0];

  return JSON.stringify({
    state: {
      isAuthenticated: parsed.state?.isAuthenticated === true,
      user: user
        ? {
            id: user.id,
            role: user.role ?? null,
            userRoles: primary
              ? [
                  {
                    isPrimary: true,
                    role: { code: primary.role?.code ?? null },
                  },
                ]
              : [],
          }
        : null,
    },
    version: parsed.version ?? 0,
  });
}
