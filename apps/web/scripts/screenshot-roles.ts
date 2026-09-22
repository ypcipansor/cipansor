/**
 * Visual QA per role: log in as each representative account, open every menu
 * item its role should see (straight from the nav registry), assert the page
 * actually opens (no bounce to a dashboard, no 404/error screen), and save a
 * screenshot per page.
 *
 * Usage (stack must be running — see scripts/dev-up.sh):
 *   ../api/node_modules/.bin/tsx scripts/screenshot-roles.ts [outDir] [roleFilter]
 *
 * Output: <outDir>/<role>/<path>.png + <outDir>/report.json, and a failure
 * summary on stdout. Exit code 1 when any page fails.
 */

import fs from "fs";
import path from "path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { generate as generateTotp } from "otplib";
import { DEMO_ACCOUNTS } from "@cipansor/shared";
import { getNavigationForRoleCode } from "../src/config/navigation";
import { getDashboardForRole, deriveLegacyRole } from "../src/lib/rbac";

/** Flatten a role's navigation groups into the list of menu paths to visit. */
function menuPathsForRole(roleCode: string): string[] {
  return getNavigationForRoleCode(roleCode).flatMap((group) =>
    group.items.map((item) => item.href),
  );
}

const API_URL = process.env.API_URL || "http://localhost:3001/api";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const FIXED_2FA_SECRET =
  process.env.E2E_2FA_SECRET || "NTGHH5U5LDHIYARFFNGFQKQHARJU7GBE";

const OUT_DIR = process.argv[2] || path.join(__dirname, "../.qa-screens");
const ROLE_FILTER = process.argv[3];

interface RoleAccount {
  label: string;
  roleCode: string;
  email: string;
  password: string;
}

// Drive the sweep off the canonical DEMO_ACCOUNTS — the single list that the API
// seed (apps/api/prisma/seed.ts) provisions and the login page advertises, one
// login per RoleCode. Using it here guarantees every account we try to log in as
// actually exists in a freshly seeded database. Demo logins do not carry 2FA, so
// the TOTP branch in `login()` below stays as a harmless fallback.
const ACCOUNTS: RoleAccount[] = DEMO_ACCOUNTS.map((acc) => ({
  label: acc.roleCode.toLowerCase().replace(/_/g, "-"),
  roleCode: acc.roleCode,
  email: acc.email,
  password: acc.password,
}));

interface Session {
  user: Record<string, unknown>;
  accessToken: string;
  refreshToken: string;
}

