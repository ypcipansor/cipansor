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
//     The pipeline metrics count only CI / E2E Tests / Deploy staging /
//     Deploy production runs on main; this watch's own scheduled runs and
//     PR-triggered runs are excluded (see PIPELINE_WORKFLOWS).
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

// A rolling window of runs, and how many of the newest are "current".
export const WINDOW = 60;
export const CURRENT = 20;

// The runs endpoint returns at most 100 runs per page, and that page is the
// newest 100 across ALL workflows. On a busy repository (this one carries
// ~6,800 runs) a page is almost all pull-request and review runs, so a single
// page can hold zero CI/E2E/deploy runs and the pipeline metrics read nothing
// (issue #689). The window is therefore filled by paging until WINDOW pipeline
// runs are collected or the history is exhausted. The page cap bounds the API
// calls: WINDOW=60 typically needs ~5 pages, and 20 pages is 2,000 runs, far
// more than the window needs.
export const PER_PAGE = 100;
export const MAX_PAGES = 20;

// The deploy platform's own pipelines, selected by workflow name, by the event
// that starts them, and by branch. This is deliberately an allowlist, twice
// over:
//
//   - By name, so runs that are not the deploy platform (the watch's own
//     `Metrics Watch` schedule, and any future monitor) are excluded. A run
//     whose name is "PR #123" is a per-PR runner and was never a pipeline.
//   - By event and branch, so pull-request-triggered CI and E2E runs are
//     excluded: their failures would otherwise let PR traffic move the
//     platform rate. CI and E2E Tests run on both `push` and `pull_request`;
//     only the push-to-main runs are the platform. Deploy staging runs on
//     `workflow_run` after E2E, Deploy production on `workflow_dispatch` —
//     both on main.
//
// The previous rule (everything whose name is not `PR #\d+`) let the watch's
// own runs fill the window and let PR runs skew it; see PR #676 review.
export const PIPELINE_WORKFLOWS = ['CI', 'E2E Tests', 'Deploy staging', 'Deploy production'];
export const PIPELINE_EVENTS = ['push', 'workflow_run', 'workflow_dispatch'];

// An anomaly is a rise the baseline does not explain. Rates are proportions.
export const RATE_ABS = 0.15; // +15 percentage points
export const RATE_REL = 1.5; // or 1.5x the baseline rate
export const LATENCY_ABS = 1.5; // +50% the baseline median duration

export const QUERY =
  `GET /repos/{owner}/{repo}/actions/runs?per_page=${PER_PAGE} (paged until ` +
  `${WINDOW} pipeline runs or ${MAX_PAGES} pages) ` +
  '(fields used: name,event,head_branch,conclusion,created_at,updated_at,run_started_at,status)';

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

/**
 * Combine several `actions/runs` pages into one payload, newest first, without
 * duplicates. The newest 100 runs on a busy repository can hold no pipeline run
 * at all (issue #689), so the watch reads more than one page; this is the
 * shape those pages collapse into before `normalizeRuns` sorts them.
 */
export function mergeRunPages(pages) {
  const seen = new Set();
  const workflow_runs = [];
  for (const page of pages) {
    for (const run of page?.workflow_runs ?? []) {
      const key = run.id ?? `${run.name}|${run.created_at}|${run.head_branch}`;
      if (seen.has(key)) continue;
      seen.add(key);
      workflow_runs.push(run);
    }
  }
  return { workflow_runs };
}

