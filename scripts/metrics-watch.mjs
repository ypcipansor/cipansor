#!/usr/bin/env node
// Scheduled key-metrics watch.
//
// Reads the metrics that are actually reachable from where it runs, compares
// each against a rolling baseline, and reports. The hard rule: a metric it
// could not read is reported as UNAVAILABLE with the reason, and never alerts.
// A monitor that hears nothing is not a pass (see
// .claude/memory/lessons/github-actions-minutes-exhausted.md and issue #674).
//
// Sources, and why each is or is not read here:
//   - GitHub Actions (the deploy platform): read via the REST API with
//     GITHUB_TOKEN. Gives the CI/deploy failure rate and run latency, and —
//     because every scheduled app job runs only inside the deployed image —
//     a failed CI run is the only observable "background job" signal today.
//   - The app's own tables (error rate, request latency, per-job outcomes):
//     NOT readable. The app keeps no error-log or job-run table — errors go to
//     the winston logger and jobs log failures only (apps/api/src/jobs/
//     scheduler.ts, apps/api/src/middleware/error.ts). No DATABASE_URL is set
//     where this runs. Reported UNAVAILABLE, not alerted.
//   - Azure Log Analytics `cipansor-logs` (docs/deploy-azure.md → Reading
//     logs): NOT readable without the workspace id and an Azure identity; the
//     az CLI is absent. Reported UNAVAILABLE, not alerted.
//
// Usage:
//   node scripts/metrics-watch.mjs                 fetch live, print a report
//   node scripts/metrics-watch.mjs --self-test     prove the maths on fixtures
//   node scripts/metrics-watch.mjs --analyze <f>   analyze a saved runs JSON
//
// Exit codes: 0 = ran (with or without anomalies), 1 = could not run.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');

// A rolling window of runs, and how many of the newest are "current".
export const WINDOW = 60;
export const CURRENT = 20;
// An anomaly is a rise the baseline does not explain. Rates are proportions.
export const RATE_ABS = 0.15; // +15 percentage points
export const RATE_REL = 1.5; // or 1.5x the baseline rate
export const LATENCY_ABS = 1.5; // +50% the baseline median duration

export const QUERY =
  'GET /repos/{owner}/{repo}/actions/runs?per_page=100' +
  ' (fields used: name,event,head_branch,conclusion,created_at,updated_at,run_started_at,status)';

/**
 * Metrics this watch is asked to cover but cannot read from its environment.
 * Listed explicitly so the report never quietly omits them, and so an
 * unavailable metric can never be mistaken for a healthy one.
 */
export const UNAVAILABLE = [
  {
    key: 'app.error_rate',
    source: 'apps/api tables',
    reason:
      'No error-log table exists: errors are handled in apps/api/src/middleware/error.ts ' +
      'and written to the winston logger only. No DATABASE_URL is set here.',
  },
  {
    key: 'app.request_latency',
    source: 'apps/api tables',
    reason: 'No request/latency table exists; the API keeps no per-request timing.',
  },
  {
    key: 'app.job_failures',
    source: 'apps/api tables',
    reason:
      'The scheduler (apps/api/src/jobs/scheduler.ts) logs a failed job but writes no ' +
      'job-run row, so per-job outcomes are not queryable.',
  },
  {
    key: 'platform.log_errors',
    source: 'Azure Log Analytics cipansor-logs',
    reason:
      'Reachable only with the workspace id and an Azure identity (Log Analytics ' +
      'Reader); the az CLI is absent here. See issue #674 and docs/deploy-azure.md.',
  },
];