async function postJson(apiPath: string, body: unknown, bearer?: string) {
  const res = await fetch(`${API_URL}${apiPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ data?: Record<string, unknown> }>;
}

async function login(account: RoleAccount): Promise<Session> {
  const login = await postJson("/auth/login", {
    email: account.email,
    password: account.password,
  });
  const data = login?.data as Record<string, unknown> | undefined;
  if (!data)
    throw new Error(
      `Login failed for ${account.email}: ${JSON.stringify(login)}`,
    );

  if (data.requiresTwoFactor) {
    const token = await generateTotp({ secret: FIXED_2FA_SECRET });
    const verified = await postJson(
      "/auth/2fa/login",
      { token },
      data.tempToken as string,
    );
    if (!verified?.data?.accessToken) {
      throw new Error(
        `2FA failed for ${account.email}: ${JSON.stringify(verified)}`,
      );
    }
    return verified.data as unknown as Session;
  }
  if (!data.accessToken) {
    throw new Error(
      `Unexpected login response for ${account.email}: ${JSON.stringify(data)}`,
    );
  }
  return data as unknown as Session;
}

function storageStateFor(session: Session) {
  const origin = new URL(BASE_URL).origin;
  const authStorage = JSON.stringify({
    state: { user: session.user, isAuthenticated: true },
    version: 0,
  });
  // The session cookies are the `HttpOnly` set the API issues. A Playwright
  // storageState can seed them directly, which is what lets the script open
  // protected pages without a browser Round trip through the API.
  const cookies = [
    { name: "access_token", value: session.accessToken },
    { name: "refresh_token", value: session.refreshToken },
  ];
  const routing = (session as { routing?: Record<string, unknown> }).routing;
  if (routing) {
    cookies.push({
      name: "cipansor_routing",
      value: Buffer.from(JSON.stringify(routing), "utf8").toString("base64url"),
    });
  }
  return {
    cookies: cookies.map((c) => ({
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

interface PageResult {
  role: string;
  path: string;
  finalPath: string;
  ok: boolean;
  problems: string[];
  screenshot: string;
}

async function checkPage(
  page: Page,
  role: string,
  target: string,
  outDir: string,
): Promise<PageResult> {
  const problems: string[] = [];
  const consoleErrors: string[] = [];
  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  page.on("console", onConsole);

  try {
    await page.goto(`${BASE_URL}${target}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(1200);
  } catch (e) {
    problems.push(`navigation failed: ${(e as Error).message.split("\n")[0]}`);
  }
  page.off("console", onConsole);

  const finalPath = new URL(page.url()).pathname;
  if (finalPath !== target && !finalPath.startsWith(`${target}/`)) {
    problems.push(`bounced to ${finalPath}`);
  }

  const bodyText = (
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  ).slice(0, 4000);
  for (const marker of [
    "Application error",
    "This page could not be found",
    "Internal Server Error",
    "Unhandled Runtime Error",
  ]) {
    if (bodyText.includes(marker)) problems.push(`error text: ${marker}`);
  }
  if (/^\s*404\s*$/m.test(bodyText)) problems.push("404 page");

  const relevantConsole = consoleErrors.filter(
    (t) => !t.includes("Failed to load resource"),
  );
  if (relevantConsole.length > 0) {
    problems.push(
      `console errors: ${relevantConsole.slice(0, 2).join(" | ").slice(0, 200)}`,
    );
  }

  const file = path.join(
    outDir,
    `${target === "/" ? "root" : target.slice(1).replace(/\//g, "__")}.png`,
  );
  await page.screenshot({ path: file, fullPage: false }).catch(() => undefined);

  return {
    role,
    path: target,
    finalPath,
    ok: problems.length === 0,
    problems,
    screenshot: file,
  };
}

async function run() {
  const accounts = ROLE_FILTER
    ? ACCOUNTS.filter((a) => a.label.includes(ROLE_FILTER))
    : ACCOUNTS;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // PLAYWRIGHT_CHROMIUM points at a system/preinstalled chromium when the
  // pinned browser build for this @playwright/test version is not downloaded.
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  });
  const results: PageResult[] = [];

  for (const account of accounts) {
    const roleDir = path.join(OUT_DIR, account.label);
    fs.mkdirSync(roleDir, { recursive: true });

    let session: Session;
    try {
      session = await login(account);
    } catch (e) {
      console.error(`✗ LOGIN ${account.label}: ${(e as Error).message}`);
      results.push({
        role: account.label,
        path: "(login)",
        finalPath: "",
        ok: false,
        problems: [(e as Error).message],
        screenshot: "",
      });
      continue;
    }

    const context = await browser.newContext({
      storageState: storageStateFor(session),
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    const targets = Array.from(
      new Set([
        getDashboardForRole(
          deriveLegacyRole(account.roleCode),
          account.roleCode,
        ),
        ...menuPathsForRole(account.roleCode),
      ]),
    );

    for (const target of targets) {
      const r = await checkPage(page, account.label, target, roleDir);
      results.push(r);
      console.log(
        `${r.ok ? "✓" : "✗"} [${account.label}] ${target}${r.ok ? "" : " — " + r.problems.join("; ")}`,
      );
    }

    await context.close();
  }

  await browser.close();

  const failures = results.filter((r) => !r.ok);
  fs.writeFileSync(
    path.join(OUT_DIR, "report.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(
    `\n${results.length} pages checked, ${failures.length} failures.`,
  );
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures)
      console.log(`  [${f.role}] ${f.path}: ${f.problems.join("; ")}`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
