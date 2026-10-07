import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * The advisory PR-description guards, driven against a stub `gh` and the real
 * `jq`:
 *
 *  - `pr-template-guard.sh` reminds when the body is missing a required part,
 *    and clears the reminder once the body is complete — never failing.
 *  - `visual-evidence.sh` asks for before/after visuals only when `apps/web`
 *    changed and no image or video is present in the body.
 *
 * Both must stay advisory: the assertions below check they post a comment (or
 * remove one) and never emit an error status.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const TEMPLATE = join(REPO_ROOT, '.github', 'scripts', 'pr-template-guard.sh');
const VISUAL = join(REPO_ROOT, '.github', 'scripts', 'visual-evidence.sh');

const STUB = `#!/bin/sh
log() { [ -n "\${GH_STUB_LOG:-}" ] && echo "$*" >> "$GH_STUB_LOG"; }
case "$1" in
  pr)
    case "$*" in
      *"--json files,body"*) printf '%s\\n' "\${GH_STUB_PRJSON-}" ;;
      *"--json body"*) printf '%s\\n' "\${GH_STUB_BODY-}" ;;
      *"comment"*) log "COMMENT $*"; [ "\${GH_STUB_WRITE_FAIL:-}" = "1" ] && exit 1 ;;
    esac ;;
  api)
    case "$*" in
      *"comments?per_page"*)
        # The marker comment is on a later page, so it is only found when the
        # caller paginates.
        case "$*" in *--paginate*) [ -n "\${GH_STUB_CID:-}" ] && printf '%s\\n' "\$GH_STUB_CID" ;; esac ;;
      *"-X PATCH"*) log "PATCH $*"; [ "\${GH_STUB_WRITE_FAIL:-}" = "1" ] && exit 1 ;;
      *"-X DELETE"*) log "DELETE $*"; [ "\${GH_STUB_WRITE_FAIL:-}" = "1" ] && exit 1 ;;
    esac ;;
esac
exit 0
`;

