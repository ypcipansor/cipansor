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


def write(project_dir: str) -> str:
    path = stamp_path(project_dir)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(
            {"at": time.time(), "fingerprint": work_fingerprint(project_dir)}, handle
        )
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


if __name__ == "__main__":
    project = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    print(write(project))
