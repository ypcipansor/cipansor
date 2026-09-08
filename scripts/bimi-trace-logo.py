#!/usr/bin/env python3
"""Menghasilkan apps/web/public/bimi/cipansor.svg (profil BIMI SVG Tiny P/S).

Tidak ada potrace/Pillow di host, jadi jalankan di dalam kontainer dari akar repo:

    docker run --rm -v "$PWD/apps/web/public/icons:/src:ro" -v "$PWD/scripts:/s:ro" \
      -v /tmp/bimi:/w -w /w alpine:3.20 sh -c '
        apk add --no-cache potrace python3 py3-pillow py3-numpy &&
        python3 -c "
from PIL import Image
im=Image.open(\'/src/icon-512.png\').convert(\'RGBA\')
bg=Image.new(\'RGBA\', im.size, (255,255,255,255))
Image.alpha_composite(bg, im).convert(\'RGB\').save(\'flat.png\')" &&
        python3 /s/bimi-trace-logo.py 2 8 1.0 0.9 5'

Argumen: UPSCALE TURDSIZE ALPHAMAX OPTTOLERANCE CLOSING_K
Nilai yang dipakai sekarang: 2 8 1.0 0.9 5 -> 25.730 byte.
Baca apps/web/public/bimi/README.md sebelum mengubah salah satunya.
"""
from PIL import Image
import numpy as np, subprocess, re, sys

UP = int(sys.argv[1]) if len(sys.argv)>1 else 2
T  = int(sys.argv[2]) if len(sys.argv)>2 else 8
A  = sys.argv[3] if len(sys.argv)>3 else "1.0"
O  = sys.argv[4] if len(sys.argv)>4 else "0.4"

PAL = {"white":(255,255,255),"green":(0x35,0xad,0x44),"red":(0xe6,0x1f,0x2c),
       "yellow":(0xf9,0xec,0x09),"blue":(0x19,0x9f,0xdc)}
HEX = {"green":"#35ad44","red":"#e61f2c","yellow":"#f9ec09","blue":"#199fdc"}
ORDER = ["green","red","yellow","blue"]

im = Image.open("flat.png").convert("RGB")
N = 512*UP
im = im.resize((N,N), Image.LANCZOS)
a = np.array(im).astype(int)
names=list(PAL); ref=np.array([PAL[n] for n in names])
idx = ((a[:,:,None,:]-ref[None,None,:,:])**2).sum(-1).argmin(-1)

# --- perbaiki huruf yang putus -------------------------------------------
# Teks cincin hanya setinggi ~10 px di sumber 512, jadi antialias memutus
# stroke tipis (mangkuk huruf "P" pada KADIPATEN). Closing morfologis pada
# MASKER TEKS menyambung celah itu; hanya piksel yang semula HIJAU yang boleh
# berubah jadi teks, supaya batas dengan merah/kuning/biru tidak termakan.
from PIL import ImageFilter
K = int(sys.argv[5]) if len(sys.argv)>5 else 3
wi = names.index("white"); gi = names.index("green")
white = (idx==wi)
wim = Image.fromarray(np.where(white,255,0).astype("uint8"), "L")
closed = np.array(wim.filter(ImageFilter.MaxFilter(K)).filter(ImageFilter.MinFilter(K)))>127
bridge = closed & ~white & (idx==gi)
# Cincin tipis terluar (r 250-256 pada skala 512) dipisahkan dari cakram utama
# oleh celah putih tipis (r 242-248). Closing menyeberangi celah itu dan
# MEMAKAN cincinnya - itulah garis terputus di sisi kiri. Jadi perbaikan hanya
# boleh berlaku di pita teks, jauh di dalam cakram.
NN = 512*UP
yy, xx = np.mgrid[0:NN, 0:NN]
rr = np.hypot(yy-(NN-1)/2.0, xx-(NN-1)/2.0)
bridge &= rr < 238*UP
print(f"  closing K={K}: {bridge.sum()} px hijau disambungkan jadi teks")

layers=[]
for n in ORDER:
    mask = idx == names.index(n)
    if n == "green":
        mask = mask & ~bridge
    Image.fromarray(np.where(mask,0,255).astype("uint8")).convert("1").save(f"{n}.pbm")
    subprocess.run(["potrace",f"{n}.pbm","-s","-o",f"{n}.svg",
                    "-t",str(T),"-O",O,"-a",A],check=True)
    dd=" ".join(re.findall(r'<path d="([^"]+)"', open(f"{n}.svg").read()))
    dd=re.sub(r"(\d)\.0(?![0-9])",r"\1",re.sub(r"\s+"," ",dd)).strip()
    layers.append((n,dd)); print(f"  {n:7s}{len(dd):7d} chars")

# potrace: translate(0,N) scale(0.1,-0.1) in a Nx10 grid -> map to 512 viewBox
s = 512.0/N
def num(v):
    return f"{v:.4f}".rstrip("0").rstrip(".")
pre = f"scale({num(s)}) translate(0,{N}) scale(0.1,-0.1)"

out=['<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 512 512">',
     '<title>Yayasan Pesantren Cipansor</title>',
     '<desc>Lambang Yayasan Pesantren Cipansor Kadipaten, Tasikmalaya</desc>',
     '<rect x="0" y="0" width="512" height="512" fill="#ffffff"/>']
for n,dd in layers:
    out.append(f'<g transform="{pre}" fill="{HEX[n]}"><path d="{dd}"/></g>')
out.append("</svg>")
svg="\n".join(out); open("cipansor-bimi.svg","w").write(svg)
print(f"UP={UP} t={T} a={A} O={O}  TOTAL {len(svg.encode())} bytes (limit 32768)")
