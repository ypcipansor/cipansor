// Compare a fresh load summary against the recorded baseline.
//
//   node tests/load/lib/compare.mjs            # compare summary.json vs baseline.json
//   node tests/load/lib/compare.mjs --update   # only if clean, write baseline.json from summary
//
// Exit codes: 0 clean (or --update written), 1 regression, 2 missing input.
//
// Staging is a shared, single-instance App Service, so a latency ratio can move
// on noise alone. A regression therefore needs to clear BOTH a ratio and an
// absolute floor before it is reported. Error rate is judged on its own, since
// a 5% failure needs no ratio to be real.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const loadDir = resolve(here, "..");
const summaryPath = resolve(loadDir, "summary.json");
const baselinePath = resolve(loadDir, "baseline.json");

const ERROR_RATE_CEILING = 0.05; // 5% of requests failing is a regression
const P95_RATIO = 1.5;
const P99_RATIO = 2.0;
const MIN_ABSOLUTE_MS = 50; // ignore tiny baselines; below this a ratio is noise

if (!existsSync(summaryPath)) {
  console.error(`missing ${summaryPath} — run the load smoke first`);
  process.exit(2);
}
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const update = process.argv.includes("--update");

const hasBaseline = existsSync(baselinePath);
const baseline = hasBaseline ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

function regressionsAgainst(base, current) {
  const found = [];
  const m = current.metrics;

  if (m.errorRate > ERROR_RATE_CEILING) {
    found.push(
      `error rate ${(m.errorRate * 100).toFixed(2)}% exceeds ceiling ` +
        `${(ERROR_RATE_CEILING * 100).toFixed(0)}%`
    );
  }

  const compare = [
    ["p95", P95_RATIO],
    ["p99", P99_RATIO],
  ];
  for (const [key, ratio] of compare) {
    const b = base.metrics[key];
    const c = m[key];
    if (b == null || c == null) continue;
    const limit = Math.max(b * ratio, b + MIN_ABSOLUTE_MS);
    if (c > limit) {
      found.push(
        `${key} ${c.toFixed(0)}ms exceeds ${limit.toFixed(0)}ms ` +
          `(baseline ${b.toFixed(0)}ms × ${ratio} or +${MIN_ABSOLUTE_MS}ms)`
      );
    }
  }
  return found;
}

function fmtLine(label, base, cur) {
  const b = base == null ? "-" : base.toFixed(0);
  const c = cur == null ? "-" : cur.toFixed(0);
  return `${label.padEnd(10)} baseline=${b.padEnd(8)} current=${c.padEnd(8)}`;
}

const comparison = {
  recordedAt: summary.recordedAt,
  target: summary.target,
  hadBaseline: hasBaseline,
  baselineRecordedAt: baseline ? baseline.recordedAt : null,
  current: summary.metrics,
  baseline: baseline ? baseline.metrics : null,
  regressions: [],
  clean: true,
};

if (baseline) {
  comparison.regressions = regressionsAgainst(baseline, summary);
  comparison.clean = comparison.regressions.length === 0;

  console.log(`Load comparison @ ${summary.target}`);
  console.log(`baseline recorded: ${baseline.recordedAt}`);
  console.log(fmtLine("p50", baseline.metrics.p50, summary.metrics.p50));
  console.log(fmtLine("p95", baseline.metrics.p95, summary.metrics.p95));
  console.log(fmtLine("p99", baseline.metrics.p99, summary.metrics.p99));
  console.log(
    `error rate  baseline=${(baseline.metrics.errorRate * 100).toFixed(2)}%  ` +
      `current=${(summary.metrics.errorRate * 100).toFixed(2)}%`
  );

  if (comparison.clean) {
    console.log("\nCLEAN — no regression against the baseline.");
  } else {
    console.log("\nREGRESSION:");
    for (const r of comparison.regressions) console.log(`  - ${r}`);
  }
} else {
  console.log(`No baseline at ${baselinePath}; this run will establish one.`);
  if (summary.metrics.errorRate > ERROR_RATE_CEILING) {
    comparison.clean = false;
    comparison.regressions.push(
      `error rate ${(summary.metrics.errorRate * 100).toFixed(2)}% exceeds ceiling ` +
        `${(ERROR_RATE_CEILING * 100).toFixed(0)}% on the establishing run`
    );
    console.log("\nNOT CLEAN — a baseline is not recorded for a run above the error ceiling.");
  }
}

writeFileSync(resolve(loadDir, "comparison.json"), JSON.stringify(comparison, null, 2) + "\n");

if (update) {
  if (!comparison.clean) {
    console.error("refusing to update the baseline: the run is not clean");
    process.exit(1);
  }
  if (!baseline || JSON.stringify(baseline) !== JSON.stringify(summary)) {
    writeFileSync(baselinePath, JSON.stringify(summary, null, 2) + "\n");
    console.log(`baseline updated: ${baselinePath}`);
  } else {
    console.log("baseline unchanged");
  }
  process.exit(0);
}

process.exit(comparison.clean ? 0 : 1);
