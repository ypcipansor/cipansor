#!/usr/bin/env python3
"""Fail if any README/docs markdown references an image that is not on disk, or
if a committed docs image is never referenced. Dangling images render as broken
icons in the GitHub README, which is exactly the "does not display" defect this
repo's gallery is meant to avoid.

    python3 scripts/check-doc-refs.py
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = ["README.md"]
for name in os.listdir(os.path.join(ROOT, "docs")):
    if name.endswith(".md"):
        DOCS.append(os.path.join("docs", name))

IMG_RX = re.compile(r'(?:!\[[^\]]*\]\(([^)\s]+)|<img[^>]+src="([^"]+)")')
EXTERNAL = ("http://", "https://", "data:")


def main() -> int:
    referenced: set[str] = set()
    missing: list[tuple[str, str]] = []
    for doc in DOCS:
        path = os.path.join(ROOT, doc)
        if not os.path.exists(path):
            continue
        text = open(path, encoding="utf-8").read()
        for m in IMG_RX.finditer(text):
            target = m.group(1) or m.group(2)
            if not target or target.startswith(EXTERNAL):
                continue
            target = target.split("?")[0].split("#")[0]
            referenced.add(os.path.normpath(target))
            full = os.path.join(ROOT, target)
            if not os.path.exists(full):
                missing.append((doc, target))

    on_disk = set()
    for root, _dirs, files in os.walk(os.path.join(ROOT, "docs", "images")):
        for f in files:
            on_disk.add(
                os.path.normpath(os.path.relpath(os.path.join(root, f), ROOT))
            )

    print(f"referenced: {len(referenced)}  on disk: {len(on_disk)}")
    for doc, target in sorted(missing):
        print(f"  MISSING {doc} -> {target}")
    print(f"\n{len(missing)} dangling image reference(s)")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())