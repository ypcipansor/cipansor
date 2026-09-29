#!/usr/bin/env python3
"""Pindai berkas dokumen dari pola sensitif sebelum dokumen dikirim keluar.

Repo Cipansor publik sampai rilis; dokumen sering dikirim ke donor, auditor,
vendor. Skrip ini menangkap kasus mekanis: kunci, JWT, connection string,
host/ID sumber daya cloud, IP, jalur host, kata sandi demo, NIK/telepon.

Pemakaian: python scan_sensitive.py berkas.md [berkas2 ...]
Kode keluar 1 bila ada temuan.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PATTERNS: list[tuple[str, str]] = [
    ("kunci privat", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("JWT", r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    ("connection string", r"(?i)\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp)://[^\s\"'<>]+:[^\s\"'<>@]+@"),
    ("kunci AWS", r"\bAKIA[0-9A-Z]{16}\b"),
    ("kunci API panjang", r"(?i)\b(api[_-]?key|secret|token|passwd|password)\b\s*[:=]\s*[\"']?[A-Za-z0-9_\-]{16,}"),
    ("host cloud", r"(?i)\b[\w.-]+\.(database\.windows\.net|postgres\.database\.azure\.com|blob\.core\.windows\.net|vault\.azure\.net|azurewebsites\.net|amazonaws\.com)\b"),
    ("alamat IPv4", r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b"),
    ("jalur host", r"/(home|Users|var|etc|opt|srv)/[A-Za-z0-9._/-]{3,}"),
    ("NIK 16 digit", r"\b\d{16}\b"),
    ("nomor telepon Indonesia", r"(\+62|62|0)8[1-9][0-9]{6,11}\b"),
    ("kata sandi demo", r"(?i)\b(password|sandi|kata sandi)\b\s*[:=]\s*[\"']?(demo|admin|cipansor|123456|password)\b"),
    ("email pribadi", r"\b[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook)\.[A-Za-z]{2,}\b"),
]

WHITELIST = [
    r"npmjs\.com", r"github\.com", r"arc42\.org", r"c4model\.com", r"diataxis\.fr",
    r"cipansor\.or\.id", r"staging\.cipansor\.or\.id", r"portal\.cipansor\.or\.id",
    r"cipansor\.app", r"cipansor\.com",
    r"127\.0\.0\.1", r"0\.0\.0\.0", r"localhost",
    r"/home/data", r"/mnt/", r"/tmp/",
    r"@cipansor\.or\.id", r"example\.com",
]


def scanned_lines(text: str):
    wl = re.compile("|".join(WHITELIST))
    for i, line in enumerate(text.splitlines(), 1):
        if wl.search(line):
            line = wl.sub(" ", line)
        for name, pat in PATTERNS:
            for m in re.finditer(pat, line):
                yield i, name, m.group(0)


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        print(__doc__); return 2
    found = 0
    for p in paths:
        text = p.read_text(encoding="utf-8", errors="replace")
        for ln, name, sample in scanned_lines(text):
            found += 1
            masked = sample[:6] + "…" if len(sample) > 8 else sample
            print(f"{p}:{ln}: [{name}] {masked}")
    if found:
        print(f"\n{found} temuan. Perbaiki sebelum menyerahkan dokumen.", file=sys.stderr)
        return 1
    print("Bersih: tidak ada pola sensitif mekanis.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
