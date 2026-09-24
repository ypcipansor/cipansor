import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Does the guard actually stop a production boot?
 *
 * The other tests in this directory call `findSecretIssues` and
 * `assertProductionSecrets` directly, which proves the *rule* is right and
 * proves nothing about whether it is *wired in*. Deleting the call from
 * main.ts, or the `resolveJwtSecret(...)` from config/index.ts, would leave
 * every one of them green while production went back to booting with a
 * published key.
 *
 * CI never exercises the production path either: no workflow sets
 * NODE_ENV=production, so the guard is dormant there. That is fine for the
 * rest of the suite and useless for this.
 *
 * So these tests load the real config module in a real child process with a
 * real production environment, and check the exit status. No mocks — the thing
 * being tested is the wiring.
 */

const API_ROOT = path.resolve(__dirname, '..', '..');
const TSX = path.join(API_ROOT, 'node_modules', '.bin', 'tsx');

/** The value cipansor.or.id was live with, from .env.example in a public repo. */
const SHIPPED_PLACEHOLDER =
  'your-super-secret-key-change-this-in-production-min-32-chars';

const GOOD_SECRET = 'f'.repeat(96);

interface BootResult {
  ok: boolean;
  output: string;
}

/**
 * Import `src/config` in a child process under the given environment.
 *
 * `NODE_OPTIONS` is cleared and the env is replaced rather than extended, so
 * the developer's own `.env`-derived variables cannot make a failing case pass
 * locally while it fails in CI, or the reverse.
 */
function loadConfigWith(env: Record<string, string>): BootResult {
  const script =
    "import('./src/config/index.ts')" +
    ".then(() => { console.log('BOOT_OK'); })" +
    '.catch((e) => { console.log("BOOT_REFUSED:" + e.message); process.exit(3); });';

  try {
    const stdout = execFileSync(TSX, ['-e', script], {
      cwd: API_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        ...env,
      },
    });
    return { ok: stdout.includes('BOOT_OK'), output: stdout };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}` };
  }
}

/**
 * Run the real `assertProductionSecrets()` gate — the exact call main.ts makes
 * before `.listen()` — in a child process with a controlled environment.
 *
 * Loading `src/config` alone cannot prove this: the e-seal getter only throws
 * when *read*, so a config import succeeds without the passphrase and the
 * process would keep serving until the first decision touched the e-seal. This
 * calls the gate directly, which is what bootstrap does.
 */
function runBootGuard(env: Record<string, string>): BootResult {
  const script =
    "import('./src/config/assert-secrets.ts')" +
    '.then((m) => { m.assertProductionSecrets(); console.log(\"BOOT_OK\"); })' +
    '.catch((e) => { console.log("BOOT_REFUSED:" + e.message); process.exit(3); });';

  try {
    const stdout = execFileSync(TSX, ['-e', script], {
      cwd: API_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        ...env,
      },
    });
    return { ok: stdout.includes('BOOT_OK'), output: stdout };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}` };
  }
}

describe('production boot guard (real module load)', () => {
  it('has tsx available to run the child process', () => {
    expect(fs.existsSync(TSX), `expected ${TSX} to exist`).toBe(true);
  });

  it('refuses to load config in production with the placeholder that was live', () => {
    const result = loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: SHIPPED_PLACEHOLDER,
      STUDENT_CARD_HMAC_SECRET: GOOD_SECRET,
    });

    expect(result.ok, `config loaded when it should have refused:\n${result.output}`).toBe(
      false
    );
    expect(result.output).toContain('BOOT_REFUSED');
    expect(result.output).toMatch(/example value/);
  }, 90_000);

  it('refuses in production when JWT_SECRET is too short', () => {
    const result = loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: 'terlalu-pendek',
      STUDENT_CARD_HMAC_SECRET: GOOD_SECRET,
    });

    // Behaviour only, no wording match: any correct guard rejects a short key,
    // so pinning the phrasing here would fail on a reworded message without
    // anything actually being broken. The placeholder case above is where the
    // wording carries meaning — "example value" is the distinction an
    // exact-match check cannot make.
    expect(result.ok).toBe(false);
    expect(result.output).toContain('BOOT_REFUSED');
  }, 90_000);

  // "JWT_SECRET absent" is deliberately not tested through this route, and the
  // first attempt to do so failed in a way worth recording: config/index.ts
  // runs dotenv, which reads the repo's own .env, so an unset process variable
  // is simply refilled from the file. That is correct behaviour — the file is
  // a legitimate source — but it means absence cannot be simulated by omitting
  // an env var here. The unset case is covered in assert-secrets.test.ts,
  // which calls the checker directly.

  it('loads in production once the secret is a generated one', () => {
    const result = loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: GOOD_SECRET,
      STUDENT_CARD_HMAC_SECRET: GOOD_SECRET,
    });

    // The positive case matters as much as the negative: a guard that refuses
    // everything would satisfy the tests above and take the site down.
    expect(result.ok, `config refused a valid production env:\n${result.output}`).toBe(true);
  }, 90_000);

  it('still loads outside production with no secret configured', () => {
    const result = loadConfigWith({ NODE_ENV: 'development' });

    expect(result.ok, `dev boot broke:\n${result.output}`).toBe(true);
  }, 90_000);
});

