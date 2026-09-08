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
# Auto-compaction is blocked ONLY when there is room to spare, and never
# otherwise. Left at its default, Claude Code compacts when the conversation
# reaches the model's context limit — refusing it there would strand the session
# at the wall with no way out, which is why this hook used to ignore auto
# entirely.
#
# Setting `autoCompactWindow` below the model's window changes that, and it is
# the whole reason this branch exists. At 700k on a 1M-token model, auto-compact
# fires with 300k still free: ample room to run the records pass and let the
# retry through. So the interlock is the setting itself — no reduced window, no
# blocking. Remove the setting and this hook silently goes back to never
# touching auto, with nobody needing to remember to disarm it.
#
#   /autocompact 700k     (writes autoCompactWindow to your user settings)
#   /autocompact auto     (back to the model's tuned window; auto stops being blocked)
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


def reduced_window() -> int:
    """The configured auto-compact window in tokens, or 0 when none is set.

    Read in the same precedence Claude Code uses: the environment variable wins,
    then the settings files from most specific to least. Anything unreadable
    counts as "not set", which disarms the auto branch — the safe direction.
    """
    raw = os.environ.get("CLAUDE_CODE_AUTO_COMPACT_WINDOW")
    if raw and raw.strip().isdigit():
        return int(raw.strip())

    project = os.environ.get("CLAUDE_PROJECT_DIR", "")
    home = os.path.expanduser("~")
    for path in (
        os.path.join(project, ".claude", "settings.local.json"),
        os.path.join(project, ".claude", "settings.json"),
        os.path.join(home, ".claude", "settings.json"),
    ):
        try:
            with open(path, encoding="utf-8") as handle:
                value = json.load(handle).get("autoCompactWindow")
            if isinstance(value, int) and value > 0:
                return value
        except Exception:
            continue
    return 0


if trigger != "manual":
    # Blocking auto-compaction is only safe with headroom below it, and the
    # only evidence of headroom available here is a window set well under the
    # smallest model window this repo runs against (1M). Above the ceiling —
    # or unset — auto is left alone, exactly as before.
    HEADROOM_CEILING = 800_000
    window = reduced_window()
    if window == 0 or window > HEADROOM_CEILING:
        sys.exit(0)

# Explicit opt-out: `/compact skip-sync`.
instructions = (data.get("custom_instructions") or "").lower()
if "skip-sync" in instructions or "nosync" in instructions:
    sys.exit(0)

# Sudah level? Lewatkan. `sync-stamp.py` yang memutuskan artinya, dan modul yang
# sama dipakai skill `sync-records` untuk menuliskannya — satu definisi, bukan
# dua yang harus sepakat selamanya.
project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
sys.path.insert(0, os.path.join(project_dir, ".claude", "hooks"))

try:
    import sync_stamp  # type: ignore

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
