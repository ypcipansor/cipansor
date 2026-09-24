#!/usr/bin/env bash
# PreCompact hook: make the durable records get updated BEFORE the transcript
# that justifies them is thrown away.
#
# Compaction is lossy by design. Everything worth keeping has to be in a file
# first, and in practice it only got there because the user remembered to ask —
# every time. This hook asks instead.
#
# It blocks a MANUAL /compact (exit 2, message shown to the model), which hands
# control back so the records can be brought level. The retry that follows goes
# through, so this can nag but can never wedge: the escape is to run the command
# again.
#
# WHAT COUNTS AS "LEVEL" IS WORK, NOT TIME. The first version expired its stamp
# after thirty minutes, and the flaw showed on 2026-09-05: a pass run at 15:30
# at the Stop hook's request, and /compact at 17:00 blocked anyway — demanding a
# second pass over a session that had produced nothing new to record. What
# decides whether the records are level is not how long ago, but whether
# anything has happened since. `sync-stamp.py` measures that with git HEAD plus
# the working tree, and a six-hour ceiling remains as a backstop for findings
# that never touch git at all.
#
# The stamp is written by this hook AND by the `sync-records` skill itself, so a
# pass the user asked for directly also silences the next compaction — which it
# did not before, and that was plainly the wrong way round.
#
# AUTO-COMPACTION IS A DIFFERENT PROTOCOL, and the first version got it wrong.
# It assumed auto worked like manual: block once, the model reads the message,
# runs the pass, the retry goes through. Measured on 2026-09-23 it does not —
# for an AUTO compaction Claude Code writes the block reason to its debug log
# only; the model never sees it. And because this hook wrote the stamp while
# blocking, the retry one tool call later (~40 s) sailed through. Nine auto
# compactions in one session, zero passes caused by this hook.
#
# So for auto this hook no longer talks; it only HOLDS. The talking is done by
# `context-sync-warn.sh` (PostToolUse + UserPromptSubmit), whose
# `additionalContext` does reach the model — tested live. The hold:
#   - never writes the stamp; only a real `sync-records` pass by THIS session,
#     since the current round began, releases it (`sync_stamp.synced_this_round`);
#   - applies only when `autoCompactWindow` is set with headroom (<= 800k), and
#     only when the context is actually at that window — a compaction far below
#     it comes from something else (a smaller model, a reactive retry) and is
#     left alone;
#   - lets go at window + 150k (max 900k), so the worst case is a late
#     compaction without a pass, never a session stranded at the wall.
#
#   /autocompact 600k     (arms it: writes autoCompactWindow to user settings)
#   /autocompact auto     (disarms it: the model's own window, never held)
#
# Fails open in every other respect — unparseable input, unwritable stamp
# directory, anything unexpected — because a hook that breaks a session is worse
# than a hook that misses a reminder.
set -uo pipefail

input="$(cat 2>/dev/null || true)"

python3 - "$input" <<'PY'
import json, os, sys, tempfile, time

try:
    data = json.loads(sys.argv[1]) if sys.argv[1].strip() else {}
except Exception:
    sys.exit(0)  # unreadable -> allow

# The field naming has moved around between versions; accept either, and treat
# an absent trigger as "auto" so an unknown shape takes the cautious branch.
trigger = (
    data.get("trigger")
    or data.get("compaction_trigger")
    or data.get("hookSpecificOutput", {}).get("trigger")
    or "auto"
)


project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
sys.path.insert(0, os.path.join(project_dir, ".claude", "hooks"))
try:
    import sync_stamp  # type: ignore
except Exception:
    sys.exit(0)  # tak bisa menilai -> jangan pernah menahan

if trigger != "manual":
    try:
        window = sync_stamp.configured_window(project_dir)
        if not sync_stamp.auto_hold_armed(window):
            sys.exit(0)
        session = str(data.get("session_id") or "")
        started = sync_stamp.round_started_at(session)
        if sync_stamp.synced_this_round(session, started):
            sys.exit(0)
        tokens = sync_stamp.context_tokens(data.get("transcript_path") or "", since=started)
        due_from = window - sync_stamp.DUE_MARGIN_TOKENS
        if not (due_from <= tokens < sync_stamp.hold_limit(window)):
            sys.exit(0)
    except SystemExit:
        raise
    except Exception:
        sys.exit(0)
    # Hanya sampai ke log debug; yang menegur model adalah context-sync-warn.sh.
    sys.stderr.write(
        f"Auto-compaction held at {tokens} tokens: this session has not run "
        "`sync-records` since the round began. Released by the pass, or at "
        f"{sync_stamp.hold_limit(window)} tokens.\n"
    )
    sys.exit(2)

# ── Manual `/compact` ──────────────────────────────────────────────────────
# Explicit opt-out: `/compact skip-sync`.
instructions = (data.get("custom_instructions") or "").lower()
if "skip-sync" in instructions or "nosync" in instructions:
    sys.exit(0)

# Sudah level? Lewatkan. `sync-stamp.py` yang memutuskan artinya, dan modul yang
# sama dipakai skill `sync-records` untuk menuliskannya — satu definisi, bukan
# dua yang harus sepakat selamanya.
try:
    if sync_stamp.is_level(project_dir):
        sys.exit(0)
    sync_stamp.write(project_dir)   # percobaan ulang berikutnya lolos
except Exception:
    sys.exit(0)                     # tak bisa melacak keadaan -> jangan pernah menahan

sys.stderr.write(
    f"Compaction paused once ({trigger}), on purpose: the transcript is about "
    "to be discarded and only files survive it.\n\n"
    "Run the `sync-records` skill now and carry out its pass. Correcting a "
    "memory that this session made WRONG matters more than adding a new one — "
    "a stale memory is trusted, a missing one is merely absent.\n\n"
    "The pass ends by writing the stamp, so the /compact you then ask the user "
    "for goes straight through — and so does any later one, until new work "
    "appears. If nothing changed, say so plainly instead of inventing an "
    "edit.\n\n"
    "To skip deliberately: /compact skip-sync\n"
)
sys.exit(2)
PY