let dir: string;
let log: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pr-desc-guards-'));
  writeFileSync(join(dir, 'gh'), STUB, { mode: 0o755 });
  log = join(dir, 'calls.log');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(script: string, env: Record<string, string>) {
  writeFileSync(log, '');
  const r = spawnSync('sh', [script, '7'], {
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

const COMPLETE = `## HUMAN

I ran the API tests and walked the changed flow.

## AGENT

## Why

The health endpoint lied about the database.

## What changed

- probe the database before answering

## Linked issue

Fixes #12

## Acceptance criteria

- [x] answers 503 when the probe fails

## How to test

pnpm --filter api test
`;

describe('pr-template-guard.sh', () => {
  it('asks for the missing parts of an incomplete description', () => {
    const { status, calls } = run(TEMPLATE, { GH_STUB_BODY: '## Why\n\nSomething broke.' });
    expect(status).toBe(0);
    expect(calls).toContain('COMMENT');
  });

  it('is silent when the description is complete', () => {
    const { status, calls } = run(TEMPLATE, { GH_STUB_BODY: COMPLETE });
    expect(status).toBe(0);
    expect(calls).not.toContain('COMMENT');
    expect(calls).not.toContain('PATCH');
  });

  it('treats an untouched template placeholder as missing content', () => {
    const placeholder = `## HUMAN

<!-- Human author: replace this comment with a short note. -->

## Why

<!-- The problem and its motivation. -->
`;
    const { calls } = run(TEMPLATE, { GH_STUB_BODY: placeholder });
    expect(calls).toContain('COMMENT');
  });

  it('treats a lone list marker as a missing change summary', () => {
    // The template's `## What changed` ships a bare "-"; leaving it there is not
    // a change summary, so the reminder must still list it.
    const bareDash = COMPLETE.replace('- probe the database before answering', '-');
    const { calls } = run(TEMPLATE, { GH_STUB_BODY: bareDash });
    expect(calls).toContain('COMMENT');
  });

  it('removes an earlier reminder once the description is complete', () => {
    // GH_STUB_CID is only returned when the lookup paginates, so this also
    // proves the marker is found past the first page of comments.
    const { calls } = run(TEMPLATE, { GH_STUB_BODY: COMPLETE, GH_STUB_CID: '555' });
    expect(calls).toContain('DELETE');
    expect(calls).not.toContain('COMMENT');
  });

  it('accepts a body that says there is no linked issue', () => {
    const none = COMPLETE.replace('Fixes #12', 'No linked issue — a chore.');
    const { calls } = run(TEMPLATE, { GH_STUB_BODY: none });
    expect(calls).not.toContain('COMMENT');
  });

  it('stays advisory when the reminder cannot be posted', () => {
    const { status, out } = run(TEMPLATE, {
      GH_STUB_BODY: '## Why\n\nSomething broke.',
      GH_STUB_WRITE_FAIL: '1',
    });
    expect(status).toBe(0);
    expect(out).toContain('could not post');
  });
});

describe('visual-evidence.sh', () => {
  const pr = (files: string[], body: string) =>
    JSON.stringify({ files: files.map((p) => ({ path: p })), body });

  it('asks for before/after visuals when apps/web changed and none are present', () => {
    const { status, calls } = run(VISUAL, {
      GH_STUB_PRJSON: pr(['apps/web/src/app/page.tsx'], 'Fixes #1'),
    });
    expect(status).toBe(0);
    expect(calls).toContain('COMMENT');
  });

  it('is silent when the body has both a before and an after image', () => {
    const body =
      'Before: ![old](https://user-images.githubusercontent.com/1/1.png)\n' +
      'After: ![new](https://user-images.githubusercontent.com/1/2.png)';
    const { calls } = run(VISUAL, {
      GH_STUB_PRJSON: pr(['apps/web/src/app/page.tsx'], body),
    });
    expect(calls).not.toContain('COMMENT');
  });

  it('is silent when both visuals use GitHub attachment links', () => {
    const body =
      'Before: ![old](https://github.com/user-attachments/assets/11111111-1111-1111-1111-111111111111)\n' +
      'After: ![new](https://github.com/user-attachments/assets/22222222-2222-2222-2222-222222222222)';
    const { calls } = run(VISUAL, {
      GH_STUB_PRJSON: pr(['apps/web/src/app/page.tsx'], body),
    });
    expect(calls).not.toContain('COMMENT');
  });

  it('still asks when only an after image is present', () => {
    const body = 'After: ![shot](https://user-images.githubusercontent.com/1/2.png)';
    const { status, calls } = run(VISUAL, {
      GH_STUB_PRJSON: pr(['apps/web/src/app/page.tsx'], body),
    });
    expect(status).toBe(0);
    expect(calls).toContain('COMMENT');
  });

  it('removes the reminder once both visuals are added', () => {
    const body =
      'Before: ![old](https://user-images.githubusercontent.com/1/1.png)\n' +
      'After: ![new](https://user-images.githubusercontent.com/1/2.png)';
    const { calls } = run(VISUAL, {
      GH_STUB_PRJSON: pr(['apps/web/src/app/page.tsx'], body),
      GH_STUB_CID: '42',
    });
    expect(calls).toContain('DELETE');
  });

  it('never asks when no apps/web file changed', () => {
    const { calls } = run(VISUAL, {
      GH_STUB_PRJSON: pr(['apps/api/src/app.ts'], 'Fixes #1'),
    });
    expect(calls).not.toContain('COMMENT');
  });

  it('stays advisory when the reminder cannot be posted', () => {
    const { status, out } = run(VISUAL, {
      GH_STUB_PRJSON: pr(['apps/web/src/app/page.tsx'], 'Fixes #1'),
      GH_STUB_WRITE_FAIL: '1',
    });
    expect(status).toBe(0);
    expect(out).toContain('could not post');
  });
});
