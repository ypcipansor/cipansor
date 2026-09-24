#!/usr/bin/env python3
"""Stempel "catatan tahan lama sudah level", dan apa artinya sudah level.

Dipakai dua pihak: hook PreCompact yang MEMBACANYA untuk memutuskan menahan
atau meloloskan, dan skill `sync-records` yang MENULISNYA setelah pass-nya
selesai.

KENAPA BUKAN WAKTU. Versi pertama menyimpan stempel waktu dan menganggapnya
kedaluwarsa setelah 30 menit. Itu ukuran yang salah, dan salahnya terasa:
pada 2026-09-05 pass dijalankan pukul 15:30 atas permintaan hook Stop, lalu
`/compact` pukul 17:00 tetap ditahan — meminta pass kedua atas sesi yang tidak
menghasilkan apa pun yang baru untuk dicatat. Yang menentukan catatan masih
level bukan "sudah berapa lama", melainkan "apakah ada yang baru sejak terakhir
dicatat".

Ukuran yang tepat, dan murah: HEAD git ditambah keadaan pohon kerja. Commit baru
berarti ada pekerjaan baru; berkas yang berubah berarti ada pekerjaan yang
bahkan belum di-commit. Keduanya sama = tidak ada yang baru = tidak perlu
bertanya, berapa pun jam yang sudah lewat.

Batas waktu tetap ada sebagai jaring pengaman, dan jauh lebih longgar: temuan
yang hanya hidup di percakapan — sebuah keputusan pengguna, sebuah pengukuran
yang membantah dugaan — tidak menyentuh git sama sekali.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
import time
from datetime import datetime

# Jaring pengaman untuk temuan yang tidak menyentuh git sama sekali. Longgar
# dengan sengaja: menahan compaction adalah gangguan, dan menahannya karena jam
# alih-alih karena pekerjaan adalah gangguan yang tidak dibayar apa pun.
MAX_AGE_SECONDS = 6 * 60 * 60


def _run(args: list[str], cwd: str) -> str:
    try:
        return subprocess.run(
            args, cwd=cwd, capture_output=True, text=True, timeout=10
        ).stdout.strip()
    except Exception:
        return ""


def work_fingerprint(project_dir: str) -> str:
    """Sidik jari pekerjaan: commit terakhir + apa pun yang belum di-commit.

    Kosong ketika direktorinya bukan repo git — dan pemanggilnya memperlakukan
    sidik jari kosong sebagai "tidak dapat dibandingkan", yang jatuh kembali ke
    batas waktu saja.
    """
    head = _run(["git", "rev-parse", "HEAD"], project_dir)
    if not head:
        return ""
    dirty = _run(["git", "status", "--porcelain"], project_dir)
    return hashlib.sha256(f"{head}\n{dirty}".encode()).hexdigest()


def stamp_path(project_dir: str) -> str:
    """Satu stempel per repo, bukan per sesi.

    Per sesi terlihat lebih rapi dan justru salah: pass yang dijalankan sesi
    lain di repo yang sama TETAP membuat catatannya level, dan memaksa sesi ini
    mengulangnya hanya menghasilkan pass kedua yang tidak menemukan apa-apa.
    """
    key = hashlib.sha256(os.path.abspath(project_dir or ".").encode()).hexdigest()[:16]
    directory = os.path.join(tempfile.gettempdir(), "claude-precompact-sync")
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, f"{key}.json")


def write(project_dir: str, session_id: str = "") -> str:
    """Tulis stempel repo; dengan `session_id`, catat juga bahwa SESI itu sudah
    menjalankan pass.

    Hook PreCompact memanggil ini TANPA session_id saat menahan `/compact`
    manual — itu penanda "sudah ditegur", bukan bukti pass sudah jalan, jadi
    tidak boleh ikut meluluskan pemadatan otomatis.
    """
    path = stamp_path(project_dir)
    now = time.time()
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({"at": now, "fingerprint": work_fingerprint(project_dir)}, handle)
    if session_id:
        with open(session_stamp_path(session_id), "w", encoding="utf-8") as handle:
            json.dump({"at": now}, handle)
    return path


def is_level(project_dir: str) -> bool:
    """Benar bila tidak ada yang baru sejak pass terakhir."""
    try:
        with open(stamp_path(project_dir), encoding="utf-8") as handle:
            stamp = json.load(handle)
    except Exception:
        return False

    if time.time() - float(stamp.get("at", 0)) > MAX_AGE_SECONDS:
        return False

    recorded = stamp.get("fingerprint") or ""
    current = work_fingerprint(project_dir)
    # Tanpa sidik jari yang dapat dibandingkan, batas waktu di atas yang berlaku
    # sendirian — dan itu memang perilaku lama, hanya dengan jendela yang lebih
    # masuk akal.
    if not recorded or not current:
        return True
    return recorded == current


# ── Pemadatan OTOMATIS ────────────────────────────────────────────────────
#
# Ditambahkan 2026-09-23 setelah DIUKUR bahwa jalur otomatis tidak pernah
# bekerja. Ketika hook PreCompact menahan pemadatan otomatis, Claude Code hanya
# mencatatnya di log debug ("Compaction blocked by PreCompact hook") — pesannya
# TIDAK sampai ke model. Hook lama lalu menulis stempel saat menahan, sehingga
# percobaan berikutnya (satu panggilan alat kemudian, ±40 detik) lolos tanpa pass
# apa pun. Sembilan pemadatan otomatis dalam satu sesi, nol pass yang dipicunya.
#
# Jalur yang memang sampai ke model adalah `additionalContext` dari hook
# PostToolUse / UserPromptSubmit (diuji langsung: pesan uji muncul di giliran
# yang sama). Jadi pembagian kerjanya sekarang:
#   - `context-sync-warn.sh` MEMBACA ukuran konteks dari transkrip dan menegur
#     model sebelum ambang tercapai, lalu sekali lagi saat pemadatan ditahan;
#   - `pre-compact-sync.sh` MENAHAN pemadatan otomatis (tanpa menulis stempel)
#     sampai sesi ini menjalankan `sync-records`, dengan batas atas yang jauh
#     di bawah dinding konteks model.
# Satu "babak" = rentang sejak SessionStart terakhir (startup, resume, atau
# sesudah pemadatan); garis dasarnya ditulis `stop-sync-baseline.sh`.

# Di atas angka ini `autoCompactWindow` dianggap tidak menyisakan ruang, dan
# pemadatan otomatis tidak pernah ditahan (jendela model terkecil di repo ini 1M).
HEADROOM_CEILING = 800_000
# Teguran pertama: sekian token sebelum jendela.
WARN_MARGIN_TOKENS = 120_000
# Claude Code memadatkan sedikit DI BAWAH jendela (terukur 567k–579k untuk
# jendela 600k). Pemadatan hanya ditahan bila konteks sudah di pita ini —
# pemadatan yang terjadi jauh di bawahnya berasal dari hal lain (model dengan
# jendela lebih kecil, reaktif) dan tidak boleh disentuh.
DUE_MARGIN_TOKENS = 60_000
# Berapa jauh melewati jendela pemadatan boleh ditahan, dan batas mutlaknya.
HOLD_PAST_WINDOW_TOKENS = 150_000
HOLD_ABSOLUTE_CEILING = 900_000


def configured_window(project_dir: str) -> int:
    """Jendela pemadatan otomatis dalam token, atau 0 bila tidak diatur.

    Urutan sama dengan Claude Code: variabel lingkungan dulu, lalu berkas
    pengaturan dari yang paling spesifik. Tak terbaca = tidak diatur, yang
    mematikan penahanan — arah yang aman.
    """
    raw = os.environ.get("CLAUDE_CODE_AUTO_COMPACT_WINDOW")
    if raw and raw.strip().isdigit():
        return int(raw.strip())
    home = os.path.expanduser("~")
    for path in (
        os.path.join(project_dir, ".claude", "settings.local.json"),
        os.path.join(project_dir, ".claude", "settings.json"),
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


def auto_hold_armed(window: int) -> bool:
    return 0 < window <= HEADROOM_CEILING


def hold_limit(window: int) -> int:
    return min(window + HOLD_PAST_WINDOW_TOKENS, HOLD_ABSOLUTE_CEILING)


def round_started_at(session_id: str) -> float:
    """Awal babak sesi ini (epoch detik), dari garis dasar hook SessionStart."""
    path = os.path.join(tempfile.gettempdir(), "claude-stop-sync", f"{session_id}.base")
    try:
        with open(path, encoding="utf-8") as handle:
            return float(json.load(handle).get("at") or 0)
    except Exception:
        return 0.0


def session_stamp_path(session_id: str) -> str:
    directory = os.path.join(tempfile.gettempdir(), "claude-precompact-sync")
    os.makedirs(directory, exist_ok=True)
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_")[:80] or "unknown"
    return os.path.join(directory, f"session-{safe}.json")


def synced_this_round(session_id: str, started_at: float) -> bool:
    """Benar bila sesi ini sudah menjalankan `sync-records` sejak babaknya dimulai.

    Per SESI, bukan per repo: pass sesi lain tidak memindahkan temuan sesi ini.
    """
    if not session_id or started_at <= 0:
        return False
    try:
        with open(session_stamp_path(session_id), encoding="utf-8") as handle:
            return float(json.load(handle).get("at") or 0) >= started_at
    except Exception:
        return False


def _epoch(stamp: str) -> float:
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def context_tokens(transcript_path: str, since: float = 0.0) -> int:
    """Ukuran konteks saat ini: `usage` jawaban asisten terakhir di rantai utama.

    input + cache_creation + cache_read + output adalah seluruh prompt yang baru
    saja dikirim ditambah jawabannya — angka yang sama dengan yang dipakai
    Claude Code untuk memutuskan pemadatan. Hanya membaca ekor berkas (transkrip
    bisa ratusan MB), membesar bertahap bila ekornya berisi hasil alat raksasa.
    Jawaban dari SEBELUM `since` diabaikan: tepat sesudah pemadatan, jawaban
    terakhir di berkas masih membawa angka pra-pemadatan.
    """
    try:
        size = os.path.getsize(transcript_path)
    except (OSError, TypeError):
        return 0
    for chunk in (1 << 20, 8 << 20, 32 << 20):
        start = max(0, size - chunk)
        try:
            with open(transcript_path, "rb") as handle:
                handle.seek(start)
                data = handle.read()
        except OSError:
            return 0
        lines = data.split(b"\n")
        if start > 0:
            lines = lines[1:]  # baris pertama mungkin terpotong
        for raw in reversed(lines):
            if b'"usage"' not in raw or b'"assistant"' not in raw:
                continue
            try:
                row = json.loads(raw)
            except Exception:
                continue
            if row.get("type") != "assistant" or row.get("isSidechain"):
                continue
            if since and _epoch(str(row.get("timestamp") or "")) < since:
                return 0
            usage = (row.get("message") or {}).get("usage") or {}
            total = sum(
                int(usage.get(key) or 0)
                for key in (
                    "input_tokens",
                    "cache_creation_input_tokens",
                    "cache_read_input_tokens",
                    "output_tokens",
                )
            )
            if total:
                return total
        if start == 0:
            break
    return 0


if __name__ == "__main__":
    project = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    # Dipanggil skill `sync-records` dari dalam sesi: Claude Code mengekspor
    # CLAUDE_CODE_SESSION_ID ke perintah Bash, jadi pass ini tercatat untuk
    # sesi yang menjalankannya.
    print(write(project, os.environ.get("CLAUDE_CODE_SESSION_ID", "")))
