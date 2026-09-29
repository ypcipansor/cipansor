---
name: dokumen-aplikasi-cipansor
description: Menyusun dokumen aplikasi Sistem Informasi Cipansor (repo ypcipansor/cipansor) — (1) Dokumen Teknis Aplikasi berkerangka arc42 dengan diagram C4, dan (2) Dokumen Panduan Pengguna / manual book berkerangka Diátaxis per peran dan per tugas — dari kode yang sebenarnya, dengan angka terukur, tingkat verifikasi yang jujur, dan pemindaian data sensitif. Keluaran .docx bersampul logo yayasan atau Markdown untuk docs/. WAJIB gunakan setiap kali pengguna meminta dokumen teknis, dokumentasi sistem/arsitektur, dokumen serah terima, panduan pengguna, buku panduan, manual book, user manual, panduan per peran (guru, TU, bendahara, wali santri, dst.), atau memperbarui dokumen-dokumen itu, untuk aplikasi/sistem informasi/portal Cipansor — juga untuk keperluan hibah, donor, auditor, vendor, atau pelatihan staf, dan bahkan tanpa kata "skill" atau "Cipansor" bila konteksnya jelas aplikasi yayasan ini.
---

# Dokumen Aplikasi Cipansor

Menghasilkan dua jenis dokumen, dari satu sumber Markdown:

| Dokumen | Pembaca | Kerangka | Buka |
|---|---|---|---|
| **Dokumen Teknis Aplikasi** | pengurus, pengelola sistem, pengembang baru, auditor/donor | arc42 + diagram C4 | `references/dokumen-teknis.md`, `assets/template-teknis.md` |
| **Dokumen Panduan Pengguna** | staf, guru, pendidik, wali santri, dst. | Diátaxis + daftar periksa ISO 26514 | `references/panduan-pengguna.md`, `assets/template-panduan.md`, `assets/template-kartu-tugas.md` |

Alasan pemilihan standar, dan yang sengaja tidak dipakai: `references/standar-dan-alasan.md`
(baca hanya bila pengguna bertanya "kenapa begini" atau bila dua cara menyusun saling bersaing).

## Tiga hal yang tidak boleh dilanggar

Ketiganya berasal dari aturan repo Cipansor sendiri (`AGENTS.md`), dan dokumen yang melanggarnya lebih merugikan daripada tanpa dokumen:

1. **Angka dari kode, bukan ingatan.** Semua jumlah (modul, model, peran, halaman, uji) berasal dari `scripts/collect_facts.py`, dan disebut bersama commit + tanggalnya. Angka yang ditulis dari ingatan pasti bergeser.
2. **Katakan seberapa jauh.** Tiap kemampuan diberi status: *di cabang / di `main` / di staging / di produksi* (sumber: `.claude/memory/progress.md`). Halaman yang ada bukan berarti fiturnya jalan. Langkah panduan yang tidak pernah dijalankan wajib bertanda ⚠ (lihat tingkat verifikasi di bawah).
3. **Repo publik sampai rilis; dokumen sering dikirim keluar.** Jangan menulis kredensial, kunci, connection string, nama/ID sumber daya cloud, IP, jalur host, kelemahan produksi yang masih terbuka, detail insiden, atau data pribadi. Selalu jalankan `scripts/scan_sensitive.py`.

## Alur kerja

### 0. Tentukan apa yang diminta

Ambil dari pesan pengguna; tanyakan **satu kali saja** (dan hanya bila benar-benar tidak jelas), dengan `ask_user_input_v0` bila tersedia:

- **Jenis:** teknis / panduan pengguna / keduanya. *Bawaan bila tak disebut: keduanya.*
- **Format:** `.docx` (dicetak, dikirim ke donor/auditor/pengurus) atau Markdown di `docs/` (dokumen hidup di repo). *Bawaan: `.docx`* — kecuali pengguna menyebut repo/`docs/`/GitHub.
- **Untuk panduan pengguna: peran mana didahulukan.** Jangan menulis semua keluarga peran dalam satu putaran (belasan keluarga; hasilnya tak teruji dan tak terbaca). Terbitkan Bagian Umum + satu-dua buklet, lalu tawarkan sisanya.
- **Baru atau pembaruan?** Bila pengguna menyerahkan dokumen lama (.docx/.md) atau `facts.json` lama → **mode pembaruan** (langkah 7).

