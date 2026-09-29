import * as fs from "fs";
import * as path from "path";
import type { Page } from "@playwright/test";
import { generate as generateTotp } from "otplib";

/**
 * API-based authentication for e2e tests.
 *
 * Driving the login form is brittle (and impossible for admins, who are forced
 * through a 2FA gate). Instead we authenticate against the real API — completing
 * the 2FA challenge with a TOTP derived from the seed's fixed secret — and inject
 * the resulting session into the browser.
 *
 * The browser session is now an HttpOnly cookie the page's JavaScript cannot
 * read; `injectSession` writes that cookie (Playwright can, even HttpOnly) plus
 * the readable CSRF cookie, and seeds only the *user* into localStorage so the
 * UI shell renders before `/auth/me` answers. The API helpers below keep using
 * the bearer token — they opt in with `X-Client: bearer`.
 *
 * Requires the API seeded with `E2E_FIXED_2FA=1` so admin accounts share a known
 * TOTP secret.
 */

const API_URL = process.env.API_URL || "http://localhost:3001/api";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const FIXED_2FA_SECRET =
  process.env.E2E_2FA_SECRET || "NTGHH5U5LDHIYARFFNGFQKQHARJU7GBE";

/** Cookie names issued by the API (apps/api/src/modules/auth/auth.cookies.ts). */
export const ACCESS_COOKIE = "cipansor_at";
export const REFRESH_COOKIE = "cipansor_rt";
export const CSRF_COOKIE = "cipansor_csrf";
export const PRINCIPAL_COOKIE = "cipansor_principal";

/**
 * The slim routing cookie the Next middleware reads (no API round trip).
 * Derived from the authenticated user, the same values the API writes at login.
 */
function principalValue(session: {
  user: Record<string, unknown> & { role?: string; id?: string };
}): string {
  const user = session.user as {
    id?: string;
    role?: string;
    userRoles?: Array<{ isPrimary?: boolean; role?: { code?: string } }>;
  };
  const primary =
    user.userRoles?.find((a) => a?.isPrimary) ?? user.userRoles?.[0];
  return JSON.stringify({
    id: user.id ?? "",
    role: user.role ?? primary?.role?.code ?? "",
    roleCode: primary?.role?.code ?? user.role ?? "",
  });
}

/** A stable double-submit value; the API only requires cookie === header. */
export const E2E_CSRF_TOKEN = "e2e-csrf-token";

export interface SeedUser {
  email: string;
  password: string;
}

/** Seed credentials, keyed by a friendly role name. */
export const SEED_USERS = {
  superAdmin: {
    email: "superadmin@cipansor.or.id",
    password: "SuperAdmin123!",
  },
  adminSdit: { email: "admin.sdit@cipansor.or.id", password: "Admin123!" },
  teacher: { email: "fatimah@cipansor.or.id", password: "Teacher123!" },
  parent: { email: "parent3@cipansor.or.id", password: "Parent123!" },
  student: { email: "student3@cipansor.or.id", password: "Student123!" },
  // The three yayasan organs, each with one step in ratifying a yayasan
  // document (perencanaan-pengesahan.spec.ts). Legacy UNIT_ADMIN, so CI's
  // E2E_FIXED_2FA seed gives them the fixed TOTP secret like any admin.
  ketuaPengurus: {
    email: "yayasan.ketua@cipansor.or.id",
    password: "Cipansor123!",
  },
  pengawas: {
    email: "yayasan.pengawas@cipansor.or.id",
    password: "Cipansor123!",
  },
  pembina: {
    email: "yayasan.pembina@cipansor.or.id",
    password: "Cipansor123!",
  },
} satisfies Record<string, SeedUser>;

export type SeedRole = keyof typeof SEED_USERS;

