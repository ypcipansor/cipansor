# Automation ideas and their guardrails

The automations that are not part of the fixed 18-item framework. Each is a
proposal, approved and deployed, with the limits it must keep. The
machine-readable definitions live in `deploy-sdlc-agents.py`.

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

## The rule all of them share

Any automation that comments on an issue must end the comment with the
AI-disclosure footer and guard its `issue_comment.created` trigger with
`!icontains(comment.body, 'This comment was created by an AI agent')`. Without
it the automation re-arms on its own comment — issue #680. See
`docs/LABELS.md`.
