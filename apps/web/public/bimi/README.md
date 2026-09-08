# Berkas BIMI

`cipansor.svg` adalah lambang yayasan dalam profil **SVG Tiny Portable/Secure
(SVG P/S)** — satu-satunya format yang diterima BIMI. Ia dirujuk dari DNS:

    default._bimi.cipansor.or.id  TXT  "v=BIMI1; l=https://cipansor.or.id/bimi/cipansor.svg;"

## Jangan sunting berkas SVG ini dengan tangan

Ia dihasilkan dari `apps/web/public/icons/icon-512.png` oleh
`scripts/bimi-trace-logo.py` (butuh potrace + Pillow; jalankan di dalam
kontainer, lihat komentar di kepala berkas itu). Menyuntingnya lewat editor
vektor biasa hampir selalu menambahkan hal yang **dilarang** profil ini —
`<style>`, `class=`, `<image>`, atau namespace tambahan — dan BIMI akan
menolaknya tanpa pesan yang jelas.

## Syarat yang harus tetap benar

| syarat | nilai sekarang |
|---|---|
| `version` | `1.2` |
| `baseProfile` | `tiny-ps` |
| `<title>` | wajib ada, berisi nama lembaga |
| rasio | persegi (`viewBox="0 0 512 512"`) |
| ukuran berkas | 25.730 byte (batas **32.768**) |
| latar | warna solid, **bukan** transparan |
| dilarang | skrip, animasi, `<a>`, `<image>`, `<use>`, `xlink`, `<style>`, `x=`/`y=` pada `<svg>` akar |

## Dua jebakan yang sudah dibayar sekali

1. **Teks cincin putus.** Huruf di sumber hanya ~10 px, jadi antialias
   memutus mangkuk huruf "P" pada KADIPATEN. Diperbaiki dengan *closing*
   morfologis pada masker teks (`K=5`), bukan dengan menyentuh satu huruf.
2. **Garis terluar ikut termakan.** Closing yang sama menyeberangi celah putih
   tipis (r 242-248) yang memisahkan cincin terluar (r 250-256) dari cakram
   utama, sehingga garis tepi kiri menjadi putus-putus. Karena itu perbaikan
   dibatasi pada `r < 238` saja. Kalau lambangnya diganti, ukur ulang profil
   radialnya sebelum memakai angka ini.
