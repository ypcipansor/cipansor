import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * `.github/workflows/main-failure-bridge.yml` is the deterministic half of the
 * deployment monitor: GitHub Actions sees the finished result of every workflow
 * on `main` and dispatches the `Pemantau deployment` automation, which the
 * OpenHands GitHub webhook cannot do (its documented events are `pull_request`,
 * `issues`, `issue_comment`, `push`, `release`, `pull_request_review` — not
 * `workflow_run`). The automation's own `workflow_run` event is best-effort, so
 * this bridge is the reliable path and its shape is a contract:
 *
 *  - it fires only on a finished, FAILED run of a workflow that actually runs
 *    on `main`, never on a failure mid-PR;
 *  - it skips while `main` is still red, so one ongoing breakage does not file
 *    a second issue;
 *  - it dispatches by id and stays harmless when `OPENHANDS_API_KEY` is unset.
 */

const REPO = resolve(__dirname, '..', '..', '..', '..');
const BRIDGE = readFileSync(
  resolve(REPO, '.github', 'workflows', 'main-failure-bridge.yml'),
  'utf8'
);

describe('main-failure-bridge.yml', () => {
  it('triggers on a finished workflow_run only', () => {
    expect(BRIDGE).toMatch(/workflow_run:/);
    expect(BRIDGE).toMatch(/types:\s*\[completed\]/);
    expect(BRIDGE).not.toMatch(/^\s*push:/m);
    expect(BRIDGE).not.toMatch(/^\s*pull_request:/m);
  });

  it('watches only workflows that run on main', () => {
    // Read the `workflows:` list itself, not the whole file: the comments name
    // the excluded workflows, so a whole-file check would be self-defeating.
    const list = BRIDGE.match(/workflows:\s*(\[[^\]]*\])/)?.[1] ?? '';
    expect(list).toContain('CI');
    expect(list).toContain('E2E Tests');
    expect(list).toContain('Deploy staging');
    // A manual workflow never produces a `workflow_run` on main.
    expect(list).not.toContain('Deploy production');
  });

  it('acts only on a failure on main', () => {
    expect(BRIDGE).toMatch(/conclusion == 'failure'/);
    expect(BRIDGE).toMatch(/head_branch == 'main'/);
  });

  it('skips while main is still red, so it files one issue per breakage', () => {
    expect(BRIDGE).toMatch(/commits\/main\/status/);
    expect(BRIDGE).toMatch(/STATE" = "failure"/);
    expect(BRIDGE).toMatch(/skip=1/);
  });

  it('dispatches the monitor by id and needs no key to stay harmless', () => {
    expect(BRIDGE).toMatch(/\/api\/automation\/v1\/\$MONITOR_ID\/dispatch/);
    expect(BRIDGE).toMatch(/secrets\.OPENHANDS_API_KEY/);
    expect(BRIDGE).toMatch(/OPENHANDS_API_KEY is not set/);
  });
});
