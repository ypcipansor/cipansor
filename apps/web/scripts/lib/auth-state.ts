/**
 * Session bootstrapping shared by every visual/QA script.
 *
 * `storageStateFor` existed twice — once in `screenshot-all.ts` and a slimmer,
 * subtly different copy in `probe-pages.ts` — and the two drifted: the probe
 * dropped `role.realm` from the persisted user, so the sidebar threw and every
 * probed page looked blank. Keeping one definition here means a change to the
 * session shape reaches every script at once.
 *
 * The persisted user is split deliberately:
 *  - localStorage (`auth-storage`) gets the **full** user, because that is what
 *    zustand persist rehydrates and what client components read.
 *  - the `auth-storage` cookie gets a **slim** user, because `middleware.ts`
 *    only reads `id`/`role`/`unitId`/`userRoles[].role.code` and the full object
 *    can exceed the 4 KB cookie limit (CDP rejects an oversized cookie outright).
 */
import { DEMO_ACCOUNTS } from "@cipansor/shared";

export const API_URL = process.env.API_URL || "http://localhost:3001/api";
export const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

interface SlimRole {
  isPrimary?: boolean;
  role?: { code?: string; name?: string; realm?: string };
}

export interface Session {
  accessToken: string;
  refreshToken?: string;
  user: Record<string, any>;
}

export async function loginAs(roleCode: string): Promise<Session> {
  const acc = DEMO_ACCOUNTS.find((a) => a.roleCode === roleCode);
  if (!acc) throw new Error(`no demo account for ${roleCode}`);

  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: acc.email, password: acc.password }),
  });
  const login = (await res.json()) as { data?: Session };
  if (!login.data?.accessToken) {
    throw new Error(`login failed for ${roleCode}: ${JSON.stringify(login)}`);
  }
  return login.data;
}

export function storageStateFor(session: Session) {
  const { origin, hostname } = new URL(BASE_URL);
  const u = session.user;
  const slimUser = {
    id: u.id,
    role: u.role,
    unitId: u.unitId,
    // `name` and `realm` are kept even though the middleware ignores them: the
    // cookie and localStorage share this shape, and dropping them here is what
    // previously crashed the sidebar's realm badge.
    userRoles: (u.userRoles ?? []).map((a: SlimRole) => ({
      isPrimary: a.isPrimary,
      role: {
        code: a.role?.code,
        name: a.role?.name,
        realm: a.role?.realm,
      },
    })),
  };

  const mk = (name: string, value: string) => ({
    name,
    value,
    domain: hostname,
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 86400,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  });

  return {
    cookies: [
      mk("accessToken", session.accessToken),
      mk(
        "auth-storage",
        encodeURIComponent(
          JSON.stringify({
            state: { user: slimUser, isAuthenticated: true },
            version: 0,
          }),
        ),
      ),
    ],
    origins: [
      {
        origin,
        localStorage: [
          { name: "accessToken", value: session.accessToken },
          { name: "refreshToken", value: session.refreshToken ?? "" },
          {
            name: "auth-storage",
            value: JSON.stringify({
              state: { user: session.user, isAuthenticated: true },
              version: 0,
            }),
          },
        ],
      },
    ],
  };
}
