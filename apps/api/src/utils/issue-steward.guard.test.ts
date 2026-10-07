import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * `.github/scripts/issue-steward.sh` driven against a stub `gh`.
 *
 * The behaviours the shapes hide, each of which fails against a plausible but
 * wrong script:
 *
 *  - the timers are per label: `needs-info` closes after 20 days, `question`
 *    goes `stale` after 8 and closes 7 later, anything else after 90 and 14;
 *  - a maintainer's comment since the timer started exempts the issue, a
 *    reporter's reply keeps it open, and a *bot* comment does neither;
 *  - `pending-maintainer`, `ready`, `blocked`, `in-progress` are untouched, and
 *    `duplicate` is left to the duplicate sweep;
 *  - the pre-close comment is posted exactly once (the marker is the state) and
 *    the close follows on the next run; the comment names the timer and how to
 *    keep the issue open;
 *  - a pull request is never closed — only issues are listed.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, '.github', 'scripts', 'issue-steward.sh');

const AI = 'This comment was created by an AI agent';
const MARK = '<!-- issue-steward:closing -->';
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

// The stub prints what `gh` would print *after* its `--jq` filter, so each
// fixture below is already in the shape the script parses.
const STUB = `#!/bin/sh
log() { [ -n "\${GH_STUB_LOG:-}" ] && echo "$*" >> "$GH_STUB_LOG"; }
body() { prev=""; for a in "$@"; do [ "$prev" = "--body" ] && { echo "$a"; return; }; prev="$a"; done; }
num() { echo "$1" | sed -E 's#.*/issues/([0-9]+)/.*#\\1#'; }
case "$1" in
  api)
    case "$3" in
      *timeline*) n=$(num "$3"); eval "printf '%s\\n' \\"\\\${GH_STUB_TIMELINE_$n:-}\\"" ;;
      *comments*) n=$(num "$3"); eval "printf '%s\\n' \\"\\\${GH_STUB_COMMENTS_$n:-}\\"" ;;
    esac ;;
  issue)
    case "$2" in
      list) printf '%s\\n' "\${GH_STUB_ISSUES:-}" ;;
      view) eval "printf '%s\\n' \\"\\\${GH_STUB_CREATED_$3:-}\\"" ;;
      comment) log "COMMENT $3 BODY $(body "$@" | tr '\\n' ' ')" ;;
      close) log "CLOSE $3" ;;
      edit) log "EDIT $3 $*" ;;
    esac ;;
  pr)
    log "PR $*" ;;
esac
exit 0
`;

let dir: string;
let log: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'issue-steward-'));
  writeFileSync(join(dir, 'gh'), STUB, { mode: 0o755 });
  log = join(dir, 'calls.log');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(env: Record<string, string>) {
  writeFileSync(log, '');
  const r = spawnSync('sh', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      REPO: 'o/r',
      GH_TOKEN: 'x',
      GH_STUB_LOG: log,
      ...env,
    },
  });
  return {
    status: r.status ?? -1,
    out: `${r.stdout}${r.stderr}`,
    calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
  };
}

// One issue, labelled <labels>, with the given timeline and comments. The
// creation date is always present, as it is in the API.
function one(issue: string, labels: string, timeline: string, comments = '', createdDaysAgo = 365) {
  return run({
    GH_STUB_ISSUES: `${issue}\t${labels}`,
    [`GH_STUB_TIMELINE_${issue}`]: timeline,
    [`GH_STUB_COMMENTS_${issue}`]: comments,
    [`GH_STUB_CREATED_${issue}`]: iso(createdDaysAgo),
  });
}

const labeled = (name: string, daysAgo: number) => `${name}\t${iso(daysAgo)}`;
// created_at<TAB>login<TAB>body<TAB>association
const comment = (daysAgo: number, login: string, text: string, assoc = 'NONE') =>
  `${iso(daysAgo)}\t${login}\t${text}\t${assoc}`;

