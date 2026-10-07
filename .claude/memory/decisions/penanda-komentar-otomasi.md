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
re-armed itself. On fixture #678 it posted eleven "Needs-info re-check"
comments in ~27 minutes (07:49Z → 08:16Z) with no reporter input — and was
still going when this was written — each one a full agent conversation: the
trigger filter matched the automation's own output. The automation's own
`trigger.filter` lives in the OpenHands events backend, not in this repository,
so nothing in-repo could catch it.

## The guard

`.github/scripts/automation-loop-guard.py` is the repo-side rule: act only when
the issue carries `needs-info` **and** the comment is not the automation's own.
The back-end `trigger.filter` is a thin wrapper around its `decide`, whose
first step rejects any comment carrying a disclosure footer. The marker is
pinned in two places, and a change to one without the other is what
`apps/api/src/utils/automation-loop-guard.guard.test.ts` fails on:

1. `AI_FOOTER` in `.github/scripts/automation-loop-guard.py`
2. the same string in the guard test, replayed against real #680 comment
   bodies (`apps/api/src/utils/__fixtures__/needs-info-automation-comments.json`)

### The guard must still be wired into the back-end filter

Merging this repo change alone does not stop a running loop: nothing in this
repository invokes `automation-loop-guard.py`. The re-check is triggered by the
OpenHands events automation, whose definition lives outside git. Whoever owns
that backend must update its `trigger.filter` to reject a comment carrying a
disclosure footer (minimal form:
`!icontains(comment.body, 'AI agent (OpenHands)')`) and deploy it together
with this guard. Verification: a live self-comment on a `needs-info` issue must
not schedule another run. This is the one step this repository cannot do for
itself.

### The footer's wording is not stable

The automation does not reproduce the canonical footer exactly. On #680 it
ended its own comments with **three** wordings:

- `created … on behalf of the repository maintainers.` (canonical)
- `generated … on behalf of the repository maintainers.`
- `created … on behalf of the repository owner.`

A guard that matched only the canonical sentence passed two of the three
through — the loop would have continued. So `has_ai_footer` matches the
invariant frame instead: `an AI agent (OpenHands) on behalf of` plus a
disclosure verb (`created`/`generated`/…), case-insensitive. `AI_FOOTER` still
records the mandated wording, and the test pins it, but the matching is
deliberately broader.

### A quoted footer is not the comment's own

A reporter answering the request may quote a prior automated comment, footer
and all. `strip_quoted` drops blockquote (`> …`) lines before matching, so a
reply that quotes the footer is still a reporter reply and the re-check runs.

If an automation's footer wording changes, the `AI_FOOTER` constant and this
doc change in the same commit, or the loop returns silently. A new automation
that comments on issues must carry a disclosure footer matching the frame, or
it is invisible to the guard.
