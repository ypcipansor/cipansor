#!/usr/bin/env python3
"""Point the live `issue_comment.created` automations at the loop guard.

Issue #680: the guard rule lives in `.github/scripts/automation-loop-guard.py`,
but the trigger that actually fires is a JMESPath `trigger.filter` held by the
OpenHands events backend. A filter cannot call a script, so the repo and the
backend are reconciled by deploying the filter the guard prints
(`automation-loop-guard.py guard-clause`).

This script is that deployment. It reads each automation's filter, and when the
automation reacts to issue comments but does not already carry the marker, it
appends the clause and PATCHes the automation back. It is idempotent: an
automation that already has the clause is left alone.

`verify` is the drift detector for finding 3 of the #683 review: the guard test
pins the composition against a checked-in snapshot, which cannot see a backend
edit that drops the clause and silently re-arms the loop. `verify` reads the
live service and exits 1 when a monitored automation's filter no longer carries
the clause, so a scheduled workflow can turn that drift into a failure. It
checks for the whole clause, not the marker word: a filter that lost only its
leading `!` still contains the marker but accepts the automation's own comments.

Usage (dry run by default — nothing is written without DEPLOY=true):
  OPENHANDS_API_KEY=… python3 deploy-automation-loop-guard.py
  OPENHANDS_API_KEY=… DEPLOY=true python3 deploy-automation-loop-guard.py
  OPENHANDS_API_KEY=… python3 deploy-automation-loop-guard.py verify
                      read the live filters, exit 1 if the guard clause is gone
  python3 deploy-automation-loop-guard.py verify -   the same report over a
                      {"automations": […]}.json on stdin — no network, exit 1 on
                      drift, so the guard test pins it
  python3 deploy-automation-loop-guard.py plan -    one decision per line from
                      {"automations": […], "all": bool} on stdin — no network,
                      so the guard test can pin the composed filter offline

Env:
  OPENHANDS_API_KEY   bearer token for the automation service (required to run)
  OPENHANDS_HOST      automation service base URL
                      (default https://app.all-hands.dev)
  ONLY                comma-separated automation name substrings to limit to
  ALL=1               also guard automations that are not label-conditioned
                      (a comment-content filter, e.g. `@openhands`, can only
                      self-trigger if its own reply repeats the phrase, so it
                      is left alone by default)
Exit 0 on success, 1 when the API refused or `verify` found drift, 2 on a usage
error.
"""
import importlib.util
import json
import os
import sys
import urllib.error
import urllib.request

HOST = os.environ.get("OPENHANDS_HOST", "https://app.all-hands.dev").rstrip("/")
API = f"{HOST}/api/automation/v1"
TOKEN = os.environ.get("OPENHANDS_API_KEY", "")
ONLY = [s for s in os.environ.get("ONLY", "").split(",") if s]

# The guard module's name has hyphens, so it cannot be imported by name; load
# it by path instead. It is the single source of the marker and the clause.
_SPEC = importlib.util.spec_from_file_location(
    "automation_loop_guard",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "automation-loop-guard.py"),
)
_guard = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_guard)


