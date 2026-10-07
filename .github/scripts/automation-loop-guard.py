#!/usr/bin/env python3
"""Decide whether the `needs-info` re-check automation should act on a comment.

Issue #680: the automation fires on every `issue_comment.created` while an
issue carries `needs-info`. Its own comment satisfies that condition, so it
re-arms itself — on the fixture issue #678 it ran up to eleven back-to-back
"Needs-info re-check" comments in ~27 minutes with no reporter input, each a
full LLM run; #678 was later deleted, so the re-verifiable record is the nine
comments the automation left on #680 (captured in the guard test's fixture).
Every comment, the automation's included, is posted under the reporter's
account (`user.type: User`), so `sender.login` and `sender.type` cannot tell
them apart.

The automation definition lives in the OpenHands events backend, not in this
repository, so its `trigger.filter` is a JMESPath expression that cannot call
this script. The two are kept in step the other way round: this file is the
*spec* (the reference implementation, pinned by the guard test against real
captured comment bodies), and it prints the canonical filter clause the backend
must carry (`guard-clause`), which `.github/scripts/deploy-automation-loop-guard.py`
applies to the live automations. The deployment is what stops the loop; this
file is what makes the matching rule testable and single-sourced.

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
  automation-loop-guard.py guard-clause  print the JMESPath clause the backend filter appends
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


def guard_clause() -> str:
    """The JMESPath clause the backend `trigger.filter` must append.

    JMESPath has no split/regex verb, so the deployed filter can only test the
    whole body; the verb-and-quote subtleties above live in `decide` alone. The
    clause is the cheap, robust approximation of the same rule, using the part
    every observed footer shares. Deployed by
    .github/scripts/deploy-automation-loop-guard.py.
    """
    return "!icontains(comment.body, 'AI agent (OpenHands)')"


def _usage() -> int:
    print("usage: automation-loop-guard.py decide|replay - | guard-clause", file=sys.stderr)
    return 2


def main(argv: list[str]) -> int:
    if not argv:
        return _usage()
    mode = argv[0]
    if mode == "guard-clause":
        if len(argv) != 1:
            return _usage()
        print(guard_clause())
        return 0
    if mode in ("decide", "replay"):
        if len(argv) != 2 or argv[1] != "-":
            return _usage()
        try:
            raw = sys.stdin.read()
            if mode == "decide":
                print(decide(json.loads(raw)))
            else:
                print(replay(json.loads(raw)))
        except (json.JSONDecodeError, AttributeError, TypeError) as exc:
            print(f"bad input: {exc}", file=sys.stderr)
            return 2
        return 0
    return _usage()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
