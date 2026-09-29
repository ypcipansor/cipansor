# Dokumen Aplikasi Cipansor

Dokumentasi resmi Sistem Informasi Cipansor: dokumen teknis (kerangka
[arc42](https://arc42.org) + diagram [C4](https://c4model.com)) dan panduan
pengguna ([Diátaxis](https://diataxis.fr)).

## Isi

| Berkas | Isi |
|---|---|
| `dokumen-teknis-cipansor.docx` / `.pdf` / `.md` | Dokumen teknis aplikasi — 12 bab arc42, 10 diagram Mermaid |
| `panduan-pengguna-umum.docx` / `.pdf` / `.md` | Panduan pengguna bagian umum — tutorial, konsep, rujukan |
| `panduan-pengguna-guru.docx` / `.pdf` / `.md` | Panduan pengguna buklet peran Guru |
| `evaluasi-dokumen.docx` / `.pdf` / `.md` | Evaluasi terhadap standar (arc42, Diátaxis, ISO 26514, docs-as-code) |
| `diagrams/` | Diagram Mermaid (`.mmd`) dan gambar (`.png`) |
| `fakta/` | `facts.json` + `facts.md` terukur pada commit `aefc719`, dasar angka di dokumen |

## Membangun ulang

Markdown adalah sumbernya; `.docx` dan `.pdf` dihasilkan darinya. Alat
pembangunnya ada di skill `.claude/skills/dokumen-aplikasi-cipansor/scripts/`.
Prasyarat: `pandoc`, `python-docx`, `lxml`, `mermaid-cli` (mmdc) dengan Chromium,
dan LibreOffice (untuk mengisi daftar isi dan mengubah ke PDF).

```bash
S=.claude/skills/dokumen-aplikasi-cipansor/scripts
pip install python-docx lxml
npm install -g @mermaid-js/mermaid-cli
# pandoc dan libreoffice dari manajer paket sistem

export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
python3 $S/build_docs.py docs/dokumen-aplikasi/dokumen-teknis-cipansor.md --out . \
  --format docx --title "Dokumen Teknis Aplikasi" --subtitle "Sistem Informasi Cipansor" \
  --version 0.1 --status Draf --commit aefc719 --author "Agen OpenHands" \
  --logo apps/web/public/logo.png

# isi daftar isi (dipanggil otomatis oleh build_docs.py bila LibreOffice ada)
python3 $S/update_toc.py dokumen-teknis-cipansor.docx
soffice --headless --convert-to pdf --outdir . dokumen-teknis-cipansor.docx
python3 $S/scan_sensitive.py *.md   # periksa data sensitif; kode keluar 1 = ada temuan
```

Angka diukur ulang dengan `python3 $S/collect_facts.py <folder-repo>` — hasilnya
`fakta/facts.json`; jalankan dengan `--compare fakta/facts.json` saat memperbarui
dokumen.

## Menjaga dokumen tetap akurat

Dokumen ini dihasilkan, bukan diketik ulang: **perbarui angka dengan mengukur
ulang kode, lalu bangun kembali** — jangan menyunting angka di dalam `.docx`.
Setiap dokumen mencatat commit basisnya di sampul dan riwayat revisi. Klasifikasi
setiap dokumen: *Internal — Yayasan Pesantren Cipansor*.

> Sebelum dokumen dibagikan ke luar (donor, auditor, vendor), jalankan
> `scan_sensitive.py`. Repositori ini publik sampai rilis; jangan memuat
> kredensial, host, IP, atau kelemahan yang masih terbuka.

## Status

Draf 0.1, basis commit `aefc719`. Panduan pengguna berperingkat **T2** (disusun
dari kode, belum diuji pada aplikasi berjalan) dan setiap kartu tugasnya
bertanda ⚠ sampai diverifikasi seorang pengguna peran itu. Rincian evaluasi dan
usulan lanjutan ada di `evaluasi-dokumen.md`.
