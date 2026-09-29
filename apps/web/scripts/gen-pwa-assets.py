"""One-shot generator for the maskable icons and the manifest screenshots.

Kept in the repo so the assets can be rebuilt when the logo changes; it is not
part of the app bundle. Run from apps/web (writes into public/):

    python3 scripts/gen-pwa-assets.py
"""

from pathlib import Path

from PIL import Image

WEB = Path(__file__).resolve().parent.parent
PUBLIC = WEB / "public"
DOCS = WEB.parent.parent / "docs" / "images"

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
    print("wrote", out.relative_to(WEB))


# --- manifest screenshots -------------------------------------------------
# Crop real component screenshots (docs/images, the app's own pages) into the
# two form factors the Richer Install UI wants: wide (desktop) and narrow
# (phone). All wide share 16:9; all narrow share 9:16.
def crop_wide(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGB")
    im = im.crop((0, 0, 1280, 720))
    im.save(dst, "PNG")
    print("wrote", dst.relative_to(WEB), im.size)


def crop_narrow(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGB")  # 1280x1200
    w, h = im.size
    cw = int(h * 720 / 1280)  # 675 -> keeps 9:16 after resize
    left = (w - cw) // 2
    im = im.crop((left, 0, left + cw, h)).resize((720, 1280), Image.LANCZOS)
    im.save(dst, "PNG")
    print("wrote", dst.relative_to(WEB), im.size)


shots = PUBLIC / "screenshots"
shots.mkdir(exist_ok=True)
crop_wide(DOCS / "dashboard.png", shots / "desktop-dashboard.png")
crop_wide(DOCS / "attendance.png", shots / "desktop-attendance.png")
crop_narrow(DOCS / "dashboard.png", shots / "mobile-dashboard.png")
crop_narrow(DOCS / "parent-portal.png", shots / "mobile-parent.png")
