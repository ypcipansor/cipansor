import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseArgs,
  slugFor,
  extract,
  compare,
  baselinePath,
  readBaseline,
  baselineMatches,
  summaryProblem,
  isSharedTarget,
} from './run-load-tests.mjs';
import { REGRESSION, thresholdsFor, latencyLimit } from './config.js';

test('parseArgs: defaults', () => {
  const args = parseArgs([]);
  assert.equal(args.profile, 'smoke');
  assert.equal(args.scenario, 'public-smoke');
  assert.equal(args.updateBaseline, false);
  assert.equal(args.json, false);
  assert.equal(args.allowSharedTarget, false);
});

test('parseArgs: reads every flag', () => {
  const args = parseArgs([
    '--url',
    'https://staging.cipansor.or.id',
    '--scenario',
    'authenticated-read',
    '--profile',
    'load',
    '--baseline',
    '/tmp/baseline.json',
    '--report',
    '/tmp/report.json',
    '--update-baseline',
    '--allow-shared-target',
    '--json',
  ]);
  assert.equal(args.url, 'https://staging.cipansor.or.id');
  assert.equal(args.scenario, 'authenticated-read');
  assert.equal(args.profile, 'load');
  assert.equal(args.baseline, '/tmp/baseline.json');
  assert.equal(args.report, '/tmp/report.json');
  assert.equal(args.updateBaseline, true);
  assert.equal(args.allowSharedTarget, true);
  assert.equal(args.json, true);
});

test('slugFor: a host becomes a filesystem-safe slug', () => {
  assert.equal(slugFor('https://staging.cipansor.or.id'), 'staging-cipansor-or-id');
  assert.equal(slugFor('http://localhost:3001'), 'localhost-3001');
});

test('slugFor: an unparseable URL does not throw', () => {
  assert.equal(slugFor('not a url'), 'unknown-target');
});

test('baselinePath: one baseline per host, scenario AND profile', () => {
  const p = baselinePath('https://staging.cipansor.or.id', 'public-smoke', 'smoke');
  assert.match(p, /staging-cipansor-or-id__public-smoke__smoke\.json$/);
  assert.notEqual(p, baselinePath('http://localhost:3001', 'public-smoke', 'smoke'));
  assert.notEqual(p, baselinePath('https://staging.cipansor.or.id', 'authenticated-read', 'smoke'));
  // The same host and scenario at a different profile is a different reference.
  assert.notEqual(p, baselinePath('https://staging.cipansor.or.id', 'public-smoke', 'load'));
});

test('isSharedTarget: recognises the shared staging host only', () => {
  assert.equal(isSharedTarget('https://staging.cipansor.or.id'), true);
  assert.equal(isSharedTarget('http://localhost:3001'), false);
  assert.equal(isSharedTarget('not a url'), false);
});

test('readBaseline: a missing file is distinguishable from a malformed one', () => {
  const missing = readBaseline('/tmp/definitely-not-a-baseline-cipansor.json');
  assert.equal(missing.exists, false);
  assert.equal(missing.baseline, null);
  assert.equal(missing.error, null);
});

