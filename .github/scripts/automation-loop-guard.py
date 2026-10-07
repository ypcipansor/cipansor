#!/usr/bin/env python3
"""Decide whether the `needs-info` re-check automation should act on a comment.

Issue #680: the automation fires on every `issue_comment.created` while an
issue carries `needs-info`. Its own comment satisfies that condition, so it
re-arms itself — on #678 it produced eleven back-to-back "Needs-info re-check"
comments in ~27 minutes with no reporter input, each one a full LLM run. Every
comment, the automation's included, is posted under the reporter's account
(`user.type: User`), so `sender.login` and `sender.type` cannot tell them apart.

The automation definition lives in the OpenHands events backend, not in this
repository, so its `trigger.filter` cannot be tested here. This script is the
repo-side guard: the back-end filter is a thin wrapper that calls `decide`, and
the guard test replays the real #678 stream against it. It is the only place
the loop can be pinned so a wording change cannot silently bring it back.

The three conditions, in order:

  * `needs-info` must be present (not-needs-info)
  * the comment must not be the automation's own (self-trigger)
  * otherwise it is a reporter reply and the re-check runs (reporter-reply)

The automation's own comments are recognised by the AI-disclosure footer every
automated comment carries (AGENTS.md / the automation prompt). That footer is
`AI_FOOTER` below — pin it there; a change to the wording must change it here
too, or the loop returns silently (see .claude/memory/decisions/).

Usage:
  automation-loop-guard.py decide -      one event object on stdin -> "act=… reason=…"
  automation-loop-guard.py replay -      {"needsInfo": bool, "comments": [...]} ->
                                         runs_old / runs_guarded on stdout
Exit 0 when it decided, 2 on a usage or input error.
"""
import json
import sys

# The disclosure footer every automated comment carries. This is the marker the
# loop guard depends on; it is duplicated from the automation prompt on purpose
# and is asserted by automation-loop-guard.guard.test.ts. Kept without the
# surrounding `*` so a bold/italic variant still matches.
AI_FOOTER = "This comment was created by an AI agent (OpenHands) on behalf of the repository maintainers."


def has_needs_info(event: dict) -> bool:
    labels = event.get("issue", {}).get("labels", []) or []
    return any(lbl.get("name") == "needs-info" for lbl in labels)


def is_own_comment(event: dict) -> bool:
    body = event.get("comment", {}).get("body") or ""
    return AI_FOOTER in body


def decide(event: dict) -> str:
    if not has_needs_info(event):
        return "act=no reason=not-needs-info"
    if is_own_comment(event):
        return "act=no reason=self-trigger"
    return "act=yes reason=reporter-reply"


def acts(event: dict) -> bool:
    return decide(event) == "act=yes reason=reporter-reply"


def replay(state: dict) -> str:
    """Count runs the unguarded trigger fires vs the guarded one.

    The unguarded trigger is the defect: every comment while `needs-info` is
    present. The guard drops the automation's own comments.
    """
    needs_info = bool(state.get("needsInfo"))
    comments = state.get("comments", []) or []
    runs_old = 0
    runs_guarded = 0
    for comment in comments:
        event = {"issue": {"labels": [{"name": "needs-info"}] if needs_info else []}, "comment": comment}
        if needs_info:
            runs_old += 1
        if acts(event):
            runs_guarded += 1
    return f"runs_old={runs_old} runs_guarded={runs_guarded}"


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] != "-":
        print("usage: automation-loop-guard.py decide|replay -", file=sys.stderr)
        return 2
    mode = argv[0]
    try:
        raw = sys.stdin.read()
        if mode == "decide":
            print(decide(json.loads(raw)))
        elif mode == "replay":
            print(replay(json.loads(raw)))
        else:
            print(f"unknown mode: {mode}", file=sys.stderr)
            return 2
    except (json.JSONDecodeError, AttributeError, TypeError) as exc:
        print(f"bad input: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
