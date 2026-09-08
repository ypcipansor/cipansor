#!/usr/bin/env bash
# Stop hook: sebelum giliran berakhir, ingatkan sekali untuk meratakan catatan
# yang tahan lama (memori, ROADMAP, plan, AGENTS) dengan apa yang benar-benar
# terjadi di sesi ini.
#
# `pre-compact-sync.sh` sudah menjaga pintu pemadatan. Tetapi sesi yang selesai
# tanpa pernah dipadatkan tidak lewat pintu itu sama sekali — dan justru sesi
# seperti itulah yang paling sering meninggalkan temuan hanya di dalam
# transkrip. Hook ini menutup celah tersebut.
#
# ── Kenapa syaratnya seketat ini ───────────────────────────────────────────
# `Stop` menyala pada SETIAP akhir giliran. Menegur tiap giliran akan membuat
# pengingatnya diabaikan dalam sehari, dan pengingat yang diabaikan lebih buruk
# daripada tidak ada pengingat: ia mengajarkan bahwa teguran hook boleh
# dilewati. Jadi hook ini menahan diri kecuali kelima syarat ini terpenuhi:
#
#   1. Bukan lanjutan dari teguran hook Stop sebelumnya (`stop_hook_active`) —
#      ini yang membuat gelung tak berujung mustahil.
#   2. Belum pernah menegur pada babak sesi ini (satu kali, itu saja).
#   3. Ada commit baru sejak sesi dimulai. Sesi yang hanya membaca dan menjawab
#      tidak menghasilkan apa pun yang perlu dicatat.
#   4. Pohon kerja bersih untuk berkas terlacak — titik istirahat yang wajar,
#      bukan tengah-tengah suntingan. Berkas tak terlacak diabaikan; direktori
#      kerja di sini hampir selalu menyimpan sisa harness sementara.
#   5. Belum ada catatan tahan lama yang ditulis sejak sesi dimulai. Kalau
#      memori atau ROADMAP sudah disentuh, pekerjaannya sudah dilakukan.
#
# Keluar 2 menahan giliran dan menyerahkan pesan ini ke model. Selain itu selalu
# keluar 0 — masukan tak terbaca, git tak terbaca, stempel tak bisa ditulis:
# semuanya lolos. Matikan sengaja dengan CLAUDE_SKIP_STOP_SYNC=1.
set -uo pipefail

[ "${CLAUDE_SKIP_STOP_SYNC:-}" = "1" ] && exit 0

input="$(cat 2>/dev/null || true)"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

python3 - "$input" "$root" <<'PY'
import json, os, subprocess, sys, tempfile

try:
    data = json.loads(sys.argv[1]) if sys.argv[1].strip() else {}
except Exception:
    sys.exit(0)

root = sys.argv[2]

# 1. Jangan pernah menegur teguran sendiri.
if data.get("stop_hook_active"):
    sys.exit(0)

session = str(data.get("session_id") or "unknown")
state = os.path.join(tempfile.gettempdir(), "claude-stop-sync")
base_path = os.path.join(state, session + ".base")
nag_path = os.path.join(state, session + ".nagged")

# 2. Sekali per babak.
if os.path.exists(nag_path):
    sys.exit(0)

try:
    with open(base_path) as fh:
        base = json.load(fh)
except Exception:
    sys.exit(0)          # tanpa garis dasar tidak ada yang bisa dinilai

base_head = str(base.get("head") or "")
base_at = float(base.get("at") or 0)


def git(*args, timeout=10):
    try:
        done = subprocess.run(
            ["git", "-C", root, *args],
            capture_output=True, text=True, timeout=timeout,
        )
        return done.stdout if done.returncode == 0 else ""
    except Exception:
        return ""


# 3. Ada commit sejak sesi dimulai?
if base_head:
    commits = git("rev-list", "--count", f"{base_head}..HEAD").strip()
else:
    commits = git("rev-list", "--count", f"--since=@{int(base_at)}", "HEAD").strip()

try:
    if int(commits or "0") < 1:
        sys.exit(0)
except ValueError:
    sys.exit(0)

# 4. Titik istirahat: tidak ada perubahan tertunda pada berkas terlacak.
if git("status", "--porcelain", "--untracked-files=no").strip():
    sys.exit(0)

# 5. Sudah ada catatan tahan lama yang ditulis sejak sesi dimulai?
slug = "".join(c if c.isalnum() else "-" for c in root)
memory = os.path.join(
    os.path.expanduser("~"), ".claude", "projects", slug, "memory"
)

watched = [
    os.path.join(root, "docs", "ROADMAP.md"),
    os.path.join(root, "docs", "EOFFICE_ESIGN_PLAN.md"),
    os.path.join(root, "docs", "KNOWN_ISSUES.md"),
    os.path.join(root, "AGENTS.md"),
    os.path.join(root, "apps", "api", "AGENTS.md"),
    os.path.join(root, "apps", "web", "AGENTS.md"),
    os.path.join(root, "packages", "shared", "AGENTS.md"),
]
try:
    for name in os.listdir(memory):
        watched.append(os.path.join(memory, name))
except Exception:
    pass

for path in watched:
    try:
        if os.path.getmtime(path) > base_at:
            sys.exit(0)
    except OSError:
        continue

try:
    os.makedirs(state, exist_ok=True)
    open(nag_path, "w").close()
except Exception:
    sys.exit(0)          # tidak bisa mencatat sudah menegur -> jangan menegur

sys.stderr.write(
    f"Sesi ini menghasilkan {commits} commit, dan belum satu pun catatan tahan "
    "lama disentuh sejak sesi dimulai. Transkripnya akan hilang; hanya berkas "
    "yang bertahan.\n\n"
    "Jalankan skill `sync-records` sekarang dan lakukan pass-nya. Mengoreksi "
    "memori yang DIBUAT SALAH oleh sesi ini lebih penting daripada menambah "
    "yang baru — memori usang itu dipercaya, memori yang hilang cuma absen.\n\n"
    "Kalau memang tidak ada yang layak dicatat, katakan itu dalam satu baris "
    "dan berhenti; jangan mengarang suntingan supaya hook ini senang. Teguran "
    "ini hanya sekali per sesi dan tidak akan menghalangi lagi.\n"
)
sys.exit(2)
PY
# TANPA `exit 0` di sini, dan itu bukan kelalaian: skrip ini HARUS mewarisi
# kode keluar python. Versi pertama menutup dengan `exit 0`, jadi pesannya
# tercetak rapi ke stderr sementara giliran tetap berakhir — teguran yang
# terlihat sempurna dan tidak menahan apa pun. Ketahuan hanya karena kode
# keluarnya diukur, bukan karena pesannya dibaca.
