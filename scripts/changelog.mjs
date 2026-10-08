#!/usr/bin/env node
/**
 * Changelog generator — the deterministic core of the "SDLC 14b · Changelog
 * generator" automation (see issue #692, section 4).
 *
 * The old release-note automation fires on `release.published`, and this
 * repository has never published a GitHub Release, so it never runs. This
 * script does the part that does not need a Release: read the PRs merged to
 * `main` since the last `v*` tag and keep CHANGELOG.md current.
 *
 * Only `apply` touches git, `gh` and the filesystem. The three pure
 * subcommands — `filter`, `render`, `merge` — take JSON on stdin and write
 * their result to stdout, so the grouping, ordering and de-duplication are
 * covered by a unit test with no network and no repository state.
 *
 *   changelog.mjs filter   stdin {existing, prs[]}   -> stdout prs[] not yet listed
 *   changelog.mjs render   stdin prs[]  [--date YYYY-MM-DD] -> stdout section
 *   changelog.mjs merge    stdin {existing, section} -> stdout merged document
 *   changelog.mjs apply    [--date YYYY-MM-DD] [--dry-run]
 *
 * Conventional-commit titles decide the group: `feat` -> Features,
 * `fix`/`revert` -> Fixes, everything else -> Maintenance. A title without a
 * known type is kept verbatim under Maintenance, never dropped.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG = join(ROOT, "CHANGELOG.md");

const GROUPS = [
  { key: "features", heading: "Features" },
  { key: "fixes", heading: "Fixes" },
  { key: "maintenance", heading: "Maintenance" },
];

const TYPE_TO_GROUP = {
  feat: "features",
  fix: "fixes",
  revert: "fixes",
};

const CONVENTIONAL = /^([a-z]+)(?:\(([^)]*)\))?!?:\s*(.+)$/i;

/** Split a PR title into its group and the text a reader sees. */
function classify(title) {
  const raw = String(title ?? "").trim();
  const match = raw.match(CONVENTIONAL);
  if (!match) return { group: "maintenance", text: raw };
  const [, type, scope, subject] = match;
  const group = TYPE_TO_GROUP[type.toLowerCase()] ?? "maintenance";
  const text = scope ? `${scope}: ${subject}` : subject;
  return { group, text };
}

/** Group, sort within a group and render one dated section. */
export function renderSection(prs, date) {
  const grouped = { features: [], fixes: [], maintenance: [] };
  for (const pr of prs) {
    const { group, text } = classify(pr.title);
    grouped[group].push({ number: Number(pr.number), text });
  }

  const parts = [];
  for (const { key, heading } of GROUPS) {
    const entries = grouped[key]
      .filter((e) => Number.isFinite(e.number))
      .sort((a, b) => a.number - b.number);
    if (entries.length === 0) continue;
    const lines = entries.map((e) => `- ${e.text} (#${e.number})`);
    parts.push(`### ${heading}\n\n${lines.join("\n")}`);
  }

  if (parts.length === 0) return "";
  return `## ${date}\n\n${parts.join("\n\n")}\n`;
}

/** Drop PRs whose `(#number)` already appears in the changelog text. */
export function filterNew(existing, prs) {
  const text = String(existing ?? "");
  return (Array.isArray(prs) ? prs : []).filter(
    (pr) => !text.includes(`(#${Number(pr.number)})`),
  );
}

/** Insert a new section above the newest existing one. */
export function prependSection(existing, section) {
  const trimmed = String(section ?? "").replace(/\s+$/, "");
  if (!trimmed) return String(existing ?? "");
  const base = String(existing ?? "");
  const idx = base.search(/^## /m);
  if (idx === -1) {
    return `${base.replace(/\s+$/, "")}\n\n${trimmed}\n`;
  }
  const head = base.slice(0, idx).replace(/\s+$/, "");
  const tail = base.slice(idx).replace(/\s+$/, "");
  return `${head}\n\n${trimmed}\n\n${tail}\n`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", cwd: ROOT });
}

function repoSlug() {
  return gh([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]).trim();
}

/** The newest `v*` tag, or the root commit as a fallback baseline. */
function baseline() {
  const tag = execFileSync(
    "git",
    ["tag", "--sort=-creatordate", "--list", "v*"],
    {
      encoding: "utf8",
      cwd: ROOT,
    },
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (tag) {
    const date = execFileSync("git", ["log", "-1", "--format=%cs", tag], {
      encoding: "utf8",
      cwd: ROOT,
    }).trim();
    return { ref: tag, date };
  }
  const date = execFileSync("git", ["log", "--reverse", "--format=%cs"], {
    encoding: "utf8",
    cwd: ROOT,
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return { ref: "the root commit", date };
}

function mergedPrsSince(slug, date) {
  const out = gh([
    "pr",
    "list",
    "--repo",
    slug,
    "--state",
    "merged",
    "--base",
    "main",
    "--limit",
    "300",
    "--search",
    `merged:>=${date}`,
    "--json",
    "number,title,mergedAt",
  ]);
  return JSON.parse(out);
}

function parseArgs(argv) {
  const opts = { date: today(), dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--date") opts.date = argv[++i];
    else if (argv[i] === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

function cmdApply(opts) {
  const base = baseline();
  const slug = repoSlug();
  const prs = mergedPrsSince(slug, base.date);
  let existing = "";
  try {
    existing = readFileSync(CHANGELOG, "utf8");
  } catch {
    existing = "# Changelog\n";
  }
  const fresh = filterNew(existing, prs);
  const section = renderSection(fresh, opts.date);
  if (!section) {
    process.stdout.write(
      `no new merged PRs since ${base.ref}; nothing to do\n`,
    );
    return;
  }
  const merged = prependSection(existing, section);
  if (opts.dryRun) {
    process.stdout.write(section);
    return;
  }
  writeFileSync(CHANGELOG, merged);
  process.stdout.write(section);
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const opts = parseArgs(rest);
  switch (mode) {
    case "filter": {
      const { existing, prs } = JSON.parse(readStdin() || "{}");
      process.stdout.write(
        JSON.stringify(filterNew(existing, prs), null, 2) + "\n",
      );
      break;
    }
    case "render": {
      const prs = JSON.parse(readStdin() || "[]");
      process.stdout.write(renderSection(prs, opts.date));
      break;
    }
    case "merge": {
      const { existing, section } = JSON.parse(readStdin() || "{}");
      process.stdout.write(prependSection(existing, section));
      break;
    }
    case "apply":
      cmdApply(opts);
      break;
    default:
      process.stderr.write(
        "usage: changelog.mjs filter|render|merge|apply [--date YYYY-MM-DD] [--dry-run]\n",
      );
      process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
