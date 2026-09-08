#!/usr/bin/env bash
# SessionStart hook: tandai titik awal sesi, supaya hook `Stop` punya pembanding.
#
# Tanpa garis dasar ini, hook Stop tidak bisa membedakan "sesi ini melahirkan
# commit" dari "repo ini sudah lama punya commit". Yang disimpan hanya dua hal:
# SHA HEAD saat sesi dimulai, dan waktunya.
#
# Ditulis ulang pada setiap SessionStart, termasuk `compact` dan `resume`. Itu
# disengaja: sesudah pemadatan, catatan sudah diratakan oleh pre-compact-sync,
# jadi babak berikutnya pantas dinilai dari nol.
#
# Selalu keluar 0. Hook yang merusak sesi lebih buruk daripada hook yang
# melewatkan pengingat.
set -uo pipefail

input="$(cat 2>/dev/null || true)"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

python3 - "$input" "$root" <<'PY'
import json, os, subprocess, sys, tempfile, time

try:
    data = json.loads(sys.argv[1]) if sys.argv[1].strip() else {}
except Exception:
    sys.exit(0)

root = sys.argv[2]
session = str(data.get("session_id") or "unknown")

try:
    head = subprocess.run(
        ["git", "-C", root, "rev-parse", "HEAD"],
        capture_output=True, text=True, timeout=10,
    ).stdout.strip()
except Exception:
    head = ""

state = os.path.join(tempfile.gettempdir(), "claude-stop-sync")
try:
    os.makedirs(state, exist_ok=True)
    with open(os.path.join(state, session + ".base"), "w") as fh:
        json.dump({"head": head, "at": time.time()}, fh)
    # Babak baru, pengingat baru: buang stempel "sudah pernah menegur".
    nag = os.path.join(state, session + ".nagged")
    if os.path.exists(nag):
        os.remove(nag)
except Exception:
    pass
PY
exit 0
