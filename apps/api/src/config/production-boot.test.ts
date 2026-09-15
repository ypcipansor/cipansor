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
const GOOD_ENCRYPTION_KEY = 'a'.repeat(64);

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

describe('production boot guard (real module load)', () => {
  it('has tsx available to run the child process', () => {
    expect(fs.existsSync(TSX), `expected ${TSX} to exist`).toBe(true);
  });

  it('refuses to load config in production with the placeholder that was live', () => {
    const result = loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: SHIPPED_PLACEHOLDER,
      ENCRYPTION_KEY: GOOD_ENCRYPTION_KEY,
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
      ENCRYPTION_KEY: GOOD_ENCRYPTION_KEY,
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
      ENCRYPTION_KEY: GOOD_ENCRYPTION_KEY,
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
  it('calls assertProductionSecrets before the server starts listening', () => {
    const source = fs.readFileSync(path.join(API_ROOT, 'src', 'main.ts'), 'utf8');

    expect(
      source.includes('assertProductionSecrets('),
      'main.ts no longer calls assertProductionSecrets(). Without it, a ' +
        'missing ENCRYPTION_KEY is not checked at boot — utils/encryption.ts ' +
        'silently substitutes a key printed in the source.'
    ).toBe(true);

    const callIndex = source.indexOf('assertProductionSecrets(');
    const listenIndex = source.indexOf('.listen(');

    expect(
      listenIndex === -1 || callIndex < listenIndex,
      'assertProductionSecrets() must run before the port opens — serving ' +
        'traffic signed by a published key is worse than not serving at all.'
    ).toBe(true);
  });
});
