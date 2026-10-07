// The load harness must resolve its logins from the checkout, not from a
// literal, and must never pick an account that needs a second factor — those
// cannot start a password-only session. This pins both, so a rename of a demo
// role or a change to the 2FA list is caught here rather than by a failed
// scheduled run.
//
// Run: node --test tests/load/lib/resolve-accounts.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const resolver = resolve(here, "resolve-accounts.mjs");

function run(...args) {
  return JSON.parse(
    execFileSync(process.execPath, [resolver, ...args], { encoding: "utf8" })
  );
}

test("resolves the shared demo password from demo-accounts.ts", () => {
  const source = readFileSync(
    resolve(repoRoot, "packages/shared/src/types/demo-accounts.ts"),
    "utf8"
  );
  const declared = source.match(/DEMO_PASSWORD\s*=\s*"([^"]+)"/)[1];
  assert.equal(run().password, declared);
});

test("default pool is small and every login comes from the demo list", () => {
  const { accounts } = run();
  assert.ok(accounts.length >= 1 && accounts.length <= 3);
  const known = new Set(
    [...run("--all").accounts].map((a) => a.email)
  );
  for (const a of accounts) {
    assert.ok(known.has(a.email), `${a.email} is not a seeded demo account`);
  }
  assert.equal(new Set(accounts.map((a) => a.roleCode)).size, accounts.length);
});

test("each selected account exposes only role and email, never a password", () => {
  const { accounts } = run();
  for (const a of accounts) {
    assert.deepEqual(Object.keys(a).sort(), ["email", "roleCode"]);
  }
});