def api(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as resp:
        raw = resp.read().decode()
    return json.loads(raw) if raw else {}


def automations() -> list[dict]:
    out: list[dict] = []
    offset = 0
    while True:
        listing = api("GET", f"?limit=100&offset={offset}")
        items = listing if isinstance(listing, list) else listing.get("items", listing.get("automations", []))
        items = [a for a in items if isinstance(a, dict)]
        out.extend(items)
        if len(items) < 100:
            return out
        offset += 100


def has_guard(flt: str) -> bool:
    """True when `flt` carries the exact clause the deploy script appends.

    Checking the marker word alone is not enough: a filter that lost its leading
    `!` still contains "AI agent (OpenHands)" but accepts the automation's own
    comments, so it would be reported as guarded while the loop restarted.
    """
    return _guard.guard_clause() in flt


def is_label_conditioned(flt: str) -> bool:
    """True when the filter's scope is issue labels — the #680 loop shape.

    A filter keyed on comment content (`@openhands`) can only re-arm if its own
    reply repeats the phrase; one keyed on sender or repository does not react
    to issue state at all. Neither is the loop this guard exists for, so the
    plan and `verify` leave them out of scope rather than reporting false drift.
    """
    return "issue.labels" in flt


def plan_one(name: str, trigger: dict, only: list[str], all_: bool) -> str:
    """Decide what to do with one automation's trigger, without touching the API.

    Returns one of:
      "skip: <reason>"       left alone
      "ok: <reason>"         already carries the clause
      "patch: <new filter>"  must be re-written
    Kept separate from the network so the guard test can pin the composed
    filter offline (mode `plan -`).
    """
    on = str(trigger.get("on", ""))
    if not on.startswith("issue_comment"):
        return "skip: not issue_comment"
    if only and not any(s in name for s in only):
        return "skip: not selected"
    flt = trigger.get("filter") or ""
    # Monitor only the #680 shape (see `is_label_conditioned`). Checked before
    # "already guarded" so the plan and `verify` agree on the set: a guarded
    # content- or sender-filter is still not this loop and stays out of scope.
    if not all_ and not is_label_conditioned(flt):
        return "skip: not label-conditioned"
    if has_guard(flt):
        return "ok: already guarded"
    new_flt = f"({flt}) && {_guard.guard_clause()}" if flt else _guard.guard_clause()
    return f"patch: {new_flt}"


def plan(state: dict, only: list[str] | None = None) -> list[str]:
    """Apply `plan_one` to a list of automations, in order. Pure; no network."""
    only = only or []
    all_ = bool(state.get("all"))
    out = []
    for a in state.get("automations", []) or []:
        out.append(plan_one(a.get("name", ""), a.get("trigger") or {}, only, all_))
    return out


def _usage() -> int:
    print(
        "usage: deploy-automation-loop-guard.py [plan - | verify]",
        file=sys.stderr,
    )
    return 2


def verify_actions(state: dict, only: list[str] | None = None) -> list[str]:
    """One line per monitored automation: does its filter carry the guard clause?

    The monitored set is the #680 shape only — an `issue_comment.created`
    automation whose scope is issue labels (`is_label_conditioned`), the same
    set `plan` patches. A content- or sender-filtered automation is not this
    loop and is left out, so an unrelated filter cannot raise false drift.
    Pure (no network) so the guard test can pin it; `verify` feeds it the live
    definitions. A monitored filter that lost the clause — including one that
    lost only the leading `!` — will re-arm the loop, so it is reported as
    drift.
    """
    only = only or []
    all_ = bool(state.get("all"))
    out = []
    for a in state.get("automations", []) or []:
        trigger = a.get("trigger") or {}
        name = a.get("name", "")
        on = str(trigger.get("on", ""))
        if not on.startswith("issue_comment"):
            continue
        if only and not any(s in name for s in only):
            continue
        flt = trigger.get("filter") or ""
        if not all_ and not is_label_conditioned(flt):
            continue
        out.append(f"drift: {name}: guard clause missing" if not has_guard(flt) else f"ok: {name}")
    return out


def run_verify() -> int:
    if not TOKEN:
        print("OPENHANDS_API_KEY is required", file=sys.stderr)
        return 2
    lines = verify_actions({"automations": automations()}, ONLY)
    for line in lines:
        print(line)
    drift = [line for line in lines if line.startswith("drift")]
    if drift:
        print(
            f"{len(drift)} automation(s) lost the guard clause — re-run with DEPLOY=true",
            file=sys.stderr,
        )
        return 1
    print("all monitored automations carry the guard clause")
    return 0


def run_network() -> int:
    if not TOKEN:
        print("OPENHANDS_API_KEY is required", file=sys.stderr)
        return 2
    clause = _guard.guard_clause()
    deploy = os.environ.get("DEPLOY", "") == "true"
    all_ = os.environ.get("ALL", "") == "1"
    changed = 0
    for a in automations():
        name = a.get("name", "")
        trigger = a.get("trigger") or {}
        decision = plan_one(name, trigger, ONLY, all_)
        if decision.startswith("skip"):
            print(f"skip  {name}: {decision[len('skip: '):]}")
            continue
        if decision.startswith("ok"):
            print(f"ok    {name}: already guarded")
            continue
        new_flt = decision[len("patch: "):]
        flt = trigger.get("filter") or ""
        print(f"{'PATCH' if deploy else 'dry  '} {name}")
        print(f"      was: {flt}")
        print(f"      now: {new_flt}")
        changed += 1
        if not deploy:
            continue
        trigger["filter"] = new_flt
        api("PATCH", f"/{a['id']}", {"trigger": trigger})
        after = api("GET", f"/{a['id']}")
        got = (after.get("trigger") or {}).get("filter", "")
        if clause not in got:
            print(f"FAIL  {name}: filter did not stick", file=sys.stderr)
            return 1
        print(f"      verified")
    if not changed:
        print("nothing to change")
    elif not deploy:
        print(f"{changed} automation(s) need the guard — re-run with DEPLOY=true to apply")
    return 0


def main(argv: list[str]) -> int:
    if argv == ["plan", "-"]:
        try:
            state = json.loads(sys.stdin.read())
        except (json.JSONDecodeError, TypeError) as exc:
            print(f"bad input: {exc}", file=sys.stderr)
            return 2
        for line in plan(state):
            print(line)
        return 0
    if argv == ["verify", "-"]:
        # Offline: verify a definitions file the caller pipes in, no network.
        # Exits nonzero on drift, matching `run_verify`, so an automated caller
        # treating the status as the check cannot accept a broken definition.
        try:
            state = json.loads(sys.stdin.read())
        except (json.JSONDecodeError, TypeError) as exc:
            print(f"bad input: {exc}", file=sys.stderr)
            return 2
        lines = verify_actions(state)
        for line in lines:
            print(line)
        return 1 if any(line.startswith("drift:") for line in lines) else 0
    if argv == ["verify"]:
        return run_verify()
    if argv:
        return _usage()
    return run_network()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
