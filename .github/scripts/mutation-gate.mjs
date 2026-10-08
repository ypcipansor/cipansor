// Mutation-score gate. Reads the Stryker json report (apps/api/reports/mutation/
// mutation.json), prints the score, and — on a scheduled run — opens a GitHub
// issue when the score dropped more than `tolerance` below the committed
// baseline (.github/mutation-baseline.json).
//
// Two modes:
//   node .github/scripts/mutation-gate.mjs            # compare + print (CI job)
//   node .github/scripts/mutation-gate.mjs --issue    # also open an issue on a drop
//
// Env: GITHUB_TOKEN / GH_TOKEN, GITHUB_REPOSITORY (owner/name), and optionally
//      MUTATION_REPORT, MUTATION_BASELINE.
import { readFileSync, existsSync } from "node:fs";

const REPORT =
  process.env.MUTATION_REPORT ?? "apps/api/reports/mutation/mutation.json";
const BASELINE =
  process.env.MUTATION_BASELINE ?? ".github/mutation-baseline.json";
const wantIssue = process.argv.includes("--issue");
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
const repo = process.env.GITHUB_REPOSITORY ?? "";

if (!existsSync(REPORT)) {
  console.error(
    `mutation-gate: report not found at ${REPORT} — did Stryker write json?`,
  );
  process.exit(1);
}

const report = JSON.parse(readFileSync(REPORT, "utf8"));
const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, "utf8"))
  : {};

// Stryker's json report is `{ files: { <path>: { mutants: [{status}] } } }`.
// The mutation score follows Stryker's own formula: detected = Killed + Timeout
// + RuntimeError; the denominator adds Survived + NoCoverage. Ignored,
// CompileError and Pending are excluded.
const mutants = Object.values(report.files ?? {}).flatMap(
  (f) => f.mutants ?? [],
);
const counts = mutants.reduce((acc, m) => {
  acc[m.status] = (acc[m.status] ?? 0) + 1;
  return acc;
}, {});
const detected =
  (counts.Killed ?? 0) + (counts.Timeout ?? 0) + (counts.RuntimeError ?? 0);
const counted = detected + (counts.Survived ?? 0) + (counts.NoCoverage ?? 0);
const score = counted === 0 ? 0 : (detected / counted) * 100;

const base = typeof baseline.score === "number" ? baseline.score : null;
const tolerance = Number(baseline.tolerance ?? 1);
const floor =
  typeof baseline.break_threshold === "number" ? baseline.break_threshold : 0;

console.log("Mutation summary:", JSON.stringify(counts));
console.log(
  `Mutation score: ${score.toFixed(2)}%  (baseline: ${base === null ? "none" : base.toFixed(2) + "%"})`,
);

const brokeFloor = score < floor;
const regressed = base !== null && score < base - tolerance;

if (brokeFloor) {
  console.error(
    `mutation-gate: score ${score.toFixed(2)}% is below the break threshold ${floor}%.`,
  );
}
if (regressed) {
  console.error(
    `mutation-gate: score ${score.toFixed(2)}% dropped more than ${tolerance} below the ` +
      `baseline ${base.toFixed(2)}%.`,
  );
}

if ((brokeFloor || regressed) && wantIssue && token && repo) {
  const title = `Mutation score dropped to ${score.toFixed(2)}% on the critical-path set`;
  const body = [
    "The scheduled mutation run on the curated critical-path set (`apps/api/stryker.config.mjs`) regressed.",
    "",
    `- score: **${score.toFixed(2)}%**`,
    `- baseline: ${base === null ? "none" : base.toFixed(2) + "%"} (tolerance ${tolerance}%)`,
    `- break threshold: ${floor}%`,
    `- mutant statuses: \`${JSON.stringify(counts)}\``,
    "",
    "A surviving mutant means a test reached the line but did not assert its behaviour. Look at",
    "`apps/api/reports/mutation/mutation.json` (uploaded as an artifact on the run) for the exact",
    "mutants, then strengthen the assertions — do not lower the baseline.",
    "",
    "_This issue was created by an AI agent (OpenHands) on behalf of the maintainer._",
  ].join("\n");

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      body,
      labels: ["chore", "automation-health"],
    }),
  });
  if (!res.ok) {
    console.error(
      `mutation-gate: could not open the issue: ${res.status} ${await res.text()}`,
    );
    process.exit(1);
  }
  console.log("mutation-gate: opened a regression issue.");
}

process.exit(brokeFloor ? 1 : 0);
