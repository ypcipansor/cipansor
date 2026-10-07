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
first step rejects any comment containing the footer. The marker is pinned in
two places, and a change to one without the other is what
`apps/api/src/utils/automation-loop-guard.guard.test.ts` fails on:

1. `AI_FOOTER` in `.github/scripts/automation-loop-guard.py`
2. the same string in the guard test, replayed against the real #678 comment
   stream (17 comments, unguarded `runs_old=17`, guarded `runs_guarded=0`)

If an automation's footer wording changes, change `AI_FOOTER` in the same
commit or the loop returns silently. A new automation that comments on issues
must carry the footer too, or it is invisible to the guard.
