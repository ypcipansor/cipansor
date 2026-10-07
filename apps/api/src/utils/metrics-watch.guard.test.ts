import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * The scheduled key-metrics watch (`scripts/metrics-watch.mjs`,
 * `.github/workflows/metrics-watch.yml`) reads the deploy platform's own
 * metrics, compares them against a rolling baseline, and must report — never
 * alert on — a metric it could not read. These tests pin that contract:
 * a quiet window alerts on nothing, a real spike raises the right anomaly, a
 * window too small for a baseline alerts on nothing, and an unreadable metric
 * is always named in the report.
 *
 * They exercise the real script through its CLI, the same way
 * change-scope.guard.test.ts exercises its shell script, rather than
 * reimplementing the maths here.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'metrics-watch.mjs');
const FIXTURES = join(REPO_ROOT, 'scripts', 'fixtures');

function run(args: string[]): string {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
}

function analyze(fixture: string): string {
  const payload = readFileSync(join(FIXTURES, fixture), 'utf8');
  return execFileSync('node', [SCRIPT, '--analyze', '-'], {
    input: payload,
    encoding: 'utf8',
  });
}

describe('metrics-watch', () => {
  it('ships its script, fixtures and workflow', () => {
    expect(existsSync(SCRIPT)).toBe(true);
    expect(existsSync(join(FIXTURES, 'runs-quiet.json'))).toBe(true);
    expect(existsSync(join(FIXTURES, 'runs-failure-spike.json'))).toBe(true);
    expect(existsSync(join(REPO_ROOT, '.github', 'workflows', 'metrics-watch.yml'))).toBe(true);
  });

  it('passes its own self-test', () => {
    expect(run(['--self-test'])).toContain('ok');
  });

  it('alerts on nothing in a quiet window', () => {
    const out = analyze('runs-quiet.json');
    expect(out).toContain('ANOMALY_COUNT=0');
    expect(out).toContain('**Anomalies:** none');
  });

  it('raises the failure-rate anomaly on a spike', () => {
    const out = analyze('runs-failure-spike.json');
    expect(out).not.toContain('ANOMALY_COUNT=0');
    expect(out).toContain('platform.pipeline_failure_rate');
    expect(out).toMatch(/\*\*Anomalies:\*\*/);
  });

  it('alerts on nothing when the window is too small for a baseline', () => {
    const payload = JSON.parse(readFileSync(join(FIXTURES, 'runs-quiet.json'), 'utf8'));
    const thin = JSON.stringify({ workflow_runs: payload.workflow_runs.slice(0, 5) });
    const out = execFileSync('node', [SCRIPT, '--analyze', '-'], {
      input: thin,
      encoding: 'utf8',
    });
    expect(out).toContain('ANOMALY_COUNT=0');
    expect(out).toContain('Could not compare');
  });

  it('names every unreadable metric so it is never mistaken for healthy', () => {
    const out = analyze('runs-quiet.json');
    for (const key of [
      'app.error_rate',
      'app.request_latency',
      'app.job_failures',
      'platform.log_errors',
    ]) {
      expect(out).toContain(key);
    }
    expect(out).toContain('Unavailable metrics (reported, never alerted)');
  });

  it('reports a metric with no samples as n/a, not as a healthy zero', () => {
    // The fixtures carry no `schedule` runs, so the scheduled-job metric has no
    // sample to judge. It must render `n/a` — a bare `0` would read as healthy.
    const out = analyze('runs-quiet.json');
    expect(out).toContain('| platform.scheduled_job_failures | n/a | n/a | 0/0 |');
  });
});