describe('issue-steward.sh — needs-info (20 days, close)', () => {
  it('posts one notice, and does not close yet', () => {
    const { calls } = one('3', 'needs-info', labeled('needs-info', 21));
    expect(calls).toContain('COMMENT 3');
    expect(calls).not.toContain('CLOSE 3');
  });

  it('names the timer and how to keep the issue open', () => {
    const { calls } = one('3', 'needs-info', labeled('needs-info', 21));
    expect(calls).toContain('20 days');
    expect(calls).toContain('needs-info');
    expect(calls).toContain('remove the');
  });

  it('closes on the run after the notice, without posting the notice twice', () => {
    const comments = comment(1, 'github-actions[bot]', `Waiting for info. ${MARK} ${AI}`);
    const { calls } = one('3', 'needs-info', labeled('needs-info', 21), comments);
    expect(calls).toContain('CLOSE 3');
    expect(calls).not.toContain('COMMENT 3');
  });

  it('keeps the issue open when the reporter replies after the label', () => {
    const comments = comment(2, 'reporter', 'Here is the missing detail.');
    const { calls, out } = one('3', 'needs-info', labeled('needs-info', 21), comments);
    expect(calls).not.toContain('CLOSE 3');
    expect(calls).not.toContain('COMMENT 3');
    expect(out).toContain('reply arrived');
  });

  it('exempts an issue a maintainer commented on since the label', () => {
    const comments = comment(2, 'adminypc', 'Looking into this.', 'MEMBER');
    const { calls, out } = one('3', 'needs-info', labeled('needs-info', 21), comments);
    expect(calls).not.toContain('CLOSE 3');
    expect(calls).not.toContain('COMMENT 3');
    expect(out).toContain('exempt');
  });

  it('does not treat its own notice as a maintainer comment (the #680 guard)', () => {
    // The automation token's comment carries a maintainer association and the
    // footer; without the AI exclusion it would exempt the issue it is about to
    // close. It must still be noticed, not left alone.
    const comments = comment(1, 'adminypc', `Waiting. ${MARK} ${AI}`, 'MEMBER');
    const { calls } = one('3', 'needs-info', labeled('needs-info', 21), comments);
    expect(calls).toContain('CLOSE 3');
  });

  it('leaves an issue inside the 20-day window alone', () => {
    const { calls } = one('3', 'needs-info', labeled('needs-info', 5));
    expect(calls).not.toContain('COMMENT 3');
    expect(calls).not.toContain('CLOSE 3');
  });
});

describe('issue-steward.sh — question (stale at 8, close 7 later)', () => {
  it('marks a question stale after 8 days', () => {
    const { calls } = one('4', 'question', labeled('question', 9));
    expect(calls).toContain('EDIT 4');
    expect(calls).toContain('--add-label stale');
    expect(calls).not.toContain('CLOSE 4');
  });

  it('leaves a question inside the 8-day window alone', () => {
    const { calls } = one('4', 'question', labeled('question', 3));
    expect(calls).not.toContain('EDIT 4');
    expect(calls).not.toContain('COMMENT 4');
  });

  it('does not mark stale when the reporter replied', () => {
    const comments = comment(2, 'reporter', 'Any update?');
    const { calls } = one('4', 'question', labeled('question', 9), comments);
    expect(calls).not.toContain('EDIT 4');
  });

  it('posts the notice once the stale label is 7 days old', () => {
    const timeline = `${labeled('question', 20)}\n${labeled('stale', 8)}`;
    const { calls } = one('4', 'question', timeline);
    expect(calls).toContain('COMMENT 4');
    expect(calls).toContain('7 days');
    expect(calls).not.toContain('CLOSE 4');
  });

  it('closes a stale question after the notice', () => {
    const timeline = `${labeled('question', 20)}\n${labeled('stale', 8)}`;
    const comments = comment(1, 'github-actions[bot]', `Stale. ${MARK} ${AI}`);
    const { calls } = one('4', 'question', timeline, comments);
    expect(calls).toContain('CLOSE 4');
    expect(calls).not.toContain('COMMENT 4');
  });

  it('keeps a stale question open when the reporter replies after stale', () => {
    const timeline = `${labeled('question', 20)}\n${labeled('stale', 8)}`;
    const comments = comment(2, 'reporter', 'Still here!');
    const { calls } = one('4', 'question', timeline, comments);
    expect(calls).not.toContain('CLOSE 4');
  });

  it('leaves a question that has been stale less than 7 days alone', () => {
    const timeline = `${labeled('question', 20)}\n${labeled('stale', 3)}`;
    const { calls } = one('4', 'question', timeline);
    expect(calls).not.toContain('COMMENT 4');
    expect(calls).not.toContain('CLOSE 4');
  });
});

