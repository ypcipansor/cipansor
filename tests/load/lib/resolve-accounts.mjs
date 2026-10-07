// Resolve the load-test logins from the checkout, never hardcoded.
//
// The single source of truth for demo accounts and their shared password is
// packages/shared/src/types/demo-accounts.ts (see its header). This reads that
// file and emits, as JSON, the accounts a load run may sign in as: one that
// needs no second factor per role group that has such an account, plus the
// shared password.
//
// Why "no second factor": a seeded admin or unit head requires 2FA setup and
// its password alone cannot start a session
// (SECOND_FACTOR_ROLE_CODES, packages/shared/src/roles.ts). A load test is not
// a place to solve TOTP, so it signs in only as plain staff / teacher /
// parent / student accounts, which the seed creates without 2FA. The roles
// that need 2FA are the very ones the load run must not use.
//
// Usage:
//   node tests/load/lib/resolve-accounts.mjs            # JSON to stdout
//   node tests/load/lib/resolve-accounts.mjs --check    # verify a baseline exists

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const accountsFile = resolve(repoRoot, "packages/shared/src/types/demo-accounts.ts");
const rolesFile = resolve(repoRoot, "packages/shared/src/roles.ts");

const SCHOOL_PREFIXES = ["TKQ", "SDIT", "SMPIT", "SMAQ"];

/**
 * Expand one role list from roles.ts. Entries are a string literal, a spread
 * of another exported list (`...GOVERNANCE_ROLE_CODES`), or the `perSchool`
 * helper (`perSchool("GURU")`). Recursive because the groups nest two deep
 * (`SECOND_FACTOR_ROLE_CODES` -> `ADMIN_ROLE_CODES` -> `perSchool("ADMIN")`).
 */
function readRoleList(source, name, resolving = new Set()) {
  if (resolving.has(name)) throw new Error(`circular role list: ${name}`);
  resolving.add(name);

  const start = source.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`role list not found in roles.ts: ${name}`);
  const open = source.indexOf("[", start);
  const close = source.indexOf("];", open);
  if (open === -1 || close === -1) throw new Error(`malformed role list: ${name}`);
  const body = source.slice(open + 1, close);

  const out = [];
  for (const raw of body.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const spread = entry.match(/^\.\.\.([A-Z_]+)$/);
    if (spread) {
      out.push(...readRoleList(source, spread[1], resolving));
      continue;
    }
    const perSchool = entry.match(/^perSchool\("([A-Z]+)"\)$/);
    if (perSchool) {
      out.push(...SCHOOL_PREFIXES.map((p) => `${p}_${perSchool[1]}`));
      continue;
    }
    const literal = entry.match(/^"([A-Z_]+)"$/);
    if (literal) out.push(literal[1]);
  }

  resolving.delete(name);
  return out;
}

function parseAccounts(source) {
  const passwordMatch = source.match(/DEMO_PASSWORD\s*=\s*"([^"]+)"/);
  if (!passwordMatch) throw new Error("DEMO_PASSWORD not found in demo-accounts.ts");

  const re = /roleCode:\s*"([A-Z_]+)"[\s\S]*?email:\s*"([^"]+)"/g;
  const accounts = [];
  let match;
  while ((match = re.exec(source)) !== null) {
    accounts.push({ roleCode: match[1], email: match[2] });
  }
  if (accounts.length === 0) throw new Error("no demo accounts parsed");
  return { password: passwordMatch[1], accounts };
}

function main() {
  const showAll = process.argv.includes("--all");
  const source = readFileSync(accountsFile, "utf8");
  const roles = readFileSync(rolesFile, "utf8");
  const { password, accounts } = parseAccounts(source);

  const needsSecondFactor = new Set(readRoleList(roles, "SECOND_FACTOR_ROLE_CODES"));

  // Eligible = a seeded account this run may sign in as: no second factor.
  // Everything else (admins, unit heads, yayasan organs) cannot start a
  // password-only session and is excluded by construction.
  const eligible = accounts.filter((a) => !needsSecondFactor.has(a.roleCode));
  if (eligible.length === 0) {
    throw new Error("no non-2FA demo account found — cannot run load without a login");
  }

  // The default pool stays tiny because /auth/login is rate-limited to 5/min
  // and the ceiling is a production default that must not be relaxed for a
  // load test. Three VUs (a teacher, a pesantren staff member, a parent) cover
  // a school portal, a pesantren portal and the wali santri portal without
  // touching that ceiling.
  const DEFAULT_POOL_ROLES = ["SDIT_GURU", "USTADZ", "SDIT_ORANG_TUA"];
  const selected = [];
  if (showAll) {
    selected.push(...eligible);
  } else {
    for (const roleCode of DEFAULT_POOL_ROLES) {
      const match = eligible.find((a) => a.roleCode === roleCode);
      if (match) selected.push(match);
    }
    // Fall back to the first eligible accounts if the preferred roles are
    // renamed, so the run still has a login rather than failing on a name.
    for (const account of eligible) {
      if (selected.length >= DEFAULT_POOL_ROLES.length) break;
      if (!selected.includes(account)) selected.push(account);
    }
  }

  process.stdout.write(
    JSON.stringify({ password, accounts: selected, count: selected.length }, null, 2) + "\n"
  );
}

main();
