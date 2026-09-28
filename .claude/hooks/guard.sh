#!/usr/bin/env bash
# PreToolUse guard for the two mechanical mistakes that have actually bitten
# this repo before:
#
#   1. A full-file `Write` to prisma/schema.prisma. The schema is ~9k lines and
#      has been silently truncated by a rewrite; it must only ever be edited
#      surgically. Force `Edit`.
#   2. A `git push` that targets `main`. Work happens on feature branches; main
#      is protected by convention, and an agent should never push it directly.
#   3. Sensitive text written into a Markdown file of this repository (project
#      memory, docs, guides). The repo is public until release; the rule is in
#      AGENTS.md → "Where things live", the patterns in
#      .github/scripts/check-sensitive.py (the Security CI job runs the same
#      script). The machine-local memory under ~/.claude is not a checkout, so
#      it is never checked — that is where sensitive notes belong.
#
# The hook reads the tool call as JSON on stdin. Exit 0 allows the call; exit 2
# blocks it and shows the message to the model. Anything the guard does not
# recognise is allowed — it fails open on purpose, so a parsing hiccup can never
# wedge a session.
set -euo pipefail

input="$(cat)"

python3 - "$input" <<'PY'
import json, re, sys

try:
    data = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)  # unparseable -> allow

tool = data.get("tool_name", "")
ti = data.get("tool_input", {}) or {}

def block(msg: str):
    print(msg, file=sys.stderr)
    sys.exit(2)

# 1. Never Write (full rewrite) the Prisma schema.
if tool == "Write":
    path = str(ti.get("file_path", ""))
    if path.replace("\\", "/").endswith("prisma/schema.prisma"):
        block(
            "Refusing Write to prisma/schema.prisma: it must be edited "
            "surgically with Edit, never rewritten wholesale (a full Write has "
            "truncated it before). Use Edit, then run "
            "`pnpm --filter api db:generate`."
        )

# 2. Never git push to main. Only a command *segment* that actually invokes
# `git push` targeting main is blocked — not a segment that merely mentions the
# string (an echo, a grep, a heredoc, a commit message), which starts with some
# other command. Feature branches with "main" inside a longer name
# (e.g. `maintenance-x`) are not matched.
if tool == "Bash":
    cmd = str(ti.get("command", ""))
    for segment in re.split(r"[;&|\n]+", cmd):
        s = segment.strip()
        # drop leading env-var assignments (FOO=bar git push ...)
        while re.match(r"^\w+=\S*\s+", s):
            s = s.split(None, 1)[1] if " " in s else ""
        if not re.match(r"^git\s+(-\S+\s+|--\S+(=\S+)?\s+)*push\b", s):
            continue
        if re.search(r"(\s|:)(HEAD:)?main(\s|$)", s):
            block(
                "Refusing to push to main. Push to the feature branch instead "
                "and open a PR; main is not a direct-push target."
            )

# 3. Sensitive text into a Markdown file of a checkout of this repository.
if tool in ("Write", "Edit", "MultiEdit"):
    import os, subprocess
    path = str(ti.get("file_path", ""))
    if path.endswith(".md"):
        scanner = None
        d = os.path.dirname(os.path.abspath(path))
        while d and d != os.path.dirname(d):
            cand = os.path.join(d, ".github", "scripts", "check-sensitive.py")
            if os.path.isfile(cand):
                scanner = cand
                break
            d = os.path.dirname(d)
        if scanner:
            if tool == "Write":
                text = str(ti.get("content", ""))
            elif tool == "Edit":
                text = str(ti.get("new_string", ""))
            else:
                text = "\n".join(str(e.get("new_string", "")) for e in ti.get("edits", []) or [])
            try:
                r = subprocess.run(
                    ["python3", scanner, "--stdin", os.path.relpath(path, os.path.dirname(os.path.dirname(os.path.dirname(scanner))))],
                    input=text, capture_output=True, text=True, timeout=20,
                )
            except Exception:
                sys.exit(0)  # fail open
            if r.returncode == 1 and r.stdout.strip():
                block(
                    "Refusing this write: the text carries what AGENTS.md → "
                    "\"Where things live\" keeps out of the (public) repository:\n"
                    + r.stdout.strip()
                    + "\nWrite it to the machine-local memory (~/.claude/projects/…/memory/) "
                    "instead, or replace the value with a placeholder (user:pass@host, "
                    "203.0.113.7, <vault-name>)."
                )

sys.exit(0)
PY
