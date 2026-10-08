#!/usr/bin/env node
/**
 * Changelog generator.
 *
 * The release path is automated everywhere except the changelog. A GitHub
 * Release is a human act, so an automation that only fires on `release.published`
 * (SDLC 14) is dark until someone remembers to publish one. This script gives the
 * changelog a source that cannot be skipped: the pull requests that actually
 * merged into `main`, read from the GitHub API on a schedule.
 *
 * Two modes, so the same grouping rule can be checked without the network:
 *
 *   node scripts/changelog.mjs --self-test
 *       Runs the pure functions over inline fixtures and exits non-zero on a
 *       wrong classification, ordering, dedup or merge. No network, no gh.
 *
 *   node scripts/changelog.mjs --repo <owner/name> [--out CHANGELOG.md] [--today YYYY-MM-DD] [--dry-run]
 *       Reads merged PRs since the newest `v*` tag (or the root commit when no
 *       tag exists), prepends a `## <date>` section for the ones not already
 *       listed, and rewrites the file. `--dry-run` prints the new section and
 *       writes nothing.
 *
 * The two reads use the tools that already fit: `git` for the newest `v*` tag
 * (the workflow checks the repository out with full history and tags) and `gh`
 * for the merged pull requests. Everything else is pure and testable.
 *
 * A generator that cannot read its input must not pretend the changelog is up
 * to date: every read failure throws, the workflow fails, and the next run
 * retries. A quiet day (nothing new merged) is not an error.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The heading that separates generated sections from the human-written header.
// It is written once when the file is created and must never move, so a run can
// always find where to prepend.
export const MARKER = "<!-- changelog:entries -->";

// Conventional-commit types, grouped the way a reader scans a release note.
// The order here is the order of the groups in a section.
export const GROUPS = [
  { title: "Fitur", types: ["feat", "feature"] },
  { title: "Perbaikan", types: ["fix", "bugfix", "hotfix", "perf"] },
  { title: "Dokumentasi", types: ["docs", "doc"] },
  { title: "Pemeliharaan", types: ["chore", "refactor", "test", "tests", "ci", "build", "style", "revert"] },
];

const UNGROUPED = "Lainnya";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// `type(scope)!: subject` / `type: subject` / `type!: subject`. A title with no
// recognised prefix keeps its whole text as the subject and lands in `Lainnya`.
export function classify(title) {
  const text = (title || "").trim();
  const m = text.match(/^([A-Za-z]+)(?:\([^)]*\))?(!)?:\s*(.+)$/);
  if (!m) return { type: "other", subject: text };
  const type = m[1].toLowerCase();
  const subject = m[3].trim();
  return { type, subject: subject || text };
}

export function groupFor(type) {
  const g = GROUPS.find((group) => group.types.includes(type));
  return g ? g.title : UNGROUPED;
}

// One `- <subject> (#<number>)` line per PR, so the number is always present
// and dedup can match on it.
export function entryLine(pr) {
  const { subject } = classify(pr.title);
  return `- ${subject} (#${pr.number})`;
}

// The PR numbers already mentioned anywhere in the file. Matching on the number
// (not the title) means a re-run after an edit still adds only what is new.
export function listedPrNumbers(text) {
  const found = new Set();
  for (const [, n] of text.matchAll(/\(#(\d+)\)/g)) found.add(Number(n));
  return found;
}

// PRs not yet in the file, oldest first, so a section reads in merge order.
// `mergedAt` is the real order; the PR number is the fallback for a fixture or
// a response that carries no timestamp.
export function newPrs(prs, text) {
  const listed = listedPrNumbers(text);
  const order = (pr) => pr.mergedAt || String(pr.number).padStart(12, "0");
  return prs
    .filter((pr) => pr && Number.isInteger(pr.number) && !listed.has(pr.number))
    .sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
}

export function formatSection(date, prs) {
  if (prs.length === 0) return "";
  const byGroup = new Map(GROUPS.map((g) => [g.title, []]));
  byGroup.set(UNGROUPED, []);
  for (const pr of prs) {
    const { type } = classify(pr.title);
    byGroup.get(groupFor(type)).push(entryLine(pr));
  }
  const lines = [`## ${date}`, ""];
  for (const [title, entries] of byGroup) {
    if (entries.length === 0) continue;
    lines.push(`### ${title}`, "");
    lines.push(...entries, "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

// Insert the new section directly below the marker, above every earlier one.
// Nothing is removed: the generated body is the record of what was generated.
export function prependSection(text, section) {
  if (!section) return text;
  const at = text.indexOf(MARKER);
  if (at === -1) return `${text.trimEnd()}\n\n${section}`;
  const afterMarker = at + MARKER.length;
  const head = text.slice(0, afterMarker);
  const tail = text.slice(afterMarker).replace(/^\s*\n/, "");
  return `${head}\n\n${section}${tail ? "\n" + tail : ""}`;
}

// ---------------------------------------------------------------------------
// GitHub reads (the only part that touches the network).

function run(bin, args, opts = {}) {
  return execFileSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

function gh(args) {
  return JSON.parse(run("gh", args));
}

// The newest `v*` tag, or null when none exists. `git tag --sort=-creatordate`
// needs the tags fetched, which the workflow's checkout does.
export function latestTag() {
  const tags = run("git", ["tag", "--list", "v*", "--sort=-creatordate"])
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags[0] || null;
}

// The tag's commit date, so the PR search window starts there. An annotated tag
// points at a tag object; `rev-list -1` peels it to the commit either way.
export function tagDate(tag) {
  return run("git", ["log", "-1", "--format=%cI", tag]).trim();
}

export function mergedPrsSince(repo, sinceIso) {
  const search = sinceIso ? `merged:>=${sinceIso}` : "merged:>=1970-01-01";
  const prs = gh([
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "merged",
    "--base",
    "main",
    "--limit",
    "500",
    "--json",
    "number,title,mergedAt",
    "--search",
    search,
  ]);
  return prs;
}

// ---------------------------------------------------------------------------

const SELF_TEST_FIXTURES = [
  { number: 101, title: "feat(web): add the santri attendance page" },
  { number: 102, title: "fix(api): stop the SPP job double-charging" },
  { number: 103, title: "docs: explain the deploy gate" },
  { number: 104, title: "chore(deps): bump next to 16.2.11" },
  { number: 105, title: "Release 2.0" },
  { number: 106, title: "feat: export rapor to PDF" },
];

function selfTest() {
  const checks = [];
  const check = (name, cond) => checks.push({ name, ok: !!cond });

  check("classify reads type and subject", (() => {
    const c = classify("feat(web): add a page");
    return c.type === "feat" && c.subject === "add a page";
  })());
  check("classify keeps a bare title as the subject", (() => {
    const c = classify("Release 2.0");
    return c.type === "other" && c.subject === "Release 2.0";
  })());
  check("groupFor maps feat to Fitur", groupFor("feat") === "Fitur");
  check("groupFor maps fix to Perbaikan", groupFor("fix") === "Perbaikan");
  check("groupFor maps an unknown type to Lainnya", groupFor("other") === "Lainnya");

  const section = formatSection("2026-10-08", SELF_TEST_FIXTURES);
  check("section has the date heading", section.startsWith("## 2026-10-08"));
  check("section groups a feat under Fitur", /### Fitur\n\n- add the santri attendance page \(#101\)/.test(section));
  check("section groups a fix under Perbaikan", /### Perbaikan\n\n- stop the SPP job double-charging \(#102\)/.test(section));
  check("section keeps an unlabelled PR in Lainnya", /### Lainnya\n\n- Release 2\.0 \(#105\)/.test(section));
  check("every PR appears exactly once", (section.match(/\(#\d+\)/g) || []).length === SELF_TEST_FIXTURES.length);

  const existing = `# Changelog\n\n${MARKER}\n\n## 2026-10-01\n\n### Fitur\n\n- earlier work (#100)\n`;
  const added = newPrs(SELF_TEST_FIXTURES, existing);
  check("newPrs drops what is already listed", added.length === SELF_TEST_FIXTURES.length);
  check("newPrs keeps merge order", added.every((p, i) => i === 0 || added[i - 1].number < p.number));
  check("newPrs ignores a PR already in the file", newPrs([{ number: 100, title: "feat: earlier" }], existing).length === 0);

  const merged = prependSection(existing, formatSection("2026-10-08", added));
  check("prepend keeps the marker", merged.includes(MARKER));
  check("prepend puts the new section under the marker", merged.indexOf("## 2026-10-08") > merged.indexOf(MARKER));
  check("prepend keeps the older section below", merged.indexOf("## 2026-10-01") > merged.indexOf("## 2026-10-08"));
  check("prepend keeps the header", merged.startsWith("# Changelog"));
  check("a second run adds nothing", newPrs(SELF_TEST_FIXTURES, merged).length === 0);

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}`);
  if (failed.length) {
    console.error(`${failed.length} self-test(s) failed`);
    process.exit(1);
  }
  console.log(`${checks.length} self-tests passed`);
}

function parseArgs(argv) {
  const args = { selfTest: false, dryRun: false, repo: null, out: "CHANGELOG.md", today: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--self-test") args.selfTest = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--repo") args.repo = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--today") args.today = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest();
  if (!args.repo) throw new Error("--repo <owner/name> is required (or use --self-test)");

  const today = args.today || new Date().toISOString().slice(0, 10);
  const tag = latestTag();
  const since = tag ? tagDate(tag) : null;
  const prs = mergedPrsSince(args.repo, since);

  const path = resolve(args.out);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    text = `# Changelog\n\nCatatan perubahan Cipansor, dibuat dari pull request yang digabung ke \`main\`.\n\n${MARKER}\n`;
  }

  const fresh = newPrs(prs, text);
  if (fresh.length === 0) {
    console.log(`changelog: nothing new since ${tag || "the repository root"} — nothing to do`);
    return;
  }
  const section = formatSection(today, fresh);
  if (args.dryRun) {
    process.stdout.write(section);
    return;
  }
  writeFileSync(path, prependSection(text, section), "utf8");
  console.log(`changelog: added ${fresh.length} entr${fresh.length === 1 ? "y" : "ies"} to ${args.out}`);
}

// Run only when invoked directly; importing this file (a test, the self-test)
// must not touch the network.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`changelog: ${err.message}`);
    process.exit(1);
  }
}
