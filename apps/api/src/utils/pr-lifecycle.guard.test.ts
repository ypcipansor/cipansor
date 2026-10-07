import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * Behaviour `pr-lifecycle.sh` hides behind its `gh` calls, driven against a
 * stub `gh` and the real `jq`:
 *
 *  - check runs come paginated from the REST API; a failing check on a second
 *    page must still turn a ready PR back to draft (`jq -s` combines pages);
 *  - an existing lifecycle comment is updated through the REST endpoint's
 *    numeric id — the GraphQL node id is rejected there;
 *  - a green draft PR gets its all-green notice without waiting for Analyze or
 *    CodeQL, which no checked-in workflow publishes.
 *
 * Each check fails against the pre-review script and passes after it.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, '.github', 'scripts', 'pr-lifecycle.sh');
const SHA = 'abc123';

const STUB = `#!/bin/sh
log() { [ -n "\${GH_STUB_LOG:-}" ] && echo "$*" >> "$GH_STUB_LOG"; }
case "$1" in
  pr)
    case "$2" in
      view)
        case "$*" in
          *"--json state"*) printf '%s\\n' "\${GH_STUB_STATE:-OPEN}" ;;
          *"--json isDraft"*) printf '%s\\n' "\${GH_STUB_DRAFT:-false}" ;;
          *"--json reviewDecision"*) printf '%s\\n' "\${GH_STUB_REVIEW:-}" ;;
          *"--json headRefOid"*) printf '%s\\n' "\${GH_STUB_HEAD:-abc123}" ;;
          *"--json potentialMergeCommit"*) printf '%s\\n' "\${GH_STUB_MERGE:-}" ;;
          *"--json comments"*) printf '%s\\n' "\${GH_STUB_PRCOMMENTS:-}" ;;
        esac ;;
      ready) log "READY $*" ;;
      comment) log "COMMENT $*" ;;
      edit) log "EDIT $*" ;;
    esac ;;
  api)
    case "$*" in
      *check-runs*) printf '%s\\n' "\${GH_STUB_CHECKS:-}" ;;
      *"comments?per_page"*)
        printf '%s' "\${GH_STUB_COMMENTS_LIST:-[]}" \
          | jq -r '.[] | select(.body | contains("<!-- pr-lifecycle:")) | .id' ;;
      *"/issues/comments/"*)
        case "$*" in
          *"-X PATCH"*) log "PATCH $*" ;;
          *) printf '%s' "\${GH_STUB_OLD_COMMENT:-}" ;;
        esac ;;
    esac ;;
esac
exit 0
`;

let dir: string;
let log: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'lifecycle-guards-'));
  writeFileSync(join(dir, 'gh'), STUB, { mode: 0o755 });
  log = join(dir, 'calls.log');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(env: Record<string, string>, sha = SHA) {
  writeFileSync(log, '');
  const r = spawnSync('sh', [SCRIPT, '7', sha], {
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

const REQUIRED = [
  'CI scope',
  'Lint',
  'Build',
  'Tests',
  'Security',
  'E2E scope',
  'E2E Tests (Chromium)',
];
const cr = (name: string, conclusion: string, id: number) => ({
  name,
  status: 'completed',
  conclusion,
  started_at: `2024-01-01T00:00:${String(id).padStart(2, '0')}Z`,
  id,
});
const page = (runs: ReturnType<typeof cr>[]) => JSON.stringify({ check_runs: runs });

const allGreen = page(REQUIRED.map((n, i) => cr(n, 'success', i + 1)));
// Two pages: the failing Tests run is only on the second.
const paginatedRed =
  page(REQUIRED.filter((n) => n !== 'Tests').map((n, i) => cr(n, 'success', i + 1))) +
  '\n' +
  page([cr('Tests', 'failure', 999)]);

describe('pr-lifecycle.sh', () => {
  it('sees a failing check on the second page and drafts a ready PR', () => {
    const { calls } = run({
      GH_STUB_STATE: 'OPEN',
      GH_STUB_DRAFT: 'false',
      GH_STUB_HEAD: SHA,
      GH_STUB_CHECKS: paginatedRed,
    });
    expect(calls).toContain('READY');
    expect(calls).toContain('--undo');
  });

  it('updates an existing lifecycle comment through its numeric id', () => {
    const { calls } = run({
      GH_STUB_STATE: 'OPEN',
      GH_STUB_DRAFT: 'true',
      GH_STUB_HEAD: SHA,
      GH_STUB_CHECKS: allGreen,
      GH_STUB_COMMENTS_LIST: '[{"id":4242,"body":"old <!-- pr-lifecycle:green -->"}]',
      GH_STUB_OLD_COMMENT: 'an older lifecycle comment',
    });
    expect(calls).toContain('PATCH');
    expect(calls).toContain('/issues/comments/4242');
  });

  it('posts the all-green notice for a green draft without Analyze/CodeQL', () => {
    const { calls } = run({
      GH_STUB_STATE: 'OPEN',
      GH_STUB_DRAFT: 'true',
      GH_STUB_HEAD: SHA,
      GH_STUB_CHECKS: allGreen,
      GH_STUB_COMMENTS_LIST: '[]',
    });
    expect(calls).toContain('COMMENT');
    expect(calls).toContain('pr-lifecycle:green');
  });

  it('does nothing for a stale run whose sha is not the PR head', () => {
    const { calls } = run({
      GH_STUB_STATE: 'OPEN',
      GH_STUB_DRAFT: 'false',
      GH_STUB_HEAD: 'othersha',
      GH_STUB_CHECKS: paginatedRed,
    });
    expect(calls).not.toContain('READY');
  });
});