/** Parse the GitHub runs payload into the shape the analysis needs. */
export function normalizeRuns(payload) {
  const runs = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.pages)
      ? mergeRunPages(payload.pages).workflow_runs
      : (payload.workflow_runs ?? []);
  return runs
    .map((r) => {
      const settled = r.conclusion != null;
      return {
        name: r.name,
        event: r.event,
        branch: r.head_branch,
        conclusion: r.conclusion ?? null,
        status: r.status,
        settled,
        createdAt: Date.parse(r.created_at),
        durationMs: settled ? durationMs(r) : null,
      };
    })
    .filter((r) => Number.isFinite(r.createdAt))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function durationMs(r) {
  const start = Date.parse(r.run_started_at ?? r.created_at);
  const end = Date.parse(r.updated_at ?? r.created_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

const isSettled = (r) => r.settled;
const isFailure = (r) => r.conclusion === 'failure';
// The deploy platform is CI/E2E/deploy on main, however it was triggered.
// Everything else — the watch's own scheduled runs, PR-triggered CI/E2E,
// per-PR runners — is excluded so the pipeline metrics describe one population
// over time. The allowlist also removes the old assumption that a per-PR run
// is always named `PR #<n>`: a workflow that sets `run-name:` could have
// slipped past that name-only test.
const isPipeline = (r) =>
  PIPELINE_WORKFLOWS.includes(r.name) && PIPELINE_EVENTS.includes(r.event) && r.branch === 'main';

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

/** Durations of the settled runs only; an unfinished run has no real duration. */
function completedDurations(runs) {
  return runs.filter(isSettled).map((r) => r.durationMs);
}

/**
 * Compare the newest CURRENT pipeline runs against the older baseline runs.
 * Returns { metrics, anomalies } — anomalies is empty when there is nothing to
 * compare, which is honest: no baseline, no alert.
 */
export function analyze(payload) {
  const all = normalizeRuns(payload);
  const pipelines = all.filter(isPipeline);

  // A window too small for a baseline is not "no anomaly": the pipeline metrics
  // could not be read, so they are reported as unavailable with the reason.
  // Returning an empty `metrics` array here would render the metric as a bare
  // note and a quiet `ANOMALY_COUNT=0` — the "monitor that hears nothing is not
  // a pass" failure (issue #689). The scheduled-job metric below still reads
  // from `all`, so it is unaffected by a thin pipeline window.
  if (pipelines.length < CURRENT + 5) {
    const reason = `only ${pipelines.length} pipeline run(s) read; need ${CURRENT + 5} for a baseline`;
    const curSched = all.filter((r) => r.event === 'schedule').slice(0, CURRENT).filter(isSettled);
    const baseSched = all
      .filter((r) => r.event === 'schedule')
      .slice(CURRENT, WINDOW)
      .filter(isSettled);
    return {
      metrics: [
        {
          key: 'platform.scheduled_job_failures',
          current: curSched.length > 0 ? curSched.filter(isFailure).length : null,
          baseline: baseSched.length > 0 ? baseSched.filter(isFailure).length : null,
          currentN: curSched.length,
          baselineN: baseSched.length,
        },
      ],
      unavailable: [
        { key: 'platform.pipeline_failure_rate', source: 'GitHub Actions runs', reason },
        { key: 'platform.run_duration_median', source: 'GitHub Actions runs', reason },
      ],
      anomalies: [],
      note: null,
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

  // The median is over settled runs only: an unfinished run's `updated_at` is
  // an update, not a finish, so including it would report a partial duration.
  const curDur = median(completedDurations(currentRuns));
  const baseDur = median(completedDurations(baselineRuns));
  if (latencyAnomaly(curDur, baseDur)) {
    anomalies.push({
      metric: 'platform.run_duration_median',
      current: curDur,
      baseline: baseDur,
      threshold: `${LATENCY_ABS}x`,
    });
  }

  // Scheduled-job failures are a separate metric, not part of the pipeline
  // comparison: it observes scheduled workflow runs (the watch's own schedule),
  // which the pipeline allowlist deliberately excludes. Only settled runs are
  // judged — a queued or in-progress schedule has no conclusion yet, and
  // counting it as a sample but not a failure would render an unknown outcome
  // as a healthy 0.
  const scheduled = all.filter((r) => r.event === 'schedule');
  const curSched = scheduled.slice(0, CURRENT).filter(isSettled);
  const baseSched = scheduled.slice(CURRENT, WINDOW).filter(isSettled);

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
      currentN: currentRuns.filter(isSettled).length,
      baselineN: baselineRuns.filter(isSettled).length,
    },
    {
      key: 'platform.scheduled_job_failures',
      current: curSched.length > 0 ? curSched.filter(isFailure).length : null,
      baseline: baseSched.length > 0 ? baseSched.filter(isFailure).length : null,
      currentN: curSched.length,
      baselineN: baseSched.length,
    },
  ];

  return { metrics, anomalies, note: null };
}

const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const secs = (ms) => (ms === null ? 'n/a' : `${(ms / 1000).toFixed(0)}s`);
const count = (v) => (v === null ? 'n/a' : String(v));

export function renderReport(payload, repo) {
  const { metrics, anomalies, unavailable = [], note } = analyze(payload);
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
  }
  if (metrics.length > 0) {
    lines.push('| Metric | Current | Baseline | n (cur/base) |');
    lines.push('|---|---|---|---|');
    for (const m of metrics) {
      const fmt = m.key.includes('duration') ? secs : m.key.includes('rate') ? pct : count;
      lines.push(
        `| ${m.key} | ${fmt(m.current)} | ${fmt(m.baseline)} | ${m.currentN}/${m.baselineN} |`
      );
    }
  } else if (!note) {
    lines.push('_No metric was readable in this run; every one is named as unavailable below._');
  }
  lines.push('');
  lines.push('### Unavailable metrics (reported, never alerted)');
  lines.push('');
  lines.push('| Metric | Source | Why it could not be read |');
  lines.push('|---|---|---|');
  for (const u of [...unavailable, ...UNAVAILABLE]) {
    lines.push(`| ${u.key} | ${u.source} | ${u.reason} |`);
  }
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

/**
 * Read enough pages of `actions/runs` to fill the window with pipeline runs.
 * A single page is the newest 100 runs across all workflows and on a busy
 * repository holds no CI/E2E/deploy run at all (issue #689), so the newest
 * page is only a starting point. Stops when WINDOW pipeline runs have been
 * collected, when the history ends, or at MAX_PAGES. Returns the pages as
 * `{ pages }` for `normalizeRuns`.
 */
async function fetchRunPages(repo) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cipansor-metrics-watch',
  };
  const pages = [];
  let pipelineCount = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=${PER_PAGE}&page=${page}`,
      { headers }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${repo} (page ${page})`);
    const body = await res.json();
    pages.push(body);
    pipelineCount += (body.workflow_runs ?? []).filter((r) =>
      PIPELINE_WORKFLOWS.includes(r.name) &&
      PIPELINE_EVENTS.includes(r.event) &&
      r.head_branch === 'main'
    ).length;
    if ((body.workflow_runs ?? []).length < PER_PAGE) break;
    if (pipelineCount >= WINDOW) break;
  }
  return { pages };
}