### 1. Ambil kodenya

```bash
git clone --depth 1 https://github.com/ypcipansor/cipansor.git /home/claude/cipansor-src
```

- `web_fetch` ke github.com **ditolak** (robots) — pakai `git clone`, bukan `web_fetch`.
- Jika clone gagal (repo sudah privat setelah rilis, atau jaringan dibatasi): minta pengguna mengunggah zip repo, atau menaruh folder repo di sesi. Katakan apa adanya; jangan menulis dokumen dari README saja dan menyebutnya lengkap.
- Bila repo sudah tersedia di sesi (mis. dalam Claude Code), pakai itu.

### 2. Ukur, lalu baca

```bash
python scripts/collect_facts.py /path/ke/cipansor --out /home/claude/fakta
```

Hasilnya `facts.md` (untuk dibaca dan dikutip) dan `facts.json`. Kemudian baca sesuai jenis dokumen (daftar berkas di referensi masing-masing). Selalu baca:
`docs/ARCHITECTURE.md`, `.claude/memory/progress.md`, `.claude/memory/known-issues.md`, `.claude/memory/decisions/*.md`, dan — bila ada — skill repo `panduan-peran`, `screenshot-roles`, `stack`.

Repo itu sendiri sudah memuat banyak dokumentasi. **Rangkum dan tautkan; jangan menyalin** — salinan pasti bergeser dari aslinya.

### 3. Susun

Salin templat yang sesuai ke folder kerja, isi setiap `[ISI: …]` dari sumbernya, tulis dalam Markdown.

- **Dokumen teknis:** ikuti pemetaan bab → sumber di `references/dokumen-teknis.md`. Alur runtime (bab 6) **dibaca dari kode**, bukan dikira-kira. Jangan mencatat puluhan modul satu per satu di bab utama; kelompokkan menurut ranah, katalog lengkap masuk lampiran.
- **Panduan pengguna:** putuskan **tingkat verifikasi** (T1/T2/T3) *sebelum* menulis satu langkah pun — aturannya di `references/panduan-pengguna.md`. Ringkas: T1 = langkah dijalankan di aplikasi berjalan dengan akun demo; T2 = dirunut dari kode, **tiap kartu bertanda ⚠**; T3 = tanpa langkah, hanya kerangka + pertanyaan. Jalur menu dicetak dari `role-menus.ts`, tidak disalin dari dokumen lain. Di sandbox Claude.ai aplikasi **tidak bisa dijalankan** (unduhan mesin Prisma dari `binaries.prisma.sh` diblokir jaringan) — kecuali pengguna menambahkan domain itu ke domain yang diizinkan; tawarkan itu sekali, lalu turun ke T2 dan **katakan terus terang**. Resep T2 dan jebakannya ada di `references/panduan-pengguna.md`.
- **Diagram:** blok ```` ```mermaid ```` dengan `%% caption: …` di baris pertama. Diagram alur digambar dari kode yang sudah dibaca.
- **Istilah:** *santri* / *wali santri* di seluruh dokumen portal (murid/peserta didik hanya untuk format negara: rapor, SPMB, Dapodik/EMIS); ejaan yayasan (Tahfidz, Tahsin, Takhosus, Kitab Kuning); istilah pesantren tidak diterjemahkan; nama tombol dan menu persis seperti layar.

### 4. Periksa sebelum membangun

```bash
python scripts/scan_sensitive.py naskah.md      # wajib; kode keluar 1 = ada temuan, perbaiki dulu
```

Lalu baca sendiri bagian **Risiko dan Utang Teknis** (pemindai tidak bisa menilai kelemahan yang masih terbuka). Bila ragu apakah suatu butir masih terbuka: **jangan tulis, dan laporkan** butir mana yang ditahan dan mengapa.

### 5. Bangun

```bash
# .docx bersampul logo, daftar isi terisi, diagram menjadi gambar, header/footer bernomor halaman
python scripts/build_docs.py naskah.md --out keluaran --format docx \
  --title "Dokumen Teknis Aplikasi" --subtitle "Sistem Informasi Cipansor" \
  --version 0.1 --status Draf --commit <hash> \
  --logo /path/ke/cipansor/apps/web/public/logo.png \
  --resource-path /folder/berisi/screens

