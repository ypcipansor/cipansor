import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * The `/health` reading at `/healthz` mislabelled staging as `production`
 * until 2026-10-08: the handler reported `NODE_ENV`, and every deployed image
 * bakes `NODE_ENV=production` (Dockerfile), so the copy name and the runtime
 * mode could not be told apart. Staging's `environment` is now read from the
 * per-environment `APP_ENVIRONMENT` setting; the ops watch keys on it to tell
 * a staging reading from a live one.
 *
 * Two halves have to hold together, and each one alone is silent:
 *   - the handler reports `config.environment`, not `config.env`;
 *   - each deploy workflow sets `APP_ENVIRONMENT` to its own name, and never
 *     derives it from `NODE_ENV`.
 *
 * The behavioural half lives in `health.test.ts`; this pins the wiring those
 * tests cannot see (the real handler source) and the workflow side, which no
 * unit test runs.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const readRepoFile = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

describe('/health environment label', () => {
  it('reports config.environment, not NODE_ENV (config.env)', () => {
    const appSource = readRepoFile('apps/api/src/app.ts');
    expect(appSource).toMatch(/environment:\s*config\.environment\b/);
    expect(appSource).not.toMatch(/environment:\s*config\.env\b/);
  });

  it('each deploy workflow names its own environment', () => {
    const cases: Array<[string, string]> = [
      ['deploy-staging.yml', 'staging'],
      ['deploy-production.yml', 'production'],
    ];
    for (const [file, name] of cases) {
      const workflow = readRepoFile(join('.github', 'workflows', file));
      expect(workflow, `${file} must set APP_ENVIRONMENT=${name}`).toContain(
        `APP_ENVIRONMENT=${name}`
      );
    }
  });

  it('never derives the label from NODE_ENV or the runtime mode', () => {
    for (const file of ['deploy-staging.yml', 'deploy-production.yml']) {
      const workflow = readRepoFile(join('.github', 'workflows', file));
      // A setting built from NODE_ENV (or the CI `env.SHA` style) would put the
      // lie back: NODE_ENV is `production` on every host.
      expect(workflow).not.toMatch(/APP_ENVIRONMENT=\$\{\{\s*env\.NODE_ENV/);
      expect(workflow).not.toMatch(/APP_ENVIRONMENT=\$\{?NODE_ENV/);
    }
  });

  it('the VM compose stack defaults to the safe label, production', () => {
    expect(readRepoFile('docker-compose.yml')).toContain(
      'APP_ENVIRONMENT: ${APP_ENVIRONMENT:-production}'
    );
  });
});
