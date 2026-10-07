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
the guard test replays real comment bodies (a captured fixture; #680 is the
issue the guard was written on) against it. It is the only place the loop can
be pinned so a wording change cannot silently bring it back.

The three conditions, in order:

  * `needs-info` must be present (not-needs-info)
  * the comment must not be the automation's own (self-trigger)
  * otherwise it is a reporter reply and the re-check runs (reporter-reply)

The automation's own comments are recognised by the AI-disclosure footer every
automated comment carries (AGENTS.md / the automation prompt). The footer's
wording is NOT stable — the automation has emitted at least three variants
(created/generated, maintainers/owner) on the very issues this guard was
written for, so matching the full sentence lets two of the three through and
the loop continues. `has_ai_footer` matches the invariant frame instead:
"an AI agent (OpenHands)" plus a marker that the sentence is a disclosure
("created"/"generated", "on behalf of"). `AI_FOOTER` pins the mandated
canonical wording for the decision doc and the guard test.

A footer pasted inside a quoted line (the reporter quoting a prior automated
comment to answer the request) is not the comment's own footer. `strip_quoted`
drops blockquote lines before matching, so a reply that quotes the footer is
still a reporter reply and the re-check runs.

Usage:
  automation-loop-guard.py decide -      one event object on stdin -> "act=… reason=…"
  automation-loop-guard.py replay -      {"needsInfo": bool, "comments": [...]} ->
                                         runs_old / runs_guarded on stdout
Exit 0 when it decided, 2 on a usage or input error.
"""
import json
import re
import sys

# The mandated disclosure footer, verbatim. Pinned by the decision doc and the
# guard test; deliberately not the only string the guard accepts — see
# `has_ai_footer` for why the full sentence alone is unsafe.
AI_FOOTER = "This comment was created by an AI agent (OpenHands) on behalf of the repository maintainers."

# The stable core of any disclosure footer the automation emits. The wording
# around it (created/generated, maintainers/owner) has drifted in practice, so
# the guard matches the frame, not one sentence.
_AI_AGENT = re.compile(
    r"an AI agent \(OpenHands\) on behalf of",
    re.IGNORECASE,
)
_DISCLOSURE_VERB = re.compile(r"\b(created|generated|posted|written|produced)\b", re.IGNORECASE)


def strip_quoted(body: str) -> str:
    """Drop blockquote lines (`> …`) so a quoted footer is not read as our own.

    A reporter can quote a prior automated comment while answering the request;
    that quote carries the footer, but the comment is theirs.
    """
    return "\n".join(line for line in body.splitlines() if not line.lstrip().startswith(">"))


def has_ai_footer(body: str) -> bool:
    text = strip_quoted(body)
    return bool(_AI_AGENT.search(text) and _DISCLOSURE_VERB.search(text))


def has_needs_info(event: dict) -> bool:
    labels = event.get("issue", {}).get("labels", []) or []
    return any(lbl.get("name") == "needs-info" for lbl in labels)


def is_own_comment(event: dict) -> bool:
    body = event.get("comment", {}).get("body") or ""
    return has_ai_footer(body)


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
