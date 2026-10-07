#!/usr/bin/env node
/**
 * Load-test runner.
 *
 * Wraps k6 so the same invocation records a baseline, runs against a target,
 * compares the result with the last recorded baseline, and reports regressions
 * with numbers. It is a plain Node ESM script with no dependencies, so it runs
 * on a runner with nothing but Node and the k6 binary.
 *
 *   node tests/load/run-load-tests.mjs --url https://staging.cipansor.or.id --scenario public-smoke
 *   node tests/load/run-load-tests.mjs --url http://localhost:3001 --scenario public-smoke --update-baseline
 *
 * Flags:
 *   --url <url>              target base URL (default $BASE_URL or http://localhost:3001)
 *   --scenario <name>        file in scenarios/ without .js (default public-smoke)
 *   --profile <smoke|load>   load profile (default smoke)
 *   --update-baseline        write the run as the new baseline
 *   --baseline <path>        compare against this baseline instead of the default
 *   --json                   print the machine-readable report only
 *   --report <path>          also write the machine-readable report to this file
 *
 * Environment:
 *   K6_BIN                   path to k6 (else PATH, then /tmp/k6)
 *   LOAD_TEST_EMAIL / LOAD_TEST_PASSWORD   credentials for the authenticated scenario
 *
 * Exit code: 0 = no regression, 1 = regression found, 2 = could not run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

import { REGRESSION } from './config.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = join(HERE, 'baselines');

function parseArgs(argv) {
  const args = { profile: 'smoke', scenario: 'public-smoke', updateBaseline: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--scenario') args.scenario = argv[++i];
    else if (a === '--profile') args.profile = argv[++i];
    else if (a === '--baseline') args.baseline = argv[++i];
    else if (a === '--report') args.report = argv[++i];
    else if (a === '--update-baseline') args.updateBaseline = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function findK6() {
  if (process.env.K6_BIN && existsSync(process.env.K6_BIN)) return process.env.K6_BIN;
  const onPath = spawnSync('sh', ['-c', 'command -v k6'], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim();
  for (const candidate of ['/tmp/k6', '/usr/local/bin/k6', '/usr/bin/k6']) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function slugFor(url) {
  try {
    const host = new URL(url).host;
    return host.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  } catch {
    return 'unknown-target';
  }
}

function baselinePath(url, scenario) {
  return join(BASELINE_DIR, `${slugFor(url)}__${scenario}.json`);
}

function readBaseline(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`Could not read baseline ${path}: ${err.message}`);
    return null;
  }
}

function metric(summary, name, value) {
  const m = summary.metrics && summary.metrics[name];
  if (!m) return undefined;
  // k6's summary-export is flat (`{p(95): …}`); older builds nested it under
  // `values`. Accept both so a different k6 build does not silently read n/a.
  const bag = m.values || m;
  return bag[value];
}

function extract(summary) {
  const expected = metric(summary, 'expected_responses', 'count') ?? 0;
  const unexpected = metric(summary, 'unexpected_responses', 'count') ?? 0;
  const rateLimited = metric(summary, 'rate_limited', 'count') ?? 0;
  const total = expected + unexpected;
  // Latency comes from `expected_response_duration`, the same series the k6
  // thresholds read — never the overall `http_req_duration`, whose 401s made
  // the two disagree. See config.js thresholdsFor().
  const duration = 'expected_response_duration';
  return {
    p50: metric(summary, duration, 'p(50)'),
    p95: metric(summary, duration, 'p(95)'),
    p99: metric(summary, duration, 'p(99)'),
    avg: metric(summary, duration, 'avg'),
    errorRate: total > 0 ? unexpected / total : 0,
    requests: total,
    rateLimited,
    checksRate: metric(summary, 'checks', 'value'),
  };
}

function compare(current, baseline) {
  const regressions = [];
  if (!baseline) return regressions;
  const round = (n) => Math.round(n * 100) / 100;
  if (baseline.p95 && current.p95 && current.p95 > baseline.p95 * REGRESSION.p95) {
    regressions.push({
      metric: 'p95',
      baseline: round(baseline.p95),
      current: round(current.p95),
      threshold: `${REGRESSION.p95}x`,
    });
  }
  if (baseline.p99 && current.p99 && current.requests >= REGRESSION.p99MinSamples && current.p99 > baseline.p99 * REGRESSION.p99) {
    regressions.push({
      metric: 'p99',
      baseline: round(baseline.p99),
      current: round(current.p99),
      threshold: `${REGRESSION.p99}x`,
    });
  }
  if (current.errorRate > REGRESSION.errorRate) {
    regressions.push({
      metric: 'errorRate',
      baseline: round(baseline.errorRate ?? 0),
      current: round(current.errorRate),
      threshold: `${REGRESSION.errorRate}`,
    });
  }
  if (current.checksRate !== undefined && current.checksRate < 0.99) {
    regressions.push({
      metric: 'checksRate',
      baseline: round(baseline.checksRate ?? 1),
      current: round(current.checksRate),
      threshold: '<0.99',
    });
  }
  return regressions;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 26).join('\n'));
    return 0;
  }

  const url = args.url || process.env.BASE_URL || 'http://localhost:3001';
  const script = join(HERE, 'scenarios', `${args.scenario}.js`);
  if (!existsSync(script)) {
    console.error(`No such scenario: ${script}`);
    return 2;
  }
  const k6 = findK6();
  if (!k6) {
    console.error('k6 not found. Set K6_BIN, put k6 on PATH, or install it to /tmp/k6.');
    return 2;
  }

  const bPath = args.baseline || baselinePath(url, args.scenario);
  const baseline = readBaseline(bPath);
  const summaryFile = join(tmpdir(), `k6-summary-${Date.now()}.json`);

  const env = {
    ...process.env,
    BASE_URL: url,
    PROFILE: args.profile,
  };
  if (baseline) env.BASELINE_JSON = JSON.stringify(baseline);

  const run = spawnSync(k6, ['run', `--summary-export=${summaryFile}`, script], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env,
  });

  let summary;
  try {
    summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
  } finally {
    if (existsSync(summaryFile)) rmSync(summaryFile);
  }

  const current = extract(summary);
  // A throttled run measured the API's limiter, not the app: its latency and
  // error rate are meaningless. Never record it as a baseline and never let it
  // flag a regression — say so and stop.
  const throttled = current.rateLimited > 0;
  const regressions = throttled ? [] : compare(current, baseline);
  const report = {
    scenario: args.scenario,
    profile: args.profile,
    url,
    baselinePath: baseline ? bPath : null,
    k6ExitCode: run.status,
    throttled,
    current,
    baseline: baseline || null,
    regressions,
  };

  if (args.updateBaseline && !throttled) {
    mkdirSync(BASELINE_DIR, { recursive: true });
    writeFileSync(bPath, `${JSON.stringify({ ...current, url, scenario: args.scenario, profile: args.profile, recordedAt: new Date().toISOString() }, null, 2)}\n`);
    report.baselineWritten = bPath;
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  // Written before the exit code is decided, so a CI job keeps the numbers
  // even when the run is flagged as a regression.
  if (args.report) {
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (throttled) return 2;
  if (regressions.length > 0) return 1;
  if (run.status !== 0 && run.status !== 99) return 2; // 99 = k6 thresholds crossed
  return 0;
}

function fmt(v) {
  return v === undefined || v === null ? 'n/a' : Math.round(v * 100) / 100;
}

function printHuman(report) {
  const c = report.current;
  console.log('');
  console.log(`Load test: ${report.scenario} (${report.profile}) against ${report.url}`);
  console.log(`  requests ${c.requests}   error rate ${(c.errorRate * 100).toFixed(2)}%   checks ${fmt(c.checksRate)}`);
  if (c.rateLimited > 0) {
    console.log(`  RATE LIMITED: ${c.rateLimited} responses were 429 — the numbers below measured the limiter, not the app.`);
    console.log('  No baseline was recorded or compared. Wait out the rate-limit window and run again.');
  }
  console.log(`  p50 ${fmt(c.p50)}ms   p95 ${fmt(c.p95)}ms   p99 ${fmt(c.p99)}ms   avg ${fmt(c.avg)}ms`);
  if (report.baseline) {
    const b = report.baseline;
    console.log(`  baseline (${report.baselinePath}):`);
    console.log(`    p50 ${fmt(b.p50)}ms   p95 ${fmt(b.p95)}ms   p99 ${fmt(b.p99)}ms   error ${(b.errorRate * 100).toFixed(2)}%`);
  } else {
    console.log('  no baseline recorded yet — run with --update-baseline to record one');
  }
  if (report.baselineWritten) {
    console.log(`  baseline written to ${report.baselineWritten}`);
  }
  if (report.regressions.length === 0) {
    console.log('  no regression against the baseline');
  } else {
    console.log('  REGRESSION(S):');
    for (const r of report.regressions) {
      console.log(`    ${r.metric}: baseline ${r.baseline} -> current ${r.current} (allowed ${r.threshold})`);
    }
  }
}

// Only run when invoked directly; importing this file (the unit test does)
// must not start a load test.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exit(main());

export { parseArgs, slugFor, extract, compare, findK6, baselinePath };
