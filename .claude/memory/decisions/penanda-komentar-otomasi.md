# Automation comments announce themselves (AI disclosure footer)

Decided 2026-10-07, after #680.

## The rule

**Every comment an automation posts carries the AI-disclosure footer, verbatim:**

```
*This comment was created by an AI agent (OpenHands) on behalf of the repository maintainers.*
```

It is not decoration. Issue #680 showed it is the only marker that can tell an
automation's own comment from a reporter's, because a GitHub automation posts
through the same account as the person who triggered it (`user.type: User`) —
`sender.login` and `user.type` are identical for both.

## Why it matters — the #680 loop

The `needs-info` re-check automation fires on `issue_comment.created` while an
issue carries `needs-info`. Its own comment satisfies that condition, so it
re-armed itself. On the fixture issue #678 it posted up to eleven "Needs-info
re-check" comments in ~27 minutes (07:49Z → 08:16Z) with no reporter input —
and was still going when this was written — each one a full agent conversation:
the trigger filter matched the automation's own output. #678 was later deleted;
the re-verifiable record is the nine comments the automation left on #680
(captured in the guard test's fixture). The automation's own `trigger.filter`
lives in the OpenHands events backend, not in this repository, so nothing
in-repo could catch it.

## The guard

`.github/scripts/automation-loop-guard.py` is the repo-side rule: act only when
the issue carries `needs-info` **and** the comment is not the automation's own.
It rejects a comment whose **trailing footer line** is a disclosure footer. The
marker is pinned in two places, and a change to one without the other is what
`apps/api/src/utils/automation-loop-guard.guard.test.ts` fails on:

1. `AI_FOOTER` in `.github/scripts/automation-loop-guard.py`
2. the same string in the guard test, replayed against the automation's own #680
   comments (`apps/api/src/utils/__fixtures__/needs-info-automation-comments.json`)

The backend filter cannot call the script (see the deployment section below);
it carries the clause the script prints.

## The guard and the deployment

Two pieces, and the second is what actually stops the loop:

1. `.github/scripts/automation-loop-guard.py` — the repo-side **spec**. `decide`
   acts only when the issue carries `needs-info` **and** the comment is not the
   automation's own. It prints the JMESPath clause the backend
   `trigger.filter` must carry (`guard-clause`): `!icontains(comment.body, 'AI
   agent (OpenHands)')`.
2. `.github/scripts/deploy-automation-loop-guard.py` — applies that clause to
   every live label-conditioned `issue_comment.created` automation
   (`DEPLOY=true`, dry run otherwise, idempotent). **A JMESPath filter cannot
   call a Python script**, so the guard is inert until the clause is deployed;
   the deployment is the fix, the script is what makes the rule testable and
   single-sourced. Applied 2026-10-07 to SDLC 20 (Issue clarifier) and SDLC 26
   (Discussion); SDLC 08 (Mention bot) is left alone — its filter keys on
   comment *content* (`@openhands`), so it cannot self-arm, and the marker would
   only suppress a human who quotes an automated comment.

The deploy script's composition is itself pinned, not only the clause string it
writes: `plan -` runs its decision logic offline (no network) and the guard
test feeds it the real automation definitions
(`apps/api/src/utils/__fixtures__/needs-info-automation-definitions.json`,
pre-guard filter + the exact guarded filter the service holds) and asserts the
output equals them, plus idempotency and the content-filter skip. Pinning only
the clause would let the deploy script compose a different filter and still
pass; this catches a silent re-arm. The fixture's `expected` strings are the
live filters re-read from the automation service 2026-10-07.

Verification once deployed: a live self-comment on a `needs-info` issue must
not schedule another run, and a genuine reporter reply must schedule one.

### The footer's wording is not stable

The automation does not reproduce the canonical footer exactly. On #680 it
ended its own comments with **three** wordings:

- `created … on behalf of the repository maintainers.` (canonical)
- `generated … on behalf of the repository maintainers.`
- `created … on behalf of the repository owner.`

A guard that matched only the canonical sentence passed two of the three
through — the loop would have continued. So `has_ai_footer` matches the footer
line against the invariant frame `… by an AI agent (OpenHands) on behalf of …`
with a disclosure verb (`created`/`generated`/…), case-insensitive, allowing the
markdown emphasis around it. `AI_FOOTER` still records the mandated wording, and
the test pins it, but the matching is deliberately broader.

### A quoted or discussed footer is not the comment's own

A reporter answering the request may quote a prior automated comment, footer and
all. The marker is therefore matched only in the comment's **trailing footer
line** — the last non-blank line, with blockquote (`> …`) lines dropped first —
not anywhere in the body. A reply that quotes the footer (blockquote, or pasted
mid-sentence while discussing it) has the frame higher in the body, or with
other words on the line, and is still a reporter reply: the re-check runs.

The deployed clause (`!icontains(comment.body, 'AI agent (OpenHands)')`) is the
whole-body approximation, because JMESPath has no line or regex verb. It is the
cheap robust floor; the position and verb subtleties live in `decide` alone.

## The snapshot cannot see the backend — a live check does

The guard test pins the composition against a checked-in snapshot
(`needs-info-automation-definitions.json`), which no CI test can update when the
backend changes: a live edit that drops the clause re-arms the loop without
failing the suite. Two pieces close that gap:

- `deploy-automation-loop-guard.py verify` reads the live service and exits 1
  when a label-conditioned `issue_comment.created` automation no longer carries
  the clause (`verify -` runs the same report over a piped definitions file, so
  the guard test pins the drift report offline).
- `.github/workflows/automation-loop-guard.yml` runs it weekly. It is inert
  (and green) until `OPENHANDS_API_KEY` is set as a repository secret; once set,
  backend drift turns into a red check. A weekly schedule, not per-PR: the drift
  is in the backend, so it is the same answer for every PR.

## The fixture publishes no incident detail

The guard test's comment fixture keeps each automated comment's **trailing
footer verbatim** (the drift the guard must survive) and condenses the narrative
above it: the incident's timeline, the account, and operational detail (the
automation service host and endpoint, environment-variable names) are not
committed. The repo is public until release (AGENTS.md → "Where things live"),
and incident detail is exactly what it excludes. `check-sensitive.py` scans only
Markdown, so this fixture had to be judged by hand — it is why the bodies were
condensed.

If an automation's footer wording changes, the `AI_FOOTER` constant and this
doc change in the same commit, or the loop returns silently. A new automation
that comments on issues must carry a disclosure footer matching the frame, or
it is invisible to the guard.
