# Automation ideas and their guardrails

The automations that are not part of the fixed 18-item framework. Each is a
proposal, approved and deployed, with the limits it must keep. They live outside
this repository (deployed through the OpenHands automations API); the guardrail
each must keep is written into its prompt, and `docs/SDLC-FLOW.md` records the
shape of the fleet.

## 1. Bug hunter (SDLC 23)

Proactively finds a real, reproducible bug on `main`, proves it with a failing
test, and opens one evidenced issue plus a draft PR with the test. A speculative
issue is worse than none, so it opens nothing it cannot reproduce, and it
searches for duplicates first.

## 2. Standard scout (SDLC 24)

Reads the current official standards for this stack and the data-protection
regulation that applies to a school-management system, and opens a
`pending-maintainer` issue with a citation for each concrete divergence. A
maintainer adds `ready` to start implementation.

## 3. Issue steward (SDLC 25)

Ages out issues that are stalled. Timers, from what comparable projects use:

| Label | Warn after | Close after | Precedent |
|---|---|---|---|
| `needs-info` | — | 20 days | Kubernetes triage guide |
| `question` | 8 days (`stale`) | 7 more | Traefik contributors guide |
| anything else | 90 days (`stale`) | 14 more | `actions/stale` default |

Exempt: `pending-maintainer`, `ready`, `blocked`, `in-progress`, and anything a
maintainer commented on. `duplicate` is owned by the sweep workflow.

## 4. Discussion (SDLC 26)

Answers a maintainer on a `pending-maintainer` or `needs-info` issue. Supplying
the missing detail or a go-ahead applies `ready`, which hands off to SDLC 07; a
rejection applies `wontfix` and closes. It never acts on its own comment.

## 5. Fleet watchdog (SDLC 27 + 28)

Watches every automation and reports to the maintainer.

- **May fix, by PR labelled `watchdog-repair` (never by editing `main`):** a
  missing self-comment guard, a disabled automation that should be enabled, two
  automations on one cron slot, an expired pin the `Security` check reports.
- **Must report, as one issue labelled `automation-health` per cause, at most
  one per cause per week:** everything else.
- **Must not touch:** the loop guard or its test, any secret, login or
  credential, a run outcome, or the Issue steward's timers.
- **Conflicts:** a content disagreement between two automations is the
  watchdog's to resolve, with evidence; if it cannot tell, it tags a human.
- **Auto-repair is separate** (SDLC 28) so a broken watchdog cannot approve its
  own change; a human merges.
- **Honest when blind:** if the automation API is unreachable it says so and
  falls back to repository and GitHub Actions evidence.

## 6. Issue and PR templates (developed)

The repo had **no templates at all**. Added issue forms and a PR template that
are tied to the label system, not free prose:

- `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.yml` — issue forms,
  mandatory reproduction + acceptance criteria, auto-apply the `bug`/`enhancement`
  type label; `config.yml` sends the reader to `docs/LABELS.md` and this file.
- `.github/pull_request_template.md` — a `HUMAN`/`AGENT` split, a required
  `Fixes #<n>` to a `ready` issue, and the acceptance criteria copied as
  checkboxes.

The link that keeps them honest: OpenHands itself gates its PRs on a
`ready-for-dev` label that a workflow manages, so **an issue only gets `ready`
when its acceptance criteria are real**, and a PR must point at one. Our
`SDLC 19` is that gate.

**Not yet built (needs a decision):** the templates are a nudge, not a rule — a
human can leave a field blank or a PR can name no `ready` issue. The enforcement
that matches OpenHands is a GitHub Actions workflow that (a) fails a PR whose
body names no `Fixes #<n>` to a `ready` issue, and (b) removes `ready` when the
acceptance-criteria field of an issue is emptied — the same actor-policy check
OpenHands runs in `issue-readiness-check.yml`. Say the word and it lands.

### Advisory enforcement (deployed)

Chosen **warning-only**, so nothing is ever blocked:

- `.github/workflows/pr-description-checks.yml` runs on `pull_request_target`
  (a fork PR can still be commented on; it checks out no PR code) and posts at
  most one comment, updated in place, deleted once satisfied:
  - the **template** job lists the parts of the description that are missing;
  - the **visual** job asks for a **before and after** visual when the PR
    changes `apps/web` and its body has no image or video.
- Neither job fails, labels or changes the draft state. The rules are shell in
  `.github/scripts/` and are covered by `apps/api/src/utils/pr-description.guard.test.ts`
  (a stub `gh`, the real `jq`), the same pattern as the other guards.

If the reminders prove ignored, the escalation to a real gate (failing status on
the template job) is a two-line change — but that is a separate decision.

### Bug issues that arrive incomplete (SDLC 06)

A reporter who cannot say *why* something happens has still found a real
failure. SDLC 06 therefore treats a thin bug report as work to do, not a reason
to bounce it:

- It investigates — reads the code and recent history, forms a hypothesis — and
  adds what the reporter could not: the reproduction, the cause.
- On a UI defect it reproduces the failure in the running app and **edits the
  issue body** to attach a screenshot of it, so the issue itself shows the
  problem rather than only a comment thread.
- If nothing is wrong (intended behaviour, a misreading) it says so with the
  evidence and applies `invalid`/`duplicate`/`question`, removing `bug`.
- SDLC 19 no longer sends a thin *defect* to `needs-info` — that path is for a
  vague request, not for a bug whose cause is unknown. `ready` stays a human
  decision: SDLC 06 reports that a reproduction now exists and leaves the gate
  to the maintainer.

The trigger fires on `issues.opened` or on the `bug` label being applied, but
only when the issue *still* carries `bug` and only when that label is the one
that changed — so applying `ready` or `needs-info` in review does not re-arm it.
Verified 2026-10-07 against the deployed automation (`SDLC 06 · Bug reproducer`):
`on = [issues.opened, issues.labeled]`, filter
`(action == 'opened' || label.name == 'bug') && contains(issue.labels[].name, 'bug') && glob(repository.full_name, 'ypcipansor/cipansor')`.
It is cloud configuration, not checked-in code, so re-check it if the automation
is redeployed.

## The rule all of them share

Any automation that comments on an issue must end the comment with the
AI-disclosure footer and guard its `issue_comment.created` trigger with
`!icontains(comment.body, 'This comment was created by an AI agent')`. Without
it the automation re-arms on its own comment — issue #680. See
`docs/LABELS.md`.
