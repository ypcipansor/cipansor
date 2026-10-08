import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * The release path is automated everywhere except the changelog (SDLC 14). The
 * generator in `scripts/changelog.mjs` fills that gap from the pull requests
 * that actually merged, and it is the only place the grouping rule lives, so
 * the rule is pinned here rather than left to the scheduled run.
 *
 * The script carries its own `--self-test` over the pure functions (classify,
 * group, format, dedup, prepend). This suite runs it and pins the two things
 * the self-test cannot see: the file the workflow prepends to, and the trigger
 * the workflow runs on — the defect was a `release.published` event that never
 * fired, and a scheduled run cannot be skipped that way.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'changelog.mjs');
const CHANGELOG = join(REPO_ROOT, 'CHANGELOG.md');
const WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'changelog.yml');

describe('changelog generator', () => {
  it('ships the generator the workflow calls', () => {
    expect(existsSync(SCRIPT), `${SCRIPT} is missing`).toBe(true);
  });

  it('passes its own self-test over the grouping rule', () => {
    // A wrong exit code here either hides a broken rule or fails a healthy run.
    const out = execFileSync('node', [SCRIPT, '--self-test'], { encoding: 'utf8' });
    expect(out).toContain('self-tests passed');
  });

  it('rejects an argument it does not understand', () => {
    // A typo'd flag must fail loudly, not read nothing and report success.
    expect(() =>
      execFileSync('node', [SCRIPT, '--not-a-flag'], { encoding: 'utf8', stdio: 'pipe' })
    ).toThrow();
  });

  it('ships a changelog the generator can prepend to', () => {
    const text = readFileSync(CHANGELOG, 'utf8');
    // The marker is the anchor the generator prepends under; without it the
    // first run appends to the end instead of the top.
    expect(text).toContain('<!-- changelog:entries -->');
  });

  it('runs the changelog on a schedule, not on a release that may never come', () => {
    const yaml = readFileSync(WORKFLOW, 'utf8');
    // The regression this pins: the trigger was `release: types: [published]`,
    // which never fired, because a GitHub Release is a human act and none had
    // been published. The check is on the trigger key, not the word "release",
    // so the comment explaining this can name it.
    expect(yaml).not.toMatch(/^\s*release:\s/m);
    // A cron schedule cannot be skipped that way.
    expect(yaml).toMatch(/^\s*schedule:\s/m);
    expect(yaml).toMatch(/cron:\s*'[^']+'/);
  });

  it('asks for only the permissions the pull request needs', () => {
    const yaml = readFileSync(WORKFLOW, 'utf8');
    expect(yaml).toMatch(/pull-requests:\s*write/);
    expect(yaml).toMatch(/contents:\s*write/);
  });
});
