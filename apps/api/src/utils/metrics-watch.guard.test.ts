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
    expect(existsSync(join(FIXTURES, 'runs-non-pipeline-failures.json'))).toBe(true);
    expect(existsSync(join(FIXTURES, 'runs-unfinished.json'))).toBe(true);
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

  it('counts the deploy workflows, which are not push-triggered', () => {
    // Deploy staging runs on `workflow_run` and Deploy production on
    // `workflow_dispatch`; both are on main and part of the platform. A
    // push-only rule would drop them and halve the sample count.
    const out = analyze('runs-quiet.json');
    expect(out).toContain('| platform.run_duration_median | 210s | 210s | 20/40 |');
  });

  it('does not alert when only non-pipeline runs (watch schedules, PR runs) fail', () => {
    // The watch must not monitor itself into the pipeline rate, and a failing
    // pull request must not move a metric that is about the deploy platform.
    const out = analyze('runs-non-pipeline-failures.json');
    expect(out).toContain('ANOMALY_COUNT=0');
    expect(out).toContain('**Anomalies:** none');
    // The failure rate stays at zero even though the window is full of failures.
    expect(out).toContain('| platform.pipeline_failure_rate | 0.0% | 0.0% |');
  });

  it('excludes unfinished runs from the pipeline samples and duration', () => {
    // Three in-progress runs must not enter the median, and their absence must
    // shrink the sample count (17 settled of the newest 20, not 20).
    const out = analyze('runs-unfinished.json');
    expect(out).toContain('ANOMALY_COUNT=0');
    expect(out).toContain('| platform.pipeline_failure_rate | 0.0% | 0.0% | 17/40 |');
    expect(out).toContain('| platform.run_duration_median | 120s | 210s | 17/40 |');
  });

  it('alerts on nothing when the window is too small for a baseline', () => {
    const payload = JSON.parse(readFileSync(join(FIXTURES, 'runs-quiet.json'), 'utf8'));
    const thin = JSON.stringify({ workflow_runs: payload.workflow_runs.slice(0, 5) });
    const out = execFileSync('node', [SCRIPT, '--analyze', '-'], {
      input: thin,
      encoding: 'utf8',
    });
    expect(out).toContain('ANOMALY_COUNT=0');
    // A window too small to compare is not a pass: the pipeline metrics are
    // named unavailable, with the count, so an empty read cannot look healthy
    // (issue #689).
    expect(out).toContain('only 5 pipeline run(s) read; need 25 for a baseline');
    expect(out).toContain('| platform.pipeline_failure_rate | GitHub Actions runs |');
  });

  it('reads past a newest page that holds no pipeline run (issue #689)', () => {
    // The newest runs on this repository are PR/review runs; the pipeline
    // history is on the older pages. The watch must page, not read page 1 only.
    const payload = JSON.parse(readFileSync(join(FIXTURES, 'runs-quiet.json'), 'utf8'));
    const newest = Array.from({ length: 40 }, (_, i) => ({
      id: 900000 + i,
      name: `PR #${600 + i}`,
      event: 'pull_request',
      head_branch: `feature/${i}`,
      conclusion: 'success',
      created_at: '2026-10-07T00:00:00Z',
      status: 'completed',
    }));
    const older = payload.workflow_runs.filter(
      (r) =>
        ['CI', 'E2E Tests', 'Deploy staging', 'Deploy production'].includes(r.name) &&
        r.head_branch === 'main'
    );
    const paged = JSON.stringify({
      pages: [{ workflow_runs: newest }, { workflow_runs: older }],
    });
    const out = execFileSync('node', [SCRIPT, '--analyze', '-'], {
      input: paged,
      encoding: 'utf8',
    });
    expect(out).toContain('| platform.pipeline_failure_rate | 0.0% | 0.0% | 20/40 |');
    expect(out).toContain('| platform.run_duration_median | 210s | 210s | 20/40 |');
    expect(out).not.toContain('pipeline run(s) read; need 25');
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
    // The fixtures carry no settled `schedule` runs, so the scheduled-job metric
    // has no sample to judge. It must render `n/a` — a bare `0` would read as
    // healthy.
    const out = analyze('runs-quiet.json');
    expect(out).toContain('| platform.scheduled_job_failures | n/a | n/a | 0/0 |');
  });

  it('reports an unfinished schedule as n/a, not as a healthy zero', () => {
    // A queued/in-progress schedule has no conclusion. Counting it as a sample
    // but not a failure would render an unknown outcome as 0.
    const out = analyze('runs-unfinished.json');
    expect(out).toContain('| platform.scheduled_job_failures | n/a | n/a | 0/0 |');
  });
});
