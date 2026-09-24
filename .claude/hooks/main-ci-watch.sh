#!/usr/bin/env bash
# SessionStart + UserPromptSubmit + PostToolUse: beri tahu model bila sebuah
# workflow di `main` gagal — CI, E2E, CodeQL, Deploy staging, Deploy production.
#
# ── Kenapa hook ini ada ─────────────────────────────────────────────────────
# Kegagalan di PR terlihat: PR punya check, dan Claude Code bisa berlangganan
# aktivitas PR. Sesudah digabung, tidak ada yang melihat. Padahal justru di sana
# kegagalan paling mahal bersembunyi: #504 dan #505 hijau sendiri-sendiri lalu
# MERAH digabung; `audit:deps` bisa memerahkan main karena CVE baru tanpa satu
# baris pun berubah; Deploy staging jalan SESUDAH merge. Usul pengguna,
# 2026-09-24.
#
# ── Cara kerja ─────────────────────────────────────────────────────────────
# `gh run list --branch main` butuh ±1 detik — terlalu mahal untuk setiap
# panggilan alat. Jadi hook membaca CACHE, dan bila cache lebih tua dari tiga
# menit ia menyalakan penyegaran di LATAR (proses lepas) lalu memakai cache
# lama; panggilan berikutnya melihat hasil baru. Hanya SessionStart yang
# menunggu jawaban segar (batas 8 detik), supaya sesi baru langsung tahu main
# sedang merah.
#
# Per workflow, yang dinilai adalah run SELESAI terakhir di main. Merah =
# failure / timed_out / startup_failure. `cancelled` diabaikan: concurrency
# membatalkan run lama secara wajar. Tiap run merah dilaporkan SEKALI per sesi;
# ketika workflow itu kembali hijau, dilaporkan sekali juga.
#
# Gagal terbuka: tanpa `gh`, tanpa jaringan, masukan rusak → diam.
# Matikan dengan CLAUDE_SKIP_MAIN_CI_WATCH=1.
set -uo pipefail

[ "${CLAUDE_SKIP_MAIN_CI_WATCH:-}" = "1" ] && exit 0

input="$(cat 2>/dev/null || true)"

python3 - "$input" <<'PY'
import hashlib, json, os, subprocess, sys, tempfile, time

try:
    data = json.loads(sys.argv[1]) if sys.argv[1].strip() else {}
except Exception:
    sys.exit(0)

if data.get("agent_id"):
    sys.exit(0)

event = data.get("hook_event_name") or "PostToolUse"
if event not in ("SessionStart", "UserPromptSubmit", "PostToolUse"):
    sys.exit(0)

project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
session = "".join(c for c in str(data.get("session_id") or "") if c.isalnum() or c in "-_")[:80]
if not session:
    sys.exit(0)

TTL = 180          # detik sebelum cache dianggap basi
REFRESH_GRACE = 60 # penyegaran latar yang belum selesai sesudah ini boleh diulang
RED = {"failure", "timed_out", "startup_failure"}
FIELDS = "databaseId,workflowName,conclusion,status,headSha,event,createdAt,displayTitle,url"

state = os.path.join(tempfile.gettempdir(), "claude-main-ci")
try:
    os.makedirs(state, exist_ok=True)
except Exception:
    sys.exit(0)
key = hashlib.sha256(os.path.abspath(project_dir).encode()).hexdigest()[:16]
cache = os.path.join(state, f"{key}.runs.json")
lock = os.path.join(state, f"{key}.refreshing")
seen_path = os.path.join(state, f"{key}.{session}.seen.json")

# Satu perintah untuk kedua jalur: menulis ke berkas sementara lalu `mv`, jadi
# pembaca tidak pernah melihat JSON setengah jadi.
fetch = (
    f"gh run list --branch main --limit 40 --json {FIELDS} > '{cache}.tmp' 2>/dev/null"
    f" && mv '{cache}.tmp' '{cache}'; rm -f '{lock}'"
)


def age(path):
    try:
        return time.time() - os.path.getmtime(path)
    except OSError:
        return None


if event == "SessionStart":
    try:
        subprocess.run(["bash", "-c", fetch], cwd=project_dir, timeout=8,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
else:
    a = age(cache)
    if a is None or a > TTL:
        la = age(lock)
        if la is None or la > REFRESH_GRACE:
            try:
                open(lock, "w").close()
                subprocess.Popen(["bash", "-c", fetch], cwd=project_dir,
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, start_new_session=True)
            except Exception:
                pass

try:
    with open(cache, encoding="utf-8") as handle:
        runs = json.load(handle)
except Exception:
    sys.exit(0)
if not isinstance(runs, list):
    sys.exit(0)

# Run SELESAI terakhir per workflow (gh mengurutkan terbaru dulu).
latest = {}
for run in runs:
    if run.get("status") != "completed" or run.get("conclusion") == "cancelled":
        continue
    latest.setdefault(run.get("workflowName") or "?", run)

try:
    with open(seen_path, encoding="utf-8") as handle:
        seen = json.load(handle)
except Exception:
    seen = {}
reported = set(seen.get("reported", []))
red_before = set(seen.get("red", []))

new_red, recovered, red_now = [], [], set()
for name, run in sorted(latest.items()):
    if run.get("conclusion") in RED:
        red_now.add(name)
        if run.get("databaseId") not in reported:
            new_red.append(run)
    elif name in red_before:
        recovered.append(run)

if not new_red and not recovered:
    if red_now != red_before:
        seen["red"] = sorted(red_now)
        try:
            with open(seen_path, "w", encoding="utf-8") as handle:
                json.dump(seen, handle)
        except Exception:
            pass
    sys.exit(0)

lines = []
for run in new_red:
    lines.append(
        f"- {run.get('workflowName')} GAGAL ({run.get('conclusion')}) pada "
        f"{str(run.get('headSha') or '')[:8]} \"{str(run.get('displayTitle') or '')[:70]}\" "
        f"[{run.get('event')}, {run.get('createdAt')}] — `gh run view {run.get('databaseId')} --log-failed`"
    )
for run in recovered:
    lines.append(
        f"- {run.get('workflowName')} kembali HIJAU pada {str(run.get('headSha') or '')[:8]} "
        f"[{run.get('createdAt')}]"
    )
text = "Status workflow di `main`:\n" + "\n".join(lines)
if new_red:
    text += (
        "\n\n`main` merah. Sebelum menggabung PR lain atau menggelar apa pun: baca log "
        "yang gagal, tentukan apakah merah itu dari kode (perbaiki lewat PR) atau dari "
        "luar (advisory npm baru, kuota Actions, jaringan), lalu beri tahu pengguna."
    )

seen["reported"] = sorted(reported | {r.get("databaseId") for r in new_red})[-200:]
seen["red"] = sorted(red_now)
try:
    with open(seen_path, "w", encoding="utf-8") as handle:
        json.dump(seen, handle)
except Exception:
    sys.exit(0)  # tak bisa mencatat sudah melapor -> jangan melapor berulang

print(json.dumps({"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}))
PY
