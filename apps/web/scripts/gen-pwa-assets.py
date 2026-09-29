"""One-shot generator for the maskable icons and the manifest screenshots.

Kept in the repo so the assets can be rebuilt when the logo or a page changes;
it is not part of the app bundle.

The screenshots are captured from the *running app*, not cropped from the
docs pages (which are desktop renders and produced stretched, wrong-shaped
phone images). Capture them first with the tooling spec, which needs the
seeded stack up:

    pnpm --filter web exec playwright test -c playwright.pwa.config.ts --workers=1
    # writes PNGs to /tmp/pwa-shots

Then generate (from apps/web, writes into public/):

    python3 scripts/gen-pwa-assets.py
    python3 scripts/gen-pwa-assets.py --input /some/other/dir
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

WEB = Path(__file__).resolve().parent.parent
PUBLIC = WEB / "public"

# --- maskable icons -------------------------------------------------------
# The artwork is full-bleed (opaque content reaches every edge), which a
# maskable icon must not be: an OS mask crops to a circle/squircle and would
# clip the logo. Rebuild each maskable icon on a brand-green full-bleed square
# with the artwork scaled into the central ~72% so it survives every mask.
BRAND = (22, 163, 74)  # #16a34a, matches manifest theme_color
SAFE = 0.72

for size in (192, 512):
    art = Image.open(PUBLIC / f"icons/icon-{size}.png").convert("RGBA")
    target = int(size * SAFE)
    art = art.resize((target, target), Image.LANCZOS)
    base = Image.new("RGBA", (size, size), BRAND + (255,))
    off = (size - target) // 2
    base.alpha_composite(art, (off, off))
    out = PUBLIC / f"icons/maskable-{size}.png"
    base.save(out)


# --- manifest screenshots -------------------------------------------------
# Two form factors the Richer Install UI wants: wide (16:9 desktop) and narrow
# (9:16 phone). Cover (centre-crop to the target aspect) rather than crop((0,0))
# so a taller-than-target capture keeps its middle instead of a top slice.
WIDE = (1280, 720)
NARROW = (720, 1280)


def cover(src: Path, dst: Path, target: tuple[int, int]) -> None:
    im = Image.open(src).convert("RGB")
    tw, th = target
    w, h = im.size
    scale = max(tw / w, th / h)
    resized = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    rw, rh = resized.size
    left = (rw - tw) // 2
    top = (rh - th) // 2
    resized.crop((left, top, left + tw, top + th)).save(dst, "PNG")
    print("wrote", dst.relative_to(WEB), target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        default="/tmp/pwa-shots",
        help="directory holding the raw captures (default: /tmp/pwa-shots)",
    )
    args = parser.parse_args()
    src = Path(args.input)

    shots = PUBLIC / "screenshots"
    shots.mkdir(exist_ok=True)
    cover(src / "desktop-dashboard-raw.png", shots / "desktop-dashboard.png", WIDE)
    cover(src / "desktop-attendance-raw.png", shots / "desktop-attendance.png", WIDE)
    cover(src / "mobile-dashboard-raw.png", shots / "mobile-dashboard.png", NARROW)
    cover(src / "mobile-parent-raw.png", shots / "mobile-parent.png", NARROW)


if __name__ == "__main__":
    main()