# Markdown untuk docs/ di repo (blok mermaid dibiarkan; GitHub merendernya sendiri)
python scripts/build_docs.py naskah.md --out keluaran --format md --title "…"
```

- Nama dokumen tidak perlu diulang di Markdown — sampul, header, dan judul berkas diberikan lewat opsi.
- Untuk `.docx`, `build_docs.py` butuh `pandoc`, `python-docx`, dan (untuk diagram) `mmdc` + Chromium; daftar isi diisi lewat LibreOffice. Bila salah satunya tak ada, skrip memberi peringatan dan tetap menerbitkan dokumen — **baca peringatannya dan laporkan** bila ada yang gagal.
- `build_docs.py` memperingatkan bila `[ISI: …]`, `TODO`, atau `TBD` masih tersisa. Dokumen seperti itu adalah **Draf**, bukan final.

### 6. Lihat hasilnya

Struktur XML yang valid belum berarti tampilan yang benar. Render dan lihat halamannya:

```bash
python /mnt/skills/public/docx/scripts/office/soffice.py --headless --convert-to pdf keluaran/dokumen.docx
pdftoppm -jpeg -r 70 keluaran/dokumen.pdf keluaran/pg
```

Periksa: sampul (logo, judul, tabel metadata), daftar isi **terisi** dengan nomor halaman, diagram terbaca dan tidak terpotong, tabel tidak melebar keluar halaman, judul bab tidak menggantung di dasar halaman. Perbaiki di Markdown lalu bangun ulang — jangan menyunting `.docx` hasil.

### 7. Mode pembaruan (dokumen sudah ada)

```bash
python scripts/collect_facts.py /path/ke/cipansor --out fakta-baru --compare fakta-lama/facts.json
```

`perubahan.md` mencantumkan angka yang bergeser dan modul/keputusan/peran yang baru atau hilang. Tinjau ulang **hanya** bagian dokumen yang menyebut hal-hal itu; naikkan versi, isi Riwayat Revisi (commit lama → baru), dan bangun ulang. Simpan `facts.json` di samping dokumen supaya pembaruan berikutnya punya pembanding.

### 8. Serahkan

Taruh keluaran di `/mnt/user-data/outputs/` (dokumen + `facts.md`/`facts.json`, dan `screens/` bila ada), panggil `present_files`. Lalu, dalam pesan singkat, **sebutkan apa adanya**:

- basis kode (commit + tanggal) dan format yang dibuat;
- **tingkat verifikasi** tiap bagian panduan (T1/T2/T3) — bila ada yang T2, katakan bahwa langkahnya belum dicoba di aplikasi berjalan dan siapa yang sebaiknya mencobanya;
- butir yang **ditahan** karena sensitif, atau `[ISI]` yang tersisa dan pertanyaan yang harus dijawab pengguna;
- apa yang belum dikerjakan (mis. buklet peran lain) dan tawaran langkah berikutnya.

Jangan menutup dengan ringkasan isi dokumen — pengguna bisa membukanya.

## Berkas dalam skill ini

| Berkas | Fungsi |
|---|---|
| `scripts/collect_facts.py` | Mengukur repo → `facts.json`/`facts.md`; `--compare` untuk pembaruan. Hanya pustaka standar Python; hanya membaca **nama** variabel lingkungan, tidak nilainya |
| `scripts/scan_sensitive.py` | Memindai md/txt/html/docx dari pola sensitif (kunci, JWT, connection string, host cloud, IP, jalur host, kata sandi demo, NIK/telepon) |
| `scripts/build_docs.py` | Markdown → `.docx` (sampul, TOC, tabel, diagram, header/footer) dan/atau `.md` |
| `scripts/update_toc.py` | Mengisi daftar isi `.docx` lewat LibreOffice (dipanggil `build_docs.py`) |
| `references/standar-dan-alasan.md` | Riset standar, alasan, yang tidak dipakai |
| `references/dokumen-teknis.md` | arc42 → sumber di repo, aturan kepekaan, kedalaman, daftar periksa |
| `references/panduan-pengguna.md` | Bentuk terbitan, T1/T2/T3, kartu tugas, tangkapan layar, gaya bahasa, daftar periksa |
| `assets/template-*.md` | Kerangka siap isi |
