#!/usr/bin/env bash
# PostToolUse + UserPromptSubmit: tegur model SEBELUM pemadatan otomatis, lewat
# satu-satunya jalur yang terbukti sampai ke model.
#
# ── Kenapa hook ini ada ─────────────────────────────────────────────────────
# `pre-compact-sync.sh` dirancang untuk menahan pemadatan dan menyerahkan
# pesannya ke model. Untuk `/compact` manual itu benar. Untuk pemadatan
# OTOMATIS tidak pernah benar: Claude Code hanya menulis alasan penahanannya ke
# log debug. Diukur 2026-09-23 di transkrip sesi — sembilan pemadatan otomatis,
# tidak satu pun pesan penahanan tercatat sampai ke model, dan pengguna yang
# pertama kali curiga ("jangan-jangan langsung auto compact tanpa sync").
#
# `additionalContext` dari PostToolUse dan UserPromptSubmit SAMPAI — diuji
# langsung dengan hook pemeriksa yang mencetak kata sandi uji: kata itu muncul
# di giliran yang sama. Jadi hook ini yang bicara, `pre-compact-sync.sh` yang
# menahan.
#
# ── Kapan menegur ──────────────────────────────────────────────────────────
# Ukuran konteks dibaca dari `usage` jawaban asisten terakhir di transkrip
# (`sync_stamp.context_tokens`). Dua tingkat per babak, masing-masing sekali:
#   1. mendekati: konteks >= jendela - 120k  → "jalankan sync-records sekarang"
#   2. jatuh tempo: konteks >= jendela - 60k → pemadatan sedang DITAHAN
# Diam sama sekali bila `autoCompactWindow` tidak diatur (atau > 800k), bila
# sesi ini sudah menjalankan `sync-records` sejak babaknya dimulai, atau bila
# yang memanggil adalah subagen (pesannya akan salah alamat).
#
# Gagal terbuka: masukan tak terbaca, transkrip tak ada, apa pun → diam.
# Matikan dengan CLAUDE_SKIP_CONTEXT_SYNC=1.
set -uo pipefail

[ "${CLAUDE_SKIP_CONTEXT_SYNC:-}" = "1" ] && exit 0

input="$(cat 2>/dev/null || true)"

python3 - "$input" <<'PY'
import json, os, sys

try:
    data = json.loads(sys.argv[1]) if sys.argv[1].strip() else {}
except Exception:
    sys.exit(0)

if data.get("agent_id"):
    sys.exit(0)

event = data.get("hook_event_name") or "PostToolUse"
if event not in ("PostToolUse", "UserPromptSubmit"):
    sys.exit(0)

project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
sys.path.insert(0, os.path.join(project_dir, ".claude", "hooks"))

try:
    import sync_stamp  # type: ignore

    window = sync_stamp.configured_window(project_dir)
    if not sync_stamp.auto_hold_armed(window):
        sys.exit(0)
    session = str(data.get("session_id") or "")
    started = sync_stamp.round_started_at(session)
    if not session or started <= 0 or sync_stamp.synced_this_round(session, started):
        sys.exit(0)
    tokens = sync_stamp.context_tokens(data.get("transcript_path") or "", since=started)
    if tokens >= window - sync_stamp.DUE_MARGIN_TOKENS:
        level = 2
    elif tokens >= window - sync_stamp.WARN_MARGIN_TOKENS:
        level = 1
    else:
        sys.exit(0)

    # Sekali per tingkat per babak.
    marker = sync_stamp.session_stamp_path(session).replace("session-", "warned-")
    try:
        with open(marker, encoding="utf-8") as handle:
            seen = json.load(handle)
        if float(seen.get("round") or 0) == started and int(seen.get("level") or 0) >= level:
            sys.exit(0)
    except (OSError, ValueError):
        pass
    with open(marker, "w", encoding="utf-8") as handle:
        json.dump({"round": started, "level": level}, handle)
    limit = sync_stamp.hold_limit(window)
except SystemExit:
    raise
except Exception:
    sys.exit(0)

if level == 1:
    text = (
        f"Konteks {tokens:,} token; pemadatan otomatis jalan di sekitar {window:,}. "
        "Transkrip babak ini akan dibuang dan hanya berkas yang bertahan. "
        "Jalankan skill `sync-records` SEKARANG, di titik henti terdekat, sebelum "
        "melanjutkan tugas: koreksi memori yang jadi SALAH lebih dulu, lalu tambahkan "
        "temuan baru. Pass itu diakhiri dengan menulis stempel "
        "(`python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/sync_stamp.py\"`), yang "
        "melepas pemadatan. Kalau memang tak ada yang layak dicatat, tetap tulis "
        "stempelnya dan katakan itu dalam satu baris."
    )
else:
    text = (
        f"Konteks {tokens:,} token: pemadatan otomatis sudah jatuh tempo dan sedang "
        "DITAHAN oleh pre-compact-sync.sh karena sesi ini belum menjalankan "
        "`sync-records` di babak ini. Hentikan pekerjaan lain dan jalankan pass-nya "
        "sekarang; stempel di langkah terakhirnya melepas pemadatan. Penahanan "
        f"berhenti sendiri di {limit:,} token — sesudah itu transkrip dipadatkan "
        "tanpa catatan."
    )

print(json.dumps({"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}))
PY
