import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * The PR lifecycle guard (`.github/scripts/pr-lifecycle.sh`, run by
 * `.github/workflows/pr-lifecycle.yml`) reacts to a finished CI/E2E run or a
 * review: it converts a ready PR back to draft, and posts an informational
 * comment. It must never approve or merge.
 *
 * An earlier revision called `gh pr review --approve` once every check was
 * green, its labels matched the linked issue, and `reviewDecision` was not
 * `CHANGES_REQUESTED`. A green PR can still carry unresolved review threads,
 * so that approved a diff nobody had read — the defect SDLC 22's review gate
 * exists to prevent. Approval is the review gate's job; a guard test keeps the
 * lifecycle script from quietly growing an approval back.
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

  it('the script still converts a red or changes-requested PR to draft', () => {
    const source = readFileSync(join(REPO, SCRIPT), 'utf8');
    expect(source).toContain('gh pr ready');
    expect(source).toContain('--undo');
  });

  it('LABELS.md names the review gate as the approver', () => {
    const doc = readFileSync(join(REPO, 'docs/LABELS.md'), 'utf8');
    expect(doc).toMatch(/review gate/i);
  });
});
