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
 * `psql` reports $STUB_ROWS as the total application row count.
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
echo "pnpm $* ALLOW_DESTRUCTIVE_SEED=\${ALLOW_DESTRUCTIVE_SEED:-}" >> "$STUB_LOG"
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
  # Two different shapes of probe must be distinguishable so a regression is
  # provable: the OLD probe asked the users table only, the NEW probe sums
  # every table (mentions pg_tables). Emit STUB_USERS_ONLY for the former and
  # STUB_ROWS for the latter, so "users empty but other tables full" can be
  # represented as STUB_USERS_ONLY=0, STUB_ROWS=12.
  if printf '%s' "$*" | grep -qi 'FROM users'; then
    echo "\${STUB_USERS_ONLY:-0}"
  elif [ -n "\${STUB_ROWS_UNKNOWN:-}" ]; then
    # probe present but produced no output — the fail-closed case.
    exit 0
  else
    echo "\${STUB_ROWS:-0}"
  fi
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

describe('db-provision.sh — generate, migrasi selalu, seed hanya bila kosong', () => {
  it('menjalankan db:deploy walaupun database SUDAH berisi user (regresi B)', () => {
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_ROWS: '5' });
    expect(status).toBe(0);
    const calls = readCalls();
    expect(calls).toMatch(/--filter api db:deploy/);
    // Seeded database: seed must NOT run (it TRUNCATEs everything).
    expect(calls).not.toMatch(/db:seed/);
  });

  /**
   * Regresi finding 4 — Prisma Client harus digenerate dari schema TERKINI
   * sebelum API dijalankan.
   *
   * `migrate deploy` TIDAK meregenerasi client. Sebelum ini `db-provision.sh`
   * hanya menjalankan `db:deploy`, sehingga checkout yang `schema.prisma`-nya
   * bertambah model (tabel foundation-decisions) memulai API dengan client
   * BASI: basis data tampak termigrasi, tetapi setiap panggilan
   * `prisma.foundationDecision.*` gagal saat runtime. Uji ini menuntut
   * `db:generate` benar-benar DIJALANKAN, dan dijalankan SEBELUM `db:deploy`
   * (urutan penting: generate tidak butuh basis data, tetapi klien harus siap
   * sebelum API memakainya).
   */
  it('menjalankan db:generate SEBELUM db:deploy (regresi finding 4)', () => {
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_ROWS: '5' });
    expect(status).toBe(0);
    const calls = readCalls();
    const generateAt = calls.indexOf('db:generate');
    const deployAt = calls.indexOf('db:deploy');
    expect(generateAt).toBeGreaterThan(-1);
    expect(deployAt).toBeGreaterThan(generateAt);
  });

  it('tidak kembali memakai `prisma db push` (invariant migrasi-only)', () => {
    const source = fs.readFileSync(DB_PROVISION, 'utf8');
    // Hanya baris yang benar-benar dijalankan; komentar yang MENYEBUT db push
    // (menjelaskan mengapa ia dihindari) bukan pelanggaran.
    const executable = source
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
    expect(executable).not.toMatch(/\bdb:push\b/);
    expect(executable).not.toMatch(/\bdb push\b/);
  });

  it('menjalankan db:deploy lalu db:seed pada database kosong', () => {
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_ROWS: '0' });
    expect(status).toBe(0);
    const calls = readCalls();
    const deployAt = calls.indexOf('db:deploy');
    const seedAt = calls.indexOf('db:seed');
    expect(deployAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(deployAt);
  });

  /**
   * Finding A1 — "database kosong" must mean NO application data, not just no
   * users.
   *
   * The probe used to `SELECT count(*) FROM users`. A database whose `users`
   * table is empty while any other table holds rows — an interrupted seed, a
   * partial restore, a wiped admin table — read as "empty" and was re-seeded,
   * and `prisma/seed.ts` TRUNCATEs every table, destroying those rows. The
   * probe now sums rows across every application table (`STUB_ROWS` here).
   * These cases fail before the fix (the old script would seed whenever the
   * user count was 0) and pass after.
   */
  it('TIDAK menyeed ketika users kosong tetapi tabel lain berisi data (regresi A1)', () => {
    // users = 0 yet 12 rows live elsewhere: ambiguous, must fail closed.
    // STUB_USERS_ONLY=0 is what the OLD users-only probe would have read (and
    // seeded on); the new probe reads STUB_ROWS=12 and must skip.
    const { status } = run(DB_PROVISION, {
      ...stubPath(),
      STUB_USERS_ONLY: '0',
      STUB_ROWS: '12',
    });
    expect(status).toBe(0);
    expect(readCalls()).not.toMatch(/db:seed/);
  });

  it('TIDAK menyeed pada database normal yang berisi user (regresi A1)', () => {
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_ROWS: '4096' });
    expect(status).toBe(0);
    expect(readCalls()).not.toMatch(/db:seed/);
  });

  it('fail closed — tidak menyeed ketika jumlah baris TIDAK dapat ditentukan (A1)', () => {
    // psql present but the probe returns nothing (connection/version issue):
    // an unknown count must skip seeding, never guess.
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_ROWS_UNKNOWN: '1' });
    expect(status).toBe(0);
    expect(readCalls()).not.toMatch(/db:seed/);
  });

  it('migrasi tetap SELALU dijalankan apa pun keputusan seed (A1)', () => {
    for (const rows of ['0', '12', '4096']) {
      const { status } = run(DB_PROVISION, { ...stubPath(), STUB_ROWS: rows });
      expect(status, `rows=${rows}`).toBe(0);
      expect(readCalls(), `rows=${rows}`).toMatch(/--filter api db:deploy/);
    }
  });

  /**
   * `prisma/seed.ts` (main) now refuses to run without
   * `ALLOW_DESTRUCTIVE_SEED=1` because it TRUNCATEs every table. `db-provision.sh`
   * seeds only when the database is empty, so it must pass that opt-in — without
   * it a fresh local/CI database never seeds and every e2e login fails.
   */
  it('meneruskan ALLOW_DESTRUCTIVE_SEED=1 saat seed (kebijakan seed main)', () => {
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_ROWS: '0' });
    expect(status).toBe(0);
    const seedLine = readCalls()
      .split('\n')
      .find((l) => l.includes('db:seed'));
    expect(seedLine).toMatch(/ALLOW_DESTRUCTIVE_SEED=1/);
  });

  it('mengembalikan exit non-zero ketika migrasi gagal (regresi D)', () => {
    const { status } = run(DB_PROVISION, { ...stubPath(), STUB_ROWS: '5', FAIL_DEPLOY: '1' });
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