/** Parse the GitHub runs payload into the shape the analysis needs. */
export function normalizeRuns(payload) {
  const runs = Array.isArray(payload) ? payload : (payload.workflow_runs ?? []);
  return runs
    .map((r) => ({
      name: r.name,
      event: r.event,
      branch: r.head_branch,
      conclusion: r.conclusion ?? null,
      status: r.status,
      createdAt: Date.parse(r.created_at),
      durationMs: durationMs(r),
    }))
    .filter((r) => Number.isFinite(r.createdAt))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function durationMs(r) {
  const start = Date.parse(r.run_started_at ?? r.created_at);
  const end = Date.parse(r.updated_at ?? r.created_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

const isSettled = (r) => r.conclusion !== null;
const isFailure = (r) => r.conclusion === 'failure';
// CI/E2E/Deploy are the deploy platform's own pipelines. A run whose name is
// "PR #123" is a per-PR runner, not a pipeline, so it is excluded from the
// platform rates to keep the baseline about the same thing over time.
const isPipeline = (r) => !/^PR #\d+$/.test(r.name ?? '');

export function failureRate(runs) {
  const settled = runs.filter(isSettled);
  if (settled.length === 0) return null;
  return settled.filter(isFailure).length / settled.length;
}

export function median(values) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function rateAnomaly(current, baseline) {
  if (current === null || baseline === null) return false;
  const rose = current - baseline >= RATE_ABS;
  const multiplied = baseline > 0 && current >= baseline * RATE_REL;
  // A baseline of zero with any current failure is a rise from nothing.
  const fromZero = baseline === 0 && current > 0;
  return rose || multiplied || fromZero;
}

function latencyAnomaly(current, baseline) {
  if (current === null || baseline === null || baseline <= 0) return false;
  return current >= baseline * LATENCY_ABS;
}

/**
 * Compare the newest CURRENT pipeline runs against the older baseline runs.
 * Returns { metrics, anomalies } — anomalies is empty when there is nothing to
 * compare, which is honest: no baseline, no alert.
 */
export function analyze(payload) {
  const all = normalizeRuns(payload);
  const pipelines = all.filter(isPipeline);

  if (pipelines.length < CURRENT + 5) {
    return {
      metrics: [],
      anomalies: [],
      note: `only ${pipelines.length} pipeline run(s) fetched; need ${CURRENT + 5} for a baseline`,
    };
  }

  const currentRuns = pipelines.slice(0, CURRENT);
  const baselineRuns = pipelines.slice(CURRENT, WINDOW);
  const anomalies = [];

  const curFail = failureRate(currentRuns);
  const baseFail = failureRate(baselineRuns);
  if (rateAnomaly(curFail, baseFail)) {
    anomalies.push({
      metric: 'platform.pipeline_failure_rate',
      current: curFail,
      baseline: baseFail,
      threshold: `+${RATE_ABS * 100}pp or ${RATE_REL}x`,
    });
  }

  const curDur = median(currentRuns.map((r) => r.durationMs));
  const baseDur = median(baselineRuns.map((r) => r.durationMs));
  if (latencyAnomaly(curDur, baseDur)) {
    anomalies.push({
      metric: 'platform.run_duration_median',
      current: curDur,
      baseline: baseDur,
      threshold: `${LATENCY_ABS}x`,
    });
  }

  const metrics = [
    {
      key: 'platform.pipeline_failure_rate',
      current: curFail,
      baseline: baseFail,
      currentN: currentRuns.filter(isSettled).length,
      baselineN: baselineRuns.filter(isSettled).length,
    },
    {
      key: 'platform.run_duration_median',
      current: curDur,
      baseline: baseDur,
      currentN: currentRuns.length,
      baselineN: baselineRuns.length,
    },
    {
      key: 'platform.scheduled_job_failures',
      current:
        currentRuns.filter((r) => r.event === 'schedule').length > 0
          ? currentRuns.filter((r) => r.event === 'schedule' && isFailure(r)).length
          : null,
      baseline:
        baselineRuns.filter((r) => r.event === 'schedule').length > 0
          ? baselineRuns.filter((r) => r.event === 'schedule' && isFailure(r)).length
          : null,
      currentN: currentRuns.filter((r) => r.event === 'schedule').length,
      baselineN: baselineRuns.filter((r) => r.event === 'schedule').length,
    },
  ];

  return { metrics, anomalies, note: null };
}

const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const secs = (ms) => (ms === null ? 'n/a' : `${(ms / 1000).toFixed(0)}s`);
const count = (v) => (v === null ? 'n/a' : String(v));

export function renderReport(payload, repo) {
  const { metrics, anomalies, note } = analyze(payload);
  const lines = [];
  lines.push(`## Key metrics watch — ${repo}`);
  lines.push('');
  lines.push(`Query: \`${QUERY}\``);
  lines.push(`Rolling window: newest ${CURRENT} runs vs the previous ${WINDOW - CURRENT}.`);
  lines.push('');
  lines.push('### Readable metrics');
  lines.push('');
  if (note) {
    lines.push(`_Could not compare: ${note}._`);
  } else {
    lines.push('| Metric | Current | Baseline | n (cur/base) |');
    lines.push('|---|---|---|---|');
    for (const m of metrics) {
      const fmt = m.key.includes('duration') ? secs : m.key.includes('rate') ? pct : count;
      lines.push(
        `| ${m.key} | ${fmt(m.current)} | ${fmt(m.baseline)} | ${m.currentN}/${m.baselineN} |`
      );
    }
  }
  lines.push('');
  lines.push('### Unavailable metrics (reported, never alerted)');
  lines.push('');
  lines.push('| Metric | Source | Why it could not be read |');
  lines.push('|---|---|---|');
  for (const u of UNAVAILABLE) lines.push(`| ${u.key} | ${u.source} | ${u.reason} |`);
  lines.push('');
  if (anomalies.length === 0) {
    lines.push('**Anomalies:** none against the rolling baseline.');
  } else {
    lines.push('**Anomalies:**');
    lines.push('');
    for (const a of anomalies) {
      const fmt = a.metric.includes('duration') ? secs : a.metric.includes('rate') ? pct : count;
      lines.push(
        `- **${a.metric}** — current ${fmt(a.current)} vs baseline ${fmt(a.baseline)} ` +
          `(threshold ${a.threshold})`
      );
    }
  }
  return { report: lines.join('\n'), anomalies };
}

async function fetchLive(repo) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cipansor-metrics-watch',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${repo}`);
  return res.json();
}

function selfTest() {
  const fixture = (name) => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`self-test failed: ${msg}`);
  };

  const quiet = renderReport(fixture('runs-quiet.json'), 'o/r');
  assert(quiet.anomalies.length === 0, 'quiet window must have no anomalies');
  assert(quiet.report.includes('Unavailable metrics'), 'report must list unavailable metrics');

  const spike = renderReport(fixture('runs-failure-spike.json'), 'o/r');
  assert(
    spike.anomalies.some((a) => a.metric === 'platform.pipeline_failure_rate'),
    'failure spike must raise the failure-rate anomaly'
  );

  // A window too small for a baseline must alert on nothing.
  const thin = renderReport({ workflow_runs: fixture('runs-quiet.json').workflow_runs.slice(0, 5) }, 'o/r');
  assert(thin.anomalies.length === 0, 'no baseline means no alert');

  console.log('metrics-watch self-test: ok');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();

  const analyzeIdx = args.indexOf('--analyze');
  if (analyzeIdx !== -1) {
    const file = args[analyzeIdx + 1];
    if (!file) throw new Error('--analyze needs a file path or - for stdin');
    const raw =
      file === '-'
        ? readFileSync(0, 'utf8')
        : existsSync(file)
          ? readFileSync(file, 'utf8')
          : null;
    if (raw === null) throw new Error(`--analyze needs a readable file, got ${file}`);
    const payload = JSON.parse(raw);
    const { report, anomalies } = renderReport(payload, 'local fixture');
    process.stdout.write(report + '\n');
    console.log(`\nANOMALY_COUNT=${anomalies.length}`);
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY || 'ypcipansor/cipansor';
  const payload = await fetchLive(repo);
  const { report, anomalies } = renderReport(payload, repo);
  process.stdout.write(report + '\n');
  console.log(`\nANOMALY_COUNT=${anomalies.length}`);
}

// Only run when invoked directly, so the exports stay importable by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`metrics-watch could not run: ${err.message}`);
    process.exit(1);
  });
}