export interface AuthSession {
  user: Record<string, unknown> & { role?: string; id?: string };
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

async function postJson(path: string, body: unknown, bearer?: string) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Ask for the tokens in the body: a cookie jar is awkward from fetch and
      // the API helpers need a raw bearer for subsequent requests.
      "x-client": "bearer",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { json, setCookie: res.headers.get("set-cookie") ?? "" };
  } catch {
    // Non-JSON (e.g. the rate limiter's plain "Too many requests" body).
    throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 120)}`);
  }
}

/** Pull a cookie value out of a `Set-Cookie` header string. */
function cookieFromSetCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`));
  return match ? match[1] : null;
}

// Cache sessions per email (per worker process) so we don't re-run the login +
// 2FA flow in every beforeEach — that quickly trips the 2FA rate limiter.
const sessionCache = new Map<string, AuthSession>();

/**
 * Cross-worker session cache written by global-setup (one real login + 2FA per
 * role per run). Without it every parallel worker re-authenticates the admin
 * roles and the strict 2FA rate limiter (10/15min) 429s most of the suite.
 */
export const SESSIONS_FILE = path.join(__dirname, "../../.auth/sessions.json");

function readSessionsFile(): Record<string, AuthSession> {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
  } catch {
    return {};
  }
}

// Failed logins are cached too: without this, every subsequent test in the
// worker re-attempts the 2FA flow, hammering (and re-heating) the rate
// limiter, which turns one warm-limiter setup failure into a full-suite
// cascade of 429s.
const failureCache = new Map<string, Error>();

/** Authenticate against the API, transparently completing 2FA when required. */
export async function apiLogin(user: SeedUser): Promise<AuthSession> {
  const fileSessions = readSessionsFile();
  const cached = sessionCache.get(user.email) ?? fileSessions[user.email];
  if (cached) {
    sessionCache.set(user.email, cached);
    return cached;
  }
  const priorFailure = failureCache.get(user.email);
  if (priorFailure) throw priorFailure;

  // If global-setup ran (sessions file exists) but couldn't authenticate this
  // seed role, don't have every worker retry the 2FA flow — fail fast.
  const isSeedRole = Object.values(SEED_USERS).some(
    (u) => u.email === user.email,
  );
  if (isSeedRole && fs.existsSync(SESSIONS_FILE)) {
    const err = new Error(
      `global-setup failed to pre-authenticate ${user.email} (see setup logs); ` +
        "not retrying per-test to avoid hammering the 2FA rate limiter.",
    );
    failureCache.set(user.email, err);
    throw err;
  }

  try {
    const session = await apiLoginUncached(user);
    sessionCache.set(user.email, session);
    return session;
  } catch (error) {
    failureCache.set(user.email, error as Error);
    throw error;
  }
}

async function apiLoginUncached(user: SeedUser): Promise<AuthSession> {
  const login = await postJson("/auth/login", {
    email: user.email,
    password: user.password,
  });
  const data = login.json?.data;
  if (!data)
    throw new Error(
      `Login failed for ${user.email}: ${JSON.stringify(login.json)}`,
    );

  // Admin accounts are gated behind 2FA; complete it with a fresh TOTP.
  if (data.requiresTwoFactor) {
    const token = await generateTotp({ secret: FIXED_2FA_SECRET });
    const verified = await postJson(
      "/auth/2fa/login",
      { token },
      data.tempToken,
    );
    if (!verified.json?.data?.accessToken) {
      throw new Error(
        `2FA login failed for ${user.email}: ${JSON.stringify(verified.json)}`,
      );
    }
    return {
      ...(verified.json.data as Omit<AuthSession, "csrfToken">),
      csrfToken:
        cookieFromSetCookie(verified.setCookie, CSRF_COOKIE) ?? E2E_CSRF_TOKEN,
    };
  }

  if (data.requiresTwoFactorSetup) {
    throw new Error(
      `${user.email} requires 2FA SETUP — seed the API with E2E_FIXED_2FA=1 so admins have a known secret.`,
    );
  }

  if (!data.accessToken) {
    throw new Error(
      `Unexpected login response for ${user.email}: ${JSON.stringify(data)}`,
    );
  }
  return {
    ...(data as Omit<AuthSession, "csrfToken">),
    csrfToken:
      cookieFromSetCookie(login.setCookie, CSRF_COOKIE) ?? E2E_CSRF_TOKEN,
  };
}