test('validateBaseline: a hand-edited baseline missing fields is unusable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cipansor-load-test-'));
  try {
    const path = join(dir, 'bad.json');
    writeFileSync(path, JSON.stringify({ p95: 100 })); // no url/scenario/profile
    const bad = readBaseline(path);
    assert.equal(bad.exists, true);
    assert.equal(bad.baseline, null);
    assert.match(bad.error, /missing "url"/);

    const malformedPath = join(dir, 'malformed.json');
    writeFileSync(malformedPath, '{ not json');
    const malformed = readBaseline(malformedPath);
    assert.equal(malformed.exists, true);
    assert.match(malformed.error, /malformed JSON/);

    const goodPath = join(dir, 'good.json');
    writeFileSync(goodPath, JSON.stringify({ url: 'http://localhost:3001', scenario: 'public-smoke', profile: 'smoke', p95: 10 }));
    const good = readBaseline(goodPath);
    assert.equal(good.error, null);
    assert.equal(good.baseline.p95, 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('baselineMatches: null when target, scenario and profile agree', () => {
  const baseline = { url: 'https://staging.cipansor.or.id', scenario: 'public-smoke', profile: 'smoke' };
  assert.equal(baselineMatches(baseline, { url: 'https://staging.cipansor.or.id/', scenario: 'public-smoke', profile: 'smoke' }), null);
});

test('baselineMatches: reports a different target, scenario or profile', () => {
  const baseline = { url: 'https://staging.cipansor.or.id', scenario: 'public-smoke', profile: 'smoke' };
  assert.match(
    baselineMatches(baseline, { url: 'http://localhost:3001', scenario: 'public-smoke', profile: 'smoke' }),
    /not http:\/\/localhost:3001/
  );
  assert.match(
    baselineMatches(baseline, { url: 'https://staging.cipansor.or.id', scenario: 'authenticated-read', profile: 'smoke' }),
    /scenario/
  );
  assert.match(
    baselineMatches(baseline, { url: 'https://staging.cipansor.or.id', scenario: 'public-smoke', profile: 'load' }),
    /profile/
  );
});

test('summaryProblem: a summary with no samples is not a measurement', () => {
  assert.match(summaryProblem({ metrics: {} }), /response counters/);
  assert.match(summaryProblem({ metrics: { expected_responses: { count: 0 } } }), /expected_response_duration/);
  assert.equal(summaryProblem({ metrics: { expected_responses: { count: 1 }, expected_response_duration: { 'p(95)': 1 } } }), null);
  assert.match(summaryProblem(undefined), /metrics/);
});


function summaryWith({ p50, p95, p99, avg, expected, unexpected, checksRate }) {
  // k6 v0.54 summary-export shape: metrics are flat, not nested under `values`.
  return {
    metrics: {
      expected_response_duration: { 'p(50)': p50, 'p(95)': p95, 'p(99)': p99, avg },
      expected_responses: { count: expected },
      unexpected_responses: { count: unexpected },
      checks: { value: checksRate },
    },
  };
}

test('extract: pulls percentiles and computes the real error rate', () => {
  const current = extract(summaryWith({ p50: 10, p95: 40, p99: 80, avg: 20, expected: 36, unexpected: 4, checksRate: 0.9 }));
  assert.equal(current.p50, 10);
  assert.equal(current.p95, 40);
  assert.equal(current.p99, 80);
  assert.equal(current.requests, 40);
  assert.equal(current.errorRate, 0.1);
  assert.equal(current.checksRate, 0.9);
});

test('extract: also reads the nested `values` shape some k6 builds emit', () => {
  const current = extract({
    metrics: {
      expected_response_duration: { values: { 'p(95)': 55 } },
      expected_responses: { values: { count: 2 } },
      unexpected_responses: { values: { count: 0 } },
    },
  });
  assert.equal(current.p95, 55);
  assert.equal(current.requests, 2);
  assert.equal(current.errorRate, 0);
});

test('extract: counts 429s separately from app errors', () => {
  const current = extract({
    metrics: {
      expected_response_duration: { 'p(95)': 20 },
      expected_responses: { count: 10 },
      unexpected_responses: { count: 0 },
      rate_limited: { count: 3 },
      checks: { value: 1 },
    },
  });
  // A throttled run has no app errors but is still not comparable.
  assert.equal(current.errorRate, 0);
  assert.equal(current.rateLimited, 3);
});

test('extract: latency comes from the same series the thresholds read', () => {
  // The overall http_req_duration carries the expected 401s; the thresholds do
  // not. If extract() ever reads the overall series again, this fails.
  const current = extract({
    metrics: {
      http_req_duration: { 'p(95)': 9999 },
      expected_response_duration: { 'p(95)': 55 },
      expected_responses: { count: 1 },
      unexpected_responses: { count: 0 },
    },
  });
  assert.equal(current.p95, 55);
  assert.deepEqual(Object.keys(thresholdsFor({ p95: 100, p99: 200 })), ['checks', 'expected_response_duration']);
});

test('extract: an empty summary does not divide by zero', () => {
  const current = extract({ metrics: {} });
  assert.equal(current.errorRate, 0);
  assert.equal(current.requests, 0);
  assert.equal(current.p95, undefined);
});

test('compare: no baseline means no regressions', () => {
  assert.deepEqual(compare({ p95: 9999, p99: 9999, errorRate: 0.9 }, null), []);
});

test('compare: a run inside the tolerances is not a regression', () => {
  const baseline = { p95: 100, p99: 200, errorRate: 0 };
  const current = { p95: 100 * REGRESSION.p95 - 1, p99: 200 * REGRESSION.p99 - 1, errorRate: 0 };
  assert.deepEqual(compare(current, baseline), []);
});

test('compare: a p95 step change is flagged with both numbers', () => {
  const regressions = compare({ p95: 160, p99: 200, errorRate: 0 }, { p95: 100, p99: 200, errorRate: 0 });
  assert.equal(regressions.length, 1);
  assert.equal(regressions[0].metric, 'p95');
  assert.equal(regressions[0].baseline, 100);
  assert.equal(regressions[0].current, 160);
});

test('compare: a p99 step change is flagged', () => {
  const regressions = compare(
    { p95: 100, p99: 400, requests: 200, errorRate: 0 },
    { p95: 100, p99: 200, requests: 200, errorRate: 0 },
  );
  assert.equal(regressions.length, 1);
  assert.equal(regressions[0].metric, 'p99');
});

test('compare: an error rate over the ceiling is flagged', () => {
  const regressions = compare({ p95: 100, p99: 200, errorRate: 0.05 }, { p95: 100, p99: 200, errorRate: 0 });
  assert.equal(regressions.length, 1);
  assert.equal(regressions[0].metric, 'errorRate');
});

test('compare: a checks rate under 0.99 is flagged', () => {
  const regressions = compare({ p95: 100, p99: 200, errorRate: 0, checksRate: 0.5 }, { p95: 100, p99: 200, errorRate: 0 });
  assert.equal(regressions.length, 1);
  assert.equal(regressions[0].metric, 'checksRate');
});

test('compare: a checks rate of exactly 0.99 is a failure, matching k6\'s rate>0.99', () => {
  const regressions = compare({ p95: 100, p99: 200, errorRate: 0, checksRate: 0.99 }, { p95: 100, p99: 200, errorRate: 0 });
  assert.deepEqual(
    regressions.map((r) => r.metric),
    ['checksRate'],
  );
  assert.deepEqual(compare({ p95: 100, p99: 200, errorRate: 0, checksRate: 1 }, { p95: 100, p99: 200, errorRate: 0 }), []);
});

test('thresholdsFor: an empty baseline keeps only the check threshold', () => {
  assert.deepEqual(thresholdsFor(null), { checks: [`rate>${REGRESSION.checksRate}`] });
});

test('thresholdsFor: builds latency thresholds from the baseline', () => {
  const thresholds = thresholdsFor({ p95: 100, p99: 200, requests: 200 });
  const latency = thresholds.expected_response_duration;
  assert.deepEqual(latency, [`p(95)<${latencyLimit(100, REGRESSION.p95)}`, `p(99)<${latencyLimit(200, REGRESSION.p99)}`]);
});

test('compare and the k6 threshold agree at the exact limit', () => {
  // k6 emits `p(95)<limit` and compare flags at the same rounded limit, so a
  // run exactly at it is a regression on both sides — never "thresholds
  // crossed" from k6 with "no regression" from the runner.
  const baseline = { p95: 100, p99: 200, requests: 200, errorRate: 0 };
  const limit = latencyLimit(100, REGRESSION.p95);
  const atLimit = compare({ p95: limit, p99: 100, requests: 200, errorRate: 0 }, baseline);
  assert.deepEqual(
    atLimit.map((r) => r.metric),
    ['p95'],
  );
  const justUnder = compare({ p95: limit - 1, p99: 100, requests: 200, errorRate: 0 }, baseline);
  assert.deepEqual(justUnder, []);
});

test('latencyLimit: rounds up so both sides use the same strict boundary', () => {
  assert.equal(latencyLimit(292.217088, 1.5), 439);
  assert.equal(latencyLimit(100, 1.5), 150);
});

test('thresholdsFor: omits the p99 threshold when the baseline is too small', () => {
  // 48 samples: p99 is the single slowest request, so it is not thresholded.
  const latency = thresholdsFor({ p95: 100, p99: 200, requests: 48 }).expected_response_duration;
  assert.deepEqual(latency, [`p(95)<${latencyLimit(100, REGRESSION.p95)}`]);
});

test('compare: ignores p99 until the run has enough samples', () => {
  const baseline = { p95: 100, p99: 200, requests: 200, errorRate: 0 };
  const small = compare({ p95: 100, p99: 9999, requests: 48, errorRate: 0 }, baseline);
  assert.deepEqual(small, []);
  const big = compare({ p95: 100, p99: 9999, requests: 200, errorRate: 0 }, baseline);
  assert.deepEqual(
    big.map((r) => r.metric),
    ['p99'],
  );
});

test('compare: ignores p99 when the BASELINE is too small, matching the k6 threshold', () => {
  // thresholdsFor omits the p99 threshold for a 48-sample baseline, so compare
  // must not flag p99 from a large run either — otherwise the two disagree.
  const baseline = { p95: 100, p99: 200, requests: 48, errorRate: 0 };
  assert.deepEqual(compare({ p95: 100, p99: 9999, requests: 200, errorRate: 0 }, baseline), []);
});
