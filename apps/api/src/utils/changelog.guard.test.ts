import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

/**
 * `scripts/changelog.mjs` is the deterministic core of the "SDLC 14b ·
 * Changelog generator" automation (issue #692, section 4). Only its `apply`
 * command touches git, `gh` and the filesystem; the pure commands are tested
 * here against fixture JSON, so the grouping, ordering and de-duplication are
 * pinned without a network or repository state.
 *
 * The guard matters because the generator writes to a tracked document: a
 * silent mis-grouping or a re-listed PR would land in a pull request a human
 * is meant to trust.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'changelog.mjs');

function run(mode: string, input: unknown, ...args: string[]): string {
  return execFileSync('node', [SCRIPT, mode, ...args], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
}

describe('scripts/changelog.mjs', () => {
  it('exists where the automation looks for it', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('groups merged PRs by conventional-commit type, ascending by number', () => {
    const section = run(
      'render',
      [
        { number: 10, title: 'chore: tidy' },
        { number: 2, title: 'feat(api): add thing' },
        { number: 5, title: 'fix: crash' },
        { number: 7, title: 'docs: note' },
        { number: 3, title: 'No type here' },
      ],
      '--date',
      '2026-10-08'
    );
    expect(section).toBe(
      [
        '## 2026-10-08',
        '',
        '### Features',
        '',
        '- api: add thing (#2)',
        '',
        '### Fixes',
        '',
        '- crash (#5)',
        '',
        '### Maintenance',
        '',
        '- No type here (#3)',
        '- note (#7)',
        '- tidy (#10)',
        '',
      ].join('\n')
    );
  });

  it('keeps a revert with the fixes and never drops an unknown title', () => {
    const section = run(
      'render',
      [
        { number: 4, title: 'revert: undo the thing' },
        { number: 6, title: 'plain title' },
      ],
      '--date',
      '2026-10-08'
    );
    expect(section).toContain('### Fixes');
    expect(section).toContain('- undo the thing (#4)');
    expect(section).toContain('- plain title (#6)');
  });

  it('renders nothing when there is nothing new to list', () => {
    expect(run('render', [], '--date', '2026-10-08')).toBe('');
  });

  it('drops a PR already present in the changelog', () => {
    const fresh = JSON.parse(
      run('filter', {
        existing: '## 2026-01-01\n\n- old (#2)\n',
        prs: [
          { number: 2, title: 'feat: x' },
          { number: 9, title: 'fix: y' },
        ],
      })
    );
    expect(fresh).toEqual([{ number: 9, title: 'fix: y' }]);
  });

  it('prepends the new section above the newest existing one', () => {
    const merged = run('merge', {
      existing: '# Changelog\n\n## 2026-09-01\n\n- old (#1)\n',
      section: '## 2026-10-08\n\n### Features\n\n- new (#9)',
    });
    const newest = merged.indexOf('## 2026-10-08');
    const older = merged.indexOf('## 2026-09-01');
    expect(newest).toBeGreaterThan(-1);
    expect(older).toBeGreaterThan(newest);
    expect(merged).toContain('- new (#9)');
    expect(merged).toContain('- old (#1)');
  });
});
