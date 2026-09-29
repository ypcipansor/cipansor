# Dokumen Aplikasi Cipansor

Dokumentasi resmi Sistem Informasi Cipansor: dokumen teknis (kerangka
[arc42](https://arc42.org) + diagram [C4](https://c4model.com)) dan panduan
pengguna ([Diátaxis](https://diataxis.fr)).

## Isi

| Berkas | Isi |
|---|---|
| `dokumen-teknis-cipansor.md` / `.docx` / `.pdf` | Dokumen teknis aplikasi — 12 bab arc42, C4-1/2/3, 11 diagram Mermaid |
| `panduan-pengguna-umum.md` / `.docx` / `.pdf` | Panduan pengguna bagian umum — tutorial, konsep, rujukan |
| `panduan-pengguna-guru.md` / `.docx` / `.pdf` | Panduan pengguna buklet peran Guru |
| `*.build.json` | Hash sumber dan hasil bangun; `check_docs.py --built` memakainya untuk menolak `.docx`/`.pdf` yang basi |
| `evaluasi-dokumen.md` | Audit terhadap kode (bukan terhadap standar): temuan, akar masalah, perbaikan, yang belum selesai |
| `diagrams/` | Diagram Mermaid (`.mmd`) dan gambar (`.png`) hasil bangun |
| `fakta/` | `facts.json` + `facts.md` terukur dari kode, dasar angka di dokumen |

## Membangun ulang

Markdown adalah sumbernya; `.docx` dan `.pdf` dihasilkan darinya. Jangan menyunting
`.docx`. Alat ada di `.claude/skills/dokumen-aplikasi-cipansor/scripts/`; alur
lengkap dan aturannya di `SKILL.md` skill itu.

```bash
S=.claude/skills/dokumen-aplikasi-cipansor/scripts
python3 $S/check_env.py                                   # perkakas lengkap? (LibreOffice harus punya komponen Writer)
python3 $S/collect_facts.py . --out docs/dokumen-aplikasi/fakta
python3 $S/check_docs.py docs/dokumen-aplikasi/dokumen-teknis-cipansor.md --kind teknis \
  --repo . --facts docs/dokumen-aplikasi/fakta/facts.json --final      # 0 ERROR
python3 $S/build_docs.py docs/dokumen-aplikasi/dokumen-teknis-cipansor.md --out docs/dokumen-aplikasi \
  --format docx --pdf --title "Dokumen Teknis Aplikasi" --subtitle "Sistem Informasi Cipansor" \
  --version 0.2 --status Draf --commit <hash> --logo apps/web/public/logo.png
python3 $S/check_docs.py docs/dokumen-aplikasi/dokumen-teknis-cipansor.md --kind teknis --repo . \
  --facts docs/dokumen-aplikasi/fakta/facts.json --built docs/dokumen-aplikasi/dokumen-teknis-cipansor.build.json
python3 $S/scan_sensitive.py docs/dokumen-aplikasi/*.md
```

Untuk panduan pengguna pakai `--kind pengguna` (dan `--trace jejak.md` untuk melihat dari
berkas mana tiap nama tombol berasal). Bila `build_docs.py` mencetak `GAGAL`, jangan
menyerahkan hasilnya.

## Menjaga dokumen tetap akurat

Dokumen ini dihasilkan, bukan diketik ulang: **ukur ulang kode, periksa, lalu bangun
kembali** — jangan menyunting angka di dalam `.docx`. Tiap dokumen mencatat commit
basisnya di sampul dan riwayat revisi. Klasifikasi: *Internal — Yayasan Pesantren Cipansor*.

> Sebelum dokumen dibagikan ke luar (donor, auditor, vendor), jalankan
> `scan_sensitive.py` dan baca bab 11 dengan mata. Repositori ini publik sampai rilis;
> jangan memuat kredensial, host, IP, kelemahan yang masih terbuka, ataupun daftar
> perbaikan yang belum ada di produksi.

## Status

Draf 0.3, basis kode `1a0e6b1e` (kode `apps/` dan `packages/` identik dengan `aefc719`).
Panduan pengguna berperingkat **T2** (disusun dari kode, belum diuji pada aplikasi
berjalan); setiap kartu tugasnya bertanda ⚠ sampai seorang pengguna peran itu
mencobanya. Yang belum dikerjakan ada di `evaluasi-dokumen.md`, bagian 8.

Seluruh keluaran lolos pemeriksa mesin pada 29 September 2026: `check_docs.py`
0 ERROR (termasuk `--final` dan `--built`), `scan_sensitive.py` bersih,
`.docx`/`.pdf` diverifikasi ulang oleh `build_docs.py` (11/11 diagram dirender).