describe('issue-steward.sh — anything else (stale at 90, close 14 later)', () => {
  it('marks an idle issue stale after 90 days', () => {
    const { calls } = one('5', 'bug,priority:low', '', comment(100, 'reporter', 'original report'));
    expect(calls).toContain('EDIT 5');
    expect(calls).toContain('--add-label stale');
  });

  it('leaves an issue with recent human activity alone', () => {
    const { calls } = one('5', 'bug', '', comment(10, 'reporter', 'still relevant'));
    expect(calls).not.toContain('EDIT 5');
  });

  it('does not let a bot comment reset the 90-day clock', () => {
    // Only a bot spoke 5 days ago; the issue has been idle for 100. It is stale.
    const comments = comment(5, 'github-actions[bot]', 'Automated nudge.');
    const { calls } = one('5', 'bug', '', comments);
    expect(calls).toContain('EDIT 5');
  });

  it('posts the notice once the stale label is 14 days old', () => {
    const { calls } = one('5', 'bug', labeled('stale', 15));
    expect(calls).toContain('COMMENT 5');
    expect(calls).toContain('14 days');
    expect(calls).not.toContain('CLOSE 5');
  });

  it('closes an idle issue after the notice', () => {
    const comments = comment(1, 'github-actions[bot]', `Stale. ${MARK} ${AI}`);
    const { calls } = one('5', 'bug', labeled('stale', 15), comments);
    expect(calls).toContain('CLOSE 5');
    expect(calls).not.toContain('COMMENT 5');
  });

  it('exempts an issue a maintainer commented on since it went stale', () => {
    const comments = comment(2, 'adminypc', 'We will take this.', 'COLLABORATOR');
    const { calls } = one('5', 'bug', labeled('stale', 15), comments);
    expect(calls).not.toContain('CLOSE 5');
  });
});

describe('issue-steward.sh — exemptions and the duplicate sweep', () => {
  for (const label of ['pending-maintainer', 'ready', 'blocked', 'in-progress']) {
    it(`never touches an issue labelled ${label}`, () => {
      const { calls } = one(
        '6',
        `${label},bug`,
        labeled(label, 200),
        comment(200, 'reporter', 'old')
      );
      expect(calls).not.toContain('COMMENT 6');
      expect(calls).not.toContain('CLOSE 6');
      expect(calls).not.toContain('EDIT 6');
    });
  }

  it('leaves a duplicate to the duplicate sweep', () => {
    const { calls } = one('7', 'duplicate', labeled('duplicate', 200));
    expect(calls).not.toContain('COMMENT 7');
    expect(calls).not.toContain('CLOSE 7');
  });

  it('never closes a pull request', () => {
    const { calls } = one('8', 'question', labeled('question', 30));
    expect(calls).not.toContain('PR ');
  });
});

describe('issue-steward.sh — dry run', () => {
  it('changes nothing and prints what it would do', () => {
    const { calls, out } = run({
      DRY_RUN: '1',
      GH_STUB_ISSUES: '3\tneeds-info',
      GH_STUB_TIMELINE_3: labeled('needs-info', 21),
    });
    expect(calls).not.toContain('COMMENT 3');
    expect(calls).not.toContain('CLOSE 3');
    expect(calls).not.toContain('EDIT 3');
    expect(out).toContain('DRY_RUN');
  });
});
