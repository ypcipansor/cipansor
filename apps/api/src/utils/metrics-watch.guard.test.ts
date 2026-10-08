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

  describe('the workflow alerts on anomalies, never on a metric it could not read', () => {
    const WORKFLOW = readFileSync(
      join(REPO_ROOT, '.github', 'workflows', 'metrics-watch.yml'),
      'utf8'
    );

    /** The exact `if:` on the ticket step, so the model below cannot drift. */
    function ticketCondition(): string {
      const step = /- name: Open or update an anomaly ticket\n\s*if: (.+)/.exec(WORKFLOW);
      if (!step) throw new Error('the anomaly-ticket step is missing its `if:`');
      return step[1].trim();
    }

    /**
     * Mirror of the ticket step's `if:` for the two values GitHub gives it:
     * the read step's `outcome` and its `count` output. `always()` is true on
     * every path this models.
     */
    const ticketWouldRun = (outcome: 'success' | 'failure', count: string): boolean =>
      outcome === 'success' && count !== '0';

    it('gates the ticket on the read step having succeeded', () => {
      // A metric that could not be read is the one thing that must not alert.
      // The "Read metrics" step exits 1 before writing `count`, so its output is
      // the empty string; `'' != '0'` is true, and without this gate the step
      // would draft an "anomaly detected" issue out of a run that read nothing.
      expect(ticketCondition()).toContain("steps.metrics.outcome == 'success'");
      expect(ticketCondition()).toContain("steps.metrics.outputs.count != '0'");
    });

    it('runs the ticket only for a successful read that found an anomaly', () => {
      expect(ticketWouldRun('failure', '')).toBe(false); // could not read — never alert
      expect(ticketWouldRun('success', '0')).toBe(false); // quiet window — no ticket
      expect(ticketWouldRun('success', '2')).toBe(true); // real anomaly — open/update
    });

    it('exits non-zero before writing its output when a metric is unreadable', () => {
      // The gate above rests on this: a failed read leaves `count` unset, not 0.
      // If the step swallowed the failure and wrote `count=0`, the empty-string
      // case would never arise and the gate would be tested by nothing.
      const read = /- name: Read metrics and detect anomalies[\s\S]*?run: \|([\s\S]*?)\n\n/.exec(
        WORKFLOW
      );
      expect(read, 'the read step must exist').not.toBeNull();
      expect(read![1]).toContain('exit "$code"');
      expect(read![1]).toContain('::error');
    });
  });
});
