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

Usage (dry run by default — nothing is written without DEPLOY=true):
  OPENHANDS_API_KEY=… python3 deploy-automation-loop-guard.py
  OPENHANDS_API_KEY=… DEPLOY=true python3 deploy-automation-loop-guard.py

Env:
  OPENHANDS_API_KEY   bearer token for the automation service (required to run)
  OPENHANDS_HOST      automation service base URL
                      (default https://app.all-hands.dev)
  ONLY                comma-separated automation name substrings to limit to
  ALL=1               also guard automations that are not label-conditioned
                      (a comment-content filter, e.g. `@openhands`, can only
                      self-trigger if its own reply repeats the phrase, so it
                      is left alone by default)
Exit 0 on success, 1 when the API refused, 2 on a usage error.
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


def main() -> int:
    if not TOKEN:
        print("OPENHANDS_API_KEY is required", file=sys.stderr)
        return 2
    marker = "AI agent (OpenHands)"
    clause = _guard.guard_clause()
    deploy = os.environ.get("DEPLOY", "") == "true"
    all_ = os.environ.get("ALL", "") == "1"
    changed = 0
    for a in automations():
        name = a.get("name", "")
        if ONLY and not any(s in name for s in ONLY):
            continue
        trigger = a.get("trigger") or {}
        flt = trigger.get("filter") or ""
        if not str(trigger.get("on", "")).startswith("issue_comment"):
            continue
        # A filter that reacts to comment *content* (e.g. `@openhands`) can only
        # re-arm itself if its own reply repeats the phrase, so it is not the
        # loop shape this guards; adding the thin marker clause there would only
        # suppress a human who quotes an automated comment. A filter that keys on
        # issue state/labels and accepts any comment is the #680 shape.
        if "comment.body" in flt and "issue.labels" not in flt and not all_:
            print(f"skip  {name}: content filter, not label-conditioned (use ALL=1 to force)")
            continue
        if marker in flt:
            print(f"ok    {name}: already guarded")
            continue
        new_flt = f"({flt}) && {clause}" if flt else clause
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


if __name__ == "__main__":
    sys.exit(main())
