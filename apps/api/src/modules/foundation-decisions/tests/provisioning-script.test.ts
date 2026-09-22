import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Finding B & D — the local provisioning path is real shell, not a file we can
 * only read.
 *
 * `scripts/dev-up.sh` used to run `db:deploy` only when the database had no
 * users, so an already-seeded dev database skipped every later migration and
 * the API then queried foundation-decisions tables that did not exist. It also
 * piped the migrate output through `tail` without `pipefail`, so the visible
 * exit status came from `tail` and startup continued after a failed migration.
 *
 * Both are exercised here by running the actual scripts with a stubbed `pnpm`
 * and `psql` on `PATH`, so the assertions are about execution, not text:
 *  - migrations run even when users already exist (regression for B);
 *  - a failing migration aborts `db-provision.sh` with a non-zero exit and a
 *    failing `db-provision.sh` prevents `dev-up.sh` from starting the API
 *    (regression for D).
 */
const REPO_ROOT = path.resolve(__dirname, '../../../../../..');
const DEV_UP = path.join(REPO_ROOT, 'scripts/dev-up.sh');
const DB_PROVISION = path.join(REPO_ROOT, 'scripts/db-provision.sh');

let tmpRoot: string;
let binDir: string;
let stubLog: string;

function writeExec(file: string, contents: string): void {
  fs.writeFileSync(file, contents, { mode: 0o755 });
}

/**
 * A `PATH` with stubs for the external tools the scripts call. `pnpm` records
 * every invocation to $STUB_LOG; it fails `db:deploy` when FAIL_DEPLOY=1.
 * `psql` reports $STUB_USERS as the user count.
 */
function stubPath(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    STUB_LOG: stubLog,
    PROVISION_ROOT: tmpRoot,
  };
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'provision-test-'));
  binDir = path.join(tmpRoot, 'bin');
  stubLog = path.join(tmpRoot, 'calls.log');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'apps/api'), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'apps/web/.next'), { recursive: true });
  // A dummy env; dev-up.sh sources it.
  fs.writeFileSync(path.join(tmpRoot, 'apps/api/.env'), 'LOG_LEVEL=error\n');
  // Pretend the web bundle already exists so the (slow) web build is skipped.
  fs.writeFileSync(path.join(tmpRoot, 'apps/web/.next/BUILD_ID'), 'test');
  // Real scripts under test.
  writeExec(path.join(tmpRoot, 'scripts/db-provision.sh'), fs.readFileSync(DB_PROVISION, 'utf8'));

  writeExec(
    path.join(binDir, 'pnpm'),
    `#!/usr/bin/env bash
echo "pnpm $*" >> "$STUB_LOG"
if [ "$*" = "--filter api db:deploy" ] && [ "\${FAIL_DEPLOY:-}" = "1" ]; then
  echo "simulated migration failure" >&2
  exit 1
fi
exit 0
`
  );
  writeExec(
    path.join(binDir, 'psql'),
    `#!/usr/bin/env bash
echo "\${STUB_USERS:-0}"
`
  );
  writeExec(path.join(binDir, 'curl'), '#!/usr/bin/env bash\nexit 1\n');
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function readCalls(): string {
  return fs.existsSync(stubLog) ? fs.readFileSync(stubLog, 'utf8') : '';
}

function run(script: string, env: NodeJS.ProcessEnv): { status: number; out: string } {
  fs.rmSync(stubLog, { force: true });
  const r = spawnSync('bash', [script], { env, encoding: 'utf8' });
  return { status: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('db-provision.sh — migrasi selalu, seed hanya bila kosong', () => {
  it('menjalankan db:deploy walaupun database SUDAH berisi user (regresi B)', () => {
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_USERS: '5' });
    expect(status).toBe(0);
    const calls = readCalls();
    expect(calls).toMatch(/--filter api db:deploy/);
    // Seeded database: seed must NOT run (it TRUNCATEs everything).
    expect(calls).not.toMatch(/db:seed/);
  });

  it('menjalankan db:deploy lalu db:seed pada database kosong', () => {
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_USERS: '0' });
    expect(status).toBe(0);
    const calls = readCalls();
    const deployAt = calls.indexOf('db:deploy');
    const seedAt = calls.indexOf('db:seed');
    expect(deployAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(deployAt);
  });

  it('mengembalikan exit non-zero ketika migrasi gagal (regresi D)', () => {
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_USERS: '5', FAIL_DEPLOY: '1' });
    expect(status).not.toBe(0);
  });
});

describe('dev-up.sh — kegagalan provisioning menghentikan startup API', () => {
  it('tidak memulai API ketika db-provision.sh gagal (regresi D)', () => {
    // Replace db-provision.sh in the sandbox with one that fails immediately,
    // simulating a failed migration.
    writeExec(path.join(tmpRoot, 'scripts/db-provision.sh'), '#!/usr/bin/env bash\nexit 1\n');
    writeExec(path.join(tmpRoot, 'scripts/dev-stack.sh'), '#!/usr/bin/env bash\nexit 0\n');

    const { status } = run(DEV_UP, { ...stubPath(), DEV_UP_ROOT: tmpRoot });
    expect(status).not.toBe(0);
    // The API is started via `pnpm exec tsx src/main.ts`; it must never run.
    expect(readCalls()).not.toMatch(/exec tsx/);
  });
});
