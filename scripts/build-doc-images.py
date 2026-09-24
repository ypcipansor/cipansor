#!/usr/bin/env python3
"""Rebuild docs/images from the fresh visual-QA sweeps.

Sources (produced by the Playwright sweep scripts in apps/web/scripts):
  .qa-all/      one screenshot per App Router path, logged in as SUPER_ADMIN
  .qa-screens/  one screenshot per (role, menu path)

Each docs image is a copy of the freshest matching screenshot, resized to
1440px wide and re-encoded as an optimized PNG. Run from the repo root:

    python3 scripts/build-doc-images.py
"""
from __future__ import annotations

import json
import os
import re
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "apps", "web")
ALL = os.path.join(WEB, ".qa-all")
ROLES = os.path.join(WEB, ".qa-screens")
OUT = os.path.join(ROOT, "docs", "images")

MAX_W = 1440


def slug(path: str) -> str:
    return "root" if path == "/" else path[1:].replace("/", "__")


def load_report(d: str) -> list[dict]:
    with open(os.path.join(d, "report.json")) as f:
        return json.load(f)


def abs_shot(rel: str) -> str:
    """Report paths are relative to apps/web; make them repo-rooted."""
    return rel if os.path.isabs(rel) else os.path.join(WEB, rel)


def pick_screenshot(report: list[dict], path: str) -> str | None:
    for r in report:
        if r["path"] == path:
            return abs_shot(r["screenshot"])
    return None


def first_match(report: list[dict], pattern: str) -> str | None:
    rx = re.compile(pattern)
    for r in sorted(report, key=lambda x: x["path"]):
        if rx.search(r["path"]):
            return abs_shot(r["screenshot"])
    return None