/**
 * Inject a session into the page's origin.
 *
 * Playwright writes the HttpOnly session cookie directly — the browser would
 * refuse `document.cookie` for it, but the context can still hold it — plus the
 * readable CSRF cookie the axios interceptor echoes. localStorage gets only the
 * *user*, the way the (now credential-free) persist store does. Call before
 * navigating to a protected route.
 */
export async function injectSession(page: Page, session: AuthSession) {
  const authStorage = JSON.stringify({
    state: { user: session.user, isAuthenticated: true },
    version: 0,
  });

  const expires = Math.floor(Date.now() / 1000) + 86400;
  const host = new URL(BASE_URL).hostname;
  await page.context().addCookies([
    {
      name: ACCESS_COOKIE,
      value: session.accessToken,
      domain: host,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires,
    },
    {
      name: REFRESH_COOKIE,
      value: session.refreshToken,
      domain: host,
      // The API scopes this to the auth endpoints; mirror it, or logout (which
      // clears path /api/auth) leaves a stray /-scoped cookie behind.
      path: "/api/auth",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires,
    },
    {
      name: PRINCIPAL_COOKIE,
      value: principalValue(session),
      domain: host,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires,
    },
    {
      name: CSRF_COOKIE,
      value: session.csrfToken,
      domain: host,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
      expires,
    },
  ]);

  // localStorage so the store rehydrates the shell. addInitScript runs before
  // app JS on every load, so a reload keeps it.
  await page.addInitScript(
    ([storage]) => {
      localStorage.setItem("auth-storage", storage);
    },
    [authStorage] as const,
  );
}

/**
 * Authenticated JSON request against the real API. For spec data setup /
 * lookup (e.g. find a seeded record's id, create a fixture row, clean up).
 */
export async function apiRequest<T = unknown>(
  session: AuthSession,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  apiPath: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_URL}${apiPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `${method} ${apiPath} → ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `${method} ${apiPath} → non-JSON response: ${text.slice(0, 120)}`,
    );
  }
}

/** Convenience: log in as a seed role and inject the session into the page. */
export async function loginAs(
  page: Page,
  role: SeedRole,
): Promise<AuthSession> {
  const session = await apiLogin(SEED_USERS[role]);
  await injectSession(page, session);
  return session;
}

/**
 * Build a Playwright storageState object for a session, mirroring injectSession
 * (cookies the middleware reads + the zustand-persisted localStorage). Used by
 * global-setup to write `.auth/<role>.json` so specs can `test.use({ storageState })`.
 */
export function buildStorageState(session: AuthSession) {
  const origin = new URL(BASE_URL).origin;
  const authStorage = JSON.stringify({
    state: { user: session.user, isAuthenticated: true },
    version: 0,
  });
  const expires = Math.floor(Date.now() / 1000) + 86400;
  return {
    cookies: [
      {
        name: ACCESS_COOKIE,
        value: session.accessToken,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
      {
        name: REFRESH_COOKIE,
        value: session.refreshToken,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
      {
        name: PRINCIPAL_COOKIE,
        value: principalValue(session),
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
      {
        name: CSRF_COOKIE,
        value: session.csrfToken,
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      },
    ].map((c) => ({
      ...c,
      domain: new URL(BASE_URL).hostname,
      path: c.name === REFRESH_COOKIE ? "/api/auth" : "/",
      expires,
    })),
    origins: [
      {
        origin,
        localStorage: [{ name: "auth-storage", value: authStorage }],
      },
    ],
  };
}
