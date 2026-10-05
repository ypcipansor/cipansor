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

from PIL import Image, ImageDraw

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


# --- notification badge ---------------------------------------------------
# Android draws `showNotification`'s `badge` as a monochrome silhouette: it
# keeps only the alpha channel and paints the status-bar icon in a flat tint,
# so a full-colour icon (let alone the brand-green maskable square, which is
# opaque to every edge) comes out as a solid grey blob. The badge therefore has
# to be a white glyph on transparent, sized to the platform's 24dp target.
#
# A bell, drawn from primitives so it stays crisp at badge size, reads as
# "notification" the way a shrunken logo does not.
BADGE = 96
badge = Image.new("RGBA", (BADGE, BADGE), (255, 255, 255, 0))
draw = ImageDraw.Draw(badge)
WHITE = (255, 255, 255, 255)
# Dome + skirt: an ellipse for the top and a rectangle for the straight sides,
# merged into one bell body.
draw.ellipse((24, 16, 72, 64), fill=WHITE)
draw.rectangle((24, 40, 72, 68), fill=WHITE)
# Rim and clapper.
draw.rounded_rectangle((18, 66, 78, 74), radius=4, fill=WHITE)
draw.ellipse((42, 74, 54, 86), fill=WHITE)
# Hanger loop above the dome.
draw.ellipse((44, 6, 52, 14), fill=WHITE)
badge.save(PUBLIC / "icons/badge-96.png")


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