def main() -> int:
    all_report = load_report(ALL)
    role_report = load_report(ROLES)
    existing = sorted(f for f in os.listdir(OUT) if f.endswith(".png"))
    os.makedirs(OUT, exist_ok=True)

    # name in docs/images -> (source report, path/pattern)
    M: dict[str, tuple[list[dict], str]] = {
        # 1. dashboards & auth
        "dashboard-global": (all_report, "/dashboard/executive"),
        "dashboard": (role_report, "/dashboard@super"),
        "dashboard-sma": (role_report, "/dashboard@smaq"),
        "dashboard-smp": (role_report, "/dashboard@smpit"),
        "dashboard-sd": (role_report, "/dashboard@sdit"),
        "dashboard-paud": (role_report, "/dashboard@tkq"),
        "login": (all_report, "/login"),
        "reset-password": (all_report, "/reset-password"),
        # 2. foundation & admin
        "foundation": (all_report, "/foundation"),
        "finance": (all_report, "/finance"),
        "hr": (all_report, "/hr"),
        "e-office": (all_report, "/e-office"),
        "teacher": (all_report, "/teacher"),
        "duty-roster": (all_report, "/duty-roster"),
        "employee-detail": (all_report, r"^/hr/employees/[0-9a-f-]+$"),
        "admin_my_leaves_verified": (all_report, "/hr/leaves"),
        "reception": (all_report, "/reception"),
        "procurement": (all_report, "/procurement"),
        "users": (all_report, "/users"),
        "analytics": (all_report, "/analytics"),
        "reports": (all_report, "/reports"),
        "units": (all_report, "/units"),
        "marketing": (all_report, "/marketing"),
        "quality": (all_report, "/quality"),
        "staff": (all_report, "/staff"),
        "settings": (all_report, "/settings"),
        # 3. academic
        "students": (all_report, "/students"),
        "classes": (all_report, "/classes"),
        "curriculum": (all_report, "/curriculum"),
        "calendar": (all_report, "/calendar"),
        "attendance": (all_report, "/attendance"),
        "assessment": (all_report, "/assessment"),
        "certificates": (all_report, "/certificates"),
        "homeroom": (all_report, "/homeroom"),
        "academic-years": (all_report, "/academic-years"),
        "schedule": (all_report, "/schedule"),
        "student-detail": (all_report, r"^/students/[0-9a-f-]+$"),
        "library": (all_report, "/library"),
        "tk-daily-report": (all_report, "/tk/daily-reports/parent"),
        "paud": (all_report, "/tk"),
        "paud-list": (all_report, "/tk/daily-reports/class"),
        "daily-report-bulk": (all_report, "/daily-report"),
        "portfolio": (all_report, "/portfolio"),
        # 4. boarding
        "tahfidz": (all_report, "/tahfidz"),
        "takhosus": (all_report, "/takhosus"),
        "ibadah": (all_report, "/ibadah"),
        "muhasabah": (all_report, "/muhasabah"),
        "kitab-progress": (all_report, "/kitab-progress"),
        "muhadatsah": (all_report, "/muhadatsah"),
        "dormitories": (all_report, "/dormitories"),
        "muhadhoroh": (all_report, "/muhadhoroh"),
        "musyrif": (all_report, "/musyrif"),
        "rapor-pesantren": (all_report, "/rapor-pesantren"),
        "violations": (all_report, "/violations"),
        "counseling": (all_report, "/counseling"),
        "permits": (all_report, "/permits"),
        "rewards": (all_report, "/rewards"),
        # 5. facilities
        "health": (all_report, "/health"),
        "wallet": (all_report, "/wallet"),
        "meals": (all_report, "/meals"),
        "laundry": (all_report, "/laundry"),
        "canteen": (all_report, "/canteen"),
        "inventory": (all_report, "/inventory"),
        "facilities": (all_report, "/facilities"),
        "extracurricular": (all_report, "/extracurricular"),
        "notifications": (all_report, "/notifications"),
        # 6. communication
        "announcements": (all_report, "/announcements"),
        "ppdb": (all_report, "/spmb"),
        "psb": (all_report, "/public/spmb"),
        "donation": (all_report, "/donation"),
        "alumni": (all_report, "/alumni"),
        # 7. parent portal
        "parent-portal": (role_report, "/parent@parent"),
        "parent-children": (role_report, "/parent/children@parent"),
        "parent-finance": (role_report, "/parent/finance@parent"),
        "parent-daily-report": (role_report, "/parent/daily-report@parent"),
        # 8. settings & profile
        "settings-profile": (all_report, "/profile"),
        "profile": (all_report, "/profile"),
        "settings-users": (all_report, "/users"),
        "settings-appearance": (all_report, "/settings/esign"),
    }

    # Expand the "@role" marker into a (report, path, role) lookup.
    def resolve(src, spec):
        report, spec_path = src
        if "@" in spec_path:
            path, role = spec_path.split("@", 1)
            role = {"smaq": "smaq-kepala-sekolah", "smpit": "smpit-kepala-sekolah",
                    "sdit": "sdit-kepala-sekolah", "tkq": "tkq-kepala-sekolah",
                    "super": "super-admin", "parent": "sdit-orang-tua"}[role]
            base = os.path.join(ROLES, role, slug(path) + ".png")
            return base if os.path.exists(base) else None
        if spec_path.startswith("^"):
            return first_match(report, spec_path)
        return pick_screenshot(report, spec_path)

    written, missing = 0, []
    for name, src in sorted(M.items()):
        out_path = os.path.join(OUT, name + ".png")
        if not os.path.exists(out_path):
            # Keep only names that already exist; this script refreshes content.
            pass
        found = resolve(src, src)
        if not found or not os.path.exists(found):
            missing.append((name, src[1]))
            continue
        im = Image.open(found).convert("RGB")
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        im.save(out_path, "PNG", optimize=True)
        written += 1

    print(f"wrote {written} images; {len(missing)} unmapped")
    for name, spec in missing:
        print("  MISS", name, "->", spec)
    # Report stale files in docs/images that no longer have a mapping.
    stale = [f for f in existing if f[:-4] not in M]
    if stale:
        print("stale (no mapping):", ", ".join(stale))
    return 0


if __name__ == "__main__":
    sys.exit(main())
