import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * The PR lifecycle guard (`.github/scripts/pr-lifecycle.sh`, run by
 * `.github/workflows/pr-lifecycle.yml`) reacts to a finished CI/E2E run or a
 * review: it leaves a red PR open and dispatches the `SDLC 22` review gate once
 * every check is green. It must never approve or merge.
 *
 * An earlier revision called `gh pr review --approve` once every check was
 * green, its labels matched the linked issue, and `reviewDecision` was not
 * `CHANGES_REQUESTED`. A green PR can still carry unresolved review threads,
 * so that approved a diff nobody had read — the defect SDLC 22's review gate
 * exists to prevent. Approval is the review gate's job; a guard test keeps the
 * lifecycle script from quietly growing an approval back.
 *
 * A later revision also reverted a ready PR to draft on red CI or a
 * changes-requested review. That only hid work in progress; the failing checks
 * are already on the PR, and a human decides when to draft. A guard test keeps
 * the revert from coming back too.
 */

const REPO = resolve(__dirname, '..', '..', '..', '..');
const SCRIPT = '.github/scripts/pr-lifecycle.sh';
const WORKFLOW = '.github/workflows/pr-lifecycle.yml';

const lines = (p: string) =>
  readFileSync(join(REPO, p), 'utf8')
    .split('\n')
    .map((line, i) => ({ text: line, n: i + 1 }));

// A `gh pr review`/`gh pr merge` call that acts, not a comment mentioning one.
const acts = (line: string) =>
  /(^|\s)(gh\s+)?pr\s+(review|merge)\b/.test(line) &&
  !/^\s*#/.test(line) &&
  !/^\s*echo\b/.test(line);

describe('PR lifecycle guard never approves or merges', () => {
  it.each([SCRIPT, WORKFLOW])('%s has no approving call', (file) => {
    const offenders = lines(file)
      .filter(({ text }) => /\bapprove\b/.test(text) && acts(text))
      .map(({ text, n }) => `${file}:${n}: ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  it.each([SCRIPT, WORKFLOW])('%s has no merging call', (file) => {
    const offenders = lines(file)
      .filter(({ text }) => acts(text) || /mergePullRequest|merge-async|--auto\b/.test(text))
      .map(({ text, n }) => `${file}:${n}: ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  it('the script does not convert a red or changes-requested PR to draft', () => {
    const source = readFileSync(join(REPO, SCRIPT), 'utf8');
    // A draft revert was the old behaviour; the guard keeps it from returning.
    expect(source).not.toContain('gh pr ready');
    expect(source).not.toContain('--undo');
  });

  it('the workflow runs when a ready docs PR turns ready', () => {
    const wf = readFileSync(join(REPO, WORKFLOW), 'utf8');
    // A docs-only PR's scope job skips Lint/Build/Tests/E2E, so CI finishes
    // while the PR is still a draft; the ready transition is then the only
    // event left to start the lifecycle. A `workflow_run`-only trigger never
    // sees it, so the PR is never reviewed — the ready trigger is what closes
    // that gap, and the job `if` must admit the pull_request event too.
    expect(wf).toMatch(/pull_request:\s*\n\s*types:\s*\[ready_for_review\]/);
    expect(wf).toContain(
      "github.event_name == 'pull_request' && github.event.pull_request.number != null"
    );
  });

  it('LABELS.md names the review gate as the approver', () => {
    const doc = readFileSync(join(REPO, 'docs/LABELS.md'), 'utf8');
    expect(doc).toMatch(/review gate/i);
  });
});
