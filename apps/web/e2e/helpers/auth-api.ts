import * as fs from "fs";
import * as path from "path";
import type { Page } from "@playwright/test";
import { generate as generateTotp } from "otplib";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ROUTING_COOKIE,
} from "@cipansor/shared";

/**
 * API-based authentication for e2e tests.
 *
 * Driving the login form is brittle (and impossible for admins, who are forced
 * through a 2FA gate). Instead we authenticate against the real API — completing
 * the 2FA challenge with a TOTP derived from the seed's fixed secret — and inject
 * the resulting session into the browser exactly the way the app's auth store
 * does (localStorage + the cookies the Next middleware reads).
 *
 * Requires the API seeded with `E2E_FIXED_2FA=1` so admin accounts share a known
 * TOTP secret.
 */

const API_URL = process.env.API_URL || "http://localhost:3001/api";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const FIXED_2FA_SECRET =
  process.env.E2E_2FA_SECRET || "NTGHH5U5LDHIYARFFNGFQKQHARJU7GBE";

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
  user: Record<string, unknown> & { role?: string };
  accessToken: string;
  refreshToken: string;
  /**
   * The **server-signed** `cipansor_routing` cookie value, exactly as the API
   * set it. `middleware.ts` only accepts a routing cookie whose MAC verifies, so
   * the helper must forward this value verbatim; a hand-encoded JSON blob would
   * be treated as forged and the session would fail closed.
   */
  routing?: string;
}

async function postJson(
  path: string,
  body: unknown,
  bearer?: string,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Non-JSON (e.g. the rate limiter's plain "Too many requests" body).
    throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 120)}`);
  }
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
  // The helper acts as the native Bearer client: it needs the raw pair to seed
  // Playwright's cookie jar and to drive `apiRequest`, which a browser session
  // no longer exposes in the response body. `X-Client-Type: native` is the
  // documented opt-in for exactly that (`docs/MOBILE_API.md`).
  const nativeHeaders = { "X-Client-Type": "native" };
  const login = await postJson(
    "/auth/login",
    {
      email: user.email,
      password: user.password,
    },
    undefined,
    nativeHeaders,
  );
  const data = login?.data;
  if (!data)
    throw new Error(`Login failed for ${user.email}: ${JSON.stringify(login)}`);

  // Admin accounts are gated behind 2FA; complete it with a fresh TOTP.
  if (data.requiresTwoFactor) {
    const token = await generateTotp({ secret: FIXED_2FA_SECRET });
    const verified = await postJson(
      "/auth/2fa/login",
      { token },
      data.tempToken,
      nativeHeaders,
    );
    if (!verified?.data?.accessToken) {
      throw new Error(
        `2FA login failed for ${user.email}: ${JSON.stringify(verified)}`,
      );
    }
    return verified.data as AuthSession;
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
  return data as AuthSession;
}

/**
 * The persisted `auth-storage` JSON for a session — the form the store writes
 * to localStorage.
 */
function persistedAuthStorage(session: AuthSession): string {
  return JSON.stringify({
    state: { user: session.user, isAuthenticated: true },
    version: 0,
  });
}

/** The cookies the middleware and API read for a session. */
function authCookies(session: AuthSession) {
  const cookies = [
    { name: ACCESS_TOKEN_COOKIE, value: session.accessToken },
    { name: REFRESH_TOKEN_COOKIE, value: session.refreshToken },
  ];
  if (session.routing) {
    cookies.push({
      name: ROUTING_COOKIE,
      value: session.routing,
    });
  }
  return cookies;
}

/**
 * Inject a session into the page's origin.
 *
 * The session is entirely server-issued cookies now: the API's
 * `access_token` / `refresh_token` / `cipansor_routing`. `addCookies` names them
 * with `url: BASE_URL`; Playwright stores cookies by host, so a `localhost`
 * cookie is presented to the API on `localhost:3001` too. The zustand store's
 * `auth-storage` (the non-credential user blob) is still seeded from the API
 * session so the shell renders before `/auth/me` answers.
 */
export async function injectSession(page: Page, session: AuthSession) {
  const authStorage = persistedAuthStorage(session);

  await page.context().addCookies(
    authCookies(session).map((c) => ({
      ...c,
      url: BASE_URL,
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    })),
  );

  // localStorage carries only the non-credential user blob. addInitScript runs
  // before app JS on every load.
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
  const authStorage = persistedAuthStorage(session);
  return {
    cookies: authCookies(session).map((c) => ({
      ...c,
      domain: new URL(BASE_URL).hostname,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 86400,
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    })),
    origins: [
      {
        origin,
        localStorage: [{ name: "auth-storage", value: authStorage }],
      },
    ],
  };
}