/**
 * The call site itself. A structural check, because the process-level test
 * above covers config/index.ts but not main.ts: config is imported for its
 * side effect, whereas assertProductionSecrets() is an explicit call somebody
 * could quietly drop while every other test stayed green.
 */
describe('bootstrap wiring', () => {
  /**
   * Flag Investigation (F) — the e-seal passphrase guard must stop a production
   * boot, not surface later when the first decision touches the e-seal.
   *
   * `config.foundation.esealPassphrase` is a getter: importing config cannot
   * fail for a missing value, so a test that only loads config would stay green
   * while production served happily until the first decision. This drives the
   * real gate `main.ts` calls before `.listen()`.
   */
  it('refuses a production boot with no FOUNDATION_ESEAL_PASSPHRASE', () => {
    const result = runBootGuard({
      NODE_ENV: 'production',
      JWT_SECRET: GOOD_SECRET,
      STUDENT_CARD_HMAC_SECRET: GOOD_SECRET,
    });

    expect(
      result.ok,
      `production booted without an e-seal passphrase:\n${result.output}`
    ).toBe(false);
    expect(result.output).toContain('BOOT_REFUSED');
    expect(result.output).toMatch(/FOUNDATION_ESEAL_PASSPHRASE/);
  }, 90_000);

  it('refuses the published dev-fallback e-seal passphrase in production', () => {
    const result = runBootGuard({
      NODE_ENV: 'production',
      JWT_SECRET: GOOD_SECRET,
      STUDENT_CARD_HMAC_SECRET: GOOD_SECRET,
      FOUNDATION_ESEAL_PASSPHRASE: 'dev-foundation-eseal-passphrase-not-for-production',
    });

    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/FOUNDATION_ESEAL_PASSPHRASE/);
  }, 90_000);

  it('boots in production with an explicit e-seal passphrase', () => {
    const result = runBootGuard({
      NODE_ENV: 'production',
      JWT_SECRET: GOOD_SECRET,
      STUDENT_CARD_HMAC_SECRET: GOOD_SECRET,
      FOUNDATION_ESEAL_PASSPHRASE: GOOD_SECRET,
    });

    expect(
      result.ok,
      `production refused a valid e-seal passphrase:\n${result.output}`
    ).toBe(true);
  }, 90_000);

  it('calls assertProductionSecrets before the server starts listening', () => {
    const source = fs.readFileSync(path.join(API_ROOT, 'src', 'main.ts'), 'utf8');

    expect(
      source.includes('assertProductionSecrets('),
      'main.ts no longer calls assertProductionSecrets(). Without it, ' +
        'production could boot next to a printed, live JWT secret.'
    ).toBe(true);

    const callIndex = source.indexOf('assertProductionSecrets(');
    const listenIndex = source.indexOf('.listen(');

    expect(
      listenIndex === -1 || callIndex < listenIndex,
      'assertProductionSecrets() must run before the port opens — serving ' +
        'traffic signed by a published key is worse than not serving at all.'
    ).toBe(true);
  });

  /**
   * F8 — gerbang font harus benar-benar TERPASANG, bukan hanya ada sebagai
   * fungsi. Tanpa panggilan ini, image produksi yang kehilangan
   * `assets/fonts/Amiri-Regular.ttf` tetap boot dan baru gagal saat rapat
   * yayasan menutup keputusan ber-Arab/emoji.
   */
  it('memanggil assertDecisionPdfFontAvailable sebelum server mendengarkan (F8)', () => {
    const source = fs.readFileSync(path.join(API_ROOT, 'src', 'main.ts'), 'utf8');
    const callIndex = source.indexOf('assertDecisionPdfFontAvailable(');
    const listenIndex = source.indexOf('.listen(');

    expect(
      callIndex,
      'main.ts no longer calls assertDecisionPdfFontAvailable().'
    ).toBeGreaterThan(-1);
    expect(
      listenIndex === -1 || callIndex < listenIndex,
      'assertDecisionPdfFontAvailable() must run before the port opens.'
    ).toBe(true);
  });
});
