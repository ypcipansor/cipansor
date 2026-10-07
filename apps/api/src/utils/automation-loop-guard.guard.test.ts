import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * The `needs-info` re-check automation (issue #680) fires on every
 * `issue_comment.created` while an issue carries `needs-info`. Its own comment
 * satisfies that condition and it posts under the same account as the
 * reporter, so it re-arms itself: #678 got 11 back-to-back re-checks with no
 * reporter input, each a full LLM conversation.
 *
 * `.github/scripts/automation-loop-guard.py` is the repo-side guard. The
 * automation definition lives outside git, so this test is the only thing that
 * can pin the rule that breaks the cycle. It fails whenever the guard is
 * missing or stops suppressing an automation's own comment — the exact
 * regression that reopened #680.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, '.github', 'scripts', 'automation-loop-guard.py');

/** The marker every automated comment carries (automation-loop-guard.py). */
const AI_FOOTER =
  'This comment was created by an AI agent (OpenHands) on behalf of the repository maintainers.';

interface Comment {
  id: number;
  body: string;
  user: { login: string; type: string };
}

function decide(needsInfo: boolean, comment: Comment): string {
  const payload = JSON.stringify({
    action: 'created',
    issue: { number: 678, labels: needsInfo ? [{ name: 'needs-info' }] : [{ name: 'chore' }] },
    comment,
  });
  return execFileSync('python3', [SCRIPT, 'decide', '-'], {
    input: payload,
    encoding: 'utf8',
  }).trim();
}

function reporterBody(text: string): string {
  return `${text}\n\n---\n*This comment was created by an AI agent (OpenHands) on behalf of the repository maintainers.*`;
}

describe('automation-loop-guard.py', () => {
  it('exists — without it the #680 loop cannot be reproduced or guarded', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('pins the disclosure marker it suppresses on', () => {
    // If this wording changes, the guard stops recognising the automation's
    // own comments and #680's loop returns. Pin it to the script itself.
    expect(readFileSync(SCRIPT, 'utf8')).toContain(AI_FOOTER);
  });

  it('suppresses the automation acting on its own comment', () => {
    // The exact shape of #678: a re-check comment is the trigger for the next.
    const own: Comment = {
      id: 6033790503,
      body: reporterBody('**Needs-info re-check — no reporter reply**'),
      user: { login: 'adminypc', type: 'User' },
    };
    expect(decide(true, own)).toBe('act=no reason=self-trigger');
  });

  it('acts on a genuine reporter reply while needs-info is present', () => {
    const reply: Comment = {
      id: 1,
      body: 'It is a throwaway fixture, please close it.',
      user: { login: 'adminypc', type: 'User' },
    };
    expect(decide(true, reply)).toBe('act=yes reason=reporter-reply');
  });

  it('does not act when the issue no longer carries needs-info', () => {
    const reply: Comment = {
      id: 2,
      body: 'some reply',
      user: { login: 'adminypc', type: 'User' },
    };
    expect(decide(false, reply)).toBe('act=no reason=not-needs-info');
  });

  it('treats an AI comment on an issue without needs-info as not-needed', () => {
    const own: Comment = {
      id: 3,
      body: reporterBody('anything'),
      user: { login: 'adminypc', type: 'User' },
    };
    expect(decide(false, own)).toBe('act=no reason=not-needs-info');
  });

  it('replays the real #678 failure and shows the guard ends the loop', () => {
    // Chronological automated comments on #678: triage/estimate, then eleven
    // "Needs-info re-check" comments up to 2026-10-07T08:15:59Z — no reporter
    // reply anywhere. The plain filter fires on every one of them.
    const rechecks = [
      6033463611, 6033544703, 6033583588, 6033607971, 6033685344, 6033692833, 6033790503,
      6033817542, 6033843173, 6033866832, 6033876454,
    ];
    const stream: Comment[] = [
      ...[6033252519, 6033281602, 6033312399, 6033334719, 6033351869, 6033372979].map((id) => ({
        id,
        body: reporterBody('automated triage / effort estimate'),
        user: { login: 'adminypc', type: 'User' as const },
      })),
      ...rechecks.map((id) => ({
        id,
        body: reporterBody('**Needs-info re-check**'),
        user: { login: 'adminypc', type: 'User' as const },
      })),
    ];
    const out = execFileSync('python3', [SCRIPT, 'replay', '-'], {
      input: JSON.stringify({ needsInfo: true, comments: stream }),
      encoding: 'utf8',
    });
    // The unguarded filter (any comment while needs-info) fires on all 17;
    // the guard fires on none, because every one is the automation's own.
    expect(out).toContain('runs_old=17');
    expect(out).toContain('runs_guarded=0');
  });
});