function selfTest() {
  const fixture = (name) => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`self-test failed: ${msg}`);
  };

  const quiet = renderReport(fixture('runs-quiet.json'), 'o/r');
  assert(quiet.anomalies.length === 0, 'quiet window must have no anomalies');
  assert(quiet.report.includes('Unavailable metrics'), 'report must list unavailable metrics');
  // All four pipeline workflows count, including the two that are not triggered
  // by a push (Deploy staging on workflow_run, Deploy production on
  // workflow_dispatch). A `push`-only rule would leave the baseline at 10.
  assert(
    quiet.report.includes('| platform.run_duration_median | 210s | 210s | 20/40 |'),
    'deploy workflows (workflow_run / workflow_dispatch) must count as pipelines'
  );

  const spike = renderReport(fixture('runs-failure-spike.json'), 'o/r');
  assert(
    spike.anomalies.some((a) => a.metric === 'platform.pipeline_failure_rate'),
    'failure spike must raise the failure-rate anomaly'
  );

  // Pipeline metrics are CI/E2E/deploy on a push to main only: failures in the
  // watch's own schedules and in PR-triggered runs must not move them.
  const nonPipeline = renderReport(fixture('runs-non-pipeline-failures.json'), 'o/r');
  assert(
    nonPipeline.anomalies.length === 0,
    'non-pipeline failures (watch schedules, PR runs) must not alert'
  );

  // An unfinished run has no conclusion and no duration: it must be left out of
  // the sample counts, and an in-progress schedule must not read as a healthy 0.
  const unfinished = renderReport(fixture('runs-unfinished.json'), 'o/r');
  assert(unfinished.anomalies.length === 0, 'unfinished runs must not alert');
  const unfinishedReport = unfinished.report;
  assert(
    unfinishedReport.includes('| platform.pipeline_failure_rate | 0.0% | 0.0% | 17/40 |'),
    'unfinished pipeline runs must be excluded from the failure-rate samples'
  );
  assert(
    unfinishedReport.includes('| platform.scheduled_job_failures | n/a | n/a | 0/0 |'),
    'an in-progress schedule must render n/a, not a healthy zero'
  );

  // A window too small for a baseline must alert on nothing, but must NOT
  // render as a pass: the pipeline metrics are unavailable, with the reason.
  const thin = renderReport(
    { workflow_runs: fixture('runs-quiet.json').workflow_runs.slice(0, 5) },
    'o/r'
  );
  assert(thin.anomalies.length === 0, 'no baseline means no alert');
  assert(
    thin.report.includes('pipeline run(s) read; need 25 for a baseline'),
    'a thin pipeline window must name the pipeline metrics unavailable with the count'
  );
  assert(
    thin.report.includes('| platform.pipeline_failure_rate | GitHub Actions runs |'),
    'the pipeline metrics must appear in the unavailable table, not as a bare note'
  );

  // The real #689 shape: the newest page is entirely PR/review runs (no
  // pipeline run), and only the older page carries the CI/E2E/deploy history.
  // Merging the pages must recover the window and populate the metrics instead
  // of reading nothing.
  const quietRuns = fixture('runs-quiet.json').workflow_runs;
  const newestPage = Array.from({ length: 40 }, (_, i) => ({
    id: 900000 + i,
    name: `PR #${600 + i}`,
    event: 'pull_request',
    head_branch: `feature/${i}`,
    conclusion: 'success',
    created_at: '2026-10-07T00:00:00Z',
    status: 'completed',
  }));
  const olderPage = quietRuns
    .filter(
      (r) =>
        PIPELINE_WORKFLOWS.includes(r.name) &&
        PIPELINE_EVENTS.includes(r.event) &&
        r.head_branch === 'main'
    )
    .map((r, i) => ({ ...r, id: 800000 + i }));
  const paged = renderReport(
    { pages: [{ workflow_runs: newestPage }, { workflow_runs: olderPage }] },
    'o/r'
  );
  assert(
    paged.anomalies.length === 0,
    'paging past a pipeline-free newest page must not invent an anomaly'
  );
  assert(
    paged.report.includes('| platform.pipeline_failure_rate |'),
    'paging must populate the pipeline metrics when the newest page holds none'
  );
  assert(
    !paged.report.includes('pipeline run(s) read; need 25'),
    'paging past a pipeline-free newest page must not report the metrics unavailable'
  );

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
  const payload = await fetchRunPages(repo);
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
