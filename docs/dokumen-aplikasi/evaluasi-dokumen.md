# Evaluasi Dokumen Aplikasi Cipansor

Tanggal: 29 September 2026 · Basis kode: commit `aefc719` · Penyusun: Agen OpenHands

Dokumen ini merekam **apa yang dihasilkan**, **standar yang dipakai sebagai
pembanding**, **hasil evaluasi**, dan **perbaikan yang sudah diterapkan**.

# 1. Yang dihasilkan

| Berkas | Isi | Ukuran |
|---|---|---|
| `dokumen-teknis-cipansor.docx` / `.pdf` | Dokumen teknis aplikasi (kerangka arc42 + diagram C4/Mermaid) | 67 halaman, 10 diagram |
| `panduan-pengguna-umum.docx` / `.pdf` | Panduan pengguna — bagian umum (Diátaxis) | 14 halaman |
| `panduan-pengguna-guru.docx` / `.pdf` | Panduan pengguna — buklet peran Guru | 9 halaman |
| `*.md` | Sumber Markdown, dapat dibangun ulang | — |
| `diagrams/` | Diagram Mermaid (.mmd) dan gambar (.png) | 10 diagram |

Semua berkas dibangun dengan `scripts/build_docs.py` (Markdown → docx; pandoc +
python-docx + mermaid-cli), daftar isi diisi dengan `scripts/update_toc.py`
(LibreOffice), dan diperiksa dengan `scripts/scan_sensitive.py`.

# 2. Standar pembanding (hasil penelusuran)

| Bidang | Standar / praktik terbaik | Sumber |
|---|---|---|
| Dokumen arsitektur | **arc42**: 12 bab (Pendahuluan, Batasan, Konteks, Strategi Solusi, Blok Bangunan, Runtime, Penempatan, Konsep Lintas-Bidang, Keputusan, Mutu, Risiko & Utang, Glosarium) | arc42.org; docs.arc42.org |
| Diagram | **Model C4**: Konteks sistem, Kontainer, Komponen, ditambah diagram dinamis/penempatan | c4model.com; didukung arc42 §5–7 |
| Keputusan | **ADR** (Architecture Decision Record) — konteks, keputusan, konsekuensi | arc42 §9; `adr.github.io` |
| Mutu | Skenario mutu gaya **ISO/IEC 25010** dengan tolok ukur | arc42 §10 |
| Utang teknis | Daftar utang dengan gejala, dampak, dan arah penanganan | arc42 §11 |
| Panduan pengguna | **Diátaxis**: tutorial, panduan tugas, penjelasan, rujukan — dipisah tegas | diataxis.fr |
| Panduan pengguna (proses) | **ISO/IEC 26514** — struktur, isi, dan mutu dokumentasi pengguna | ISO/IEC 26514 |
| Pemeliharaan | **Docs-as-Code**: dokumen hidup di repositori, melalui PR, dibangun di CI | Wonderment, Scand, Fern |
| Penandaan data | Klasifikasi dokumen, versi, pemilik, riwayat revisi | Docs-as-Code + ISO 26514 |

Ringkasan praktik kuncinya: satu dokumen = satu jenis pembaca; angka harus
terlacak ke sumbernya; keputusan dicatat terpisah dari deskripsi; dokumen
diperlakukan sebagai kode (di repositori, oleh PR, dibangun otomatis); dan
dokumen harus tetap akurat dengan cara ditinjau ulang berkala, bukan ditulis
sekali.

# 3. Evaluasi terhadap standar

| Aspek | Standar | Keadaan hasil | Nilai |
|---|---|---|---|
| Kerangka dokumen teknis | arc42 12 bab | Semua 12 bab ada dan berjudul sama | Sesuai |
| Tampak blok bangunan | arc42 §5 + C4 tingkat 1–2 | Diagram Kontainer dan Lapisan modul API | Sesuai |
| Tampak runtime | arc42 §6, skenario bernomor | 6 skenario (masuk/2FA, permintaan API, pengesahan yayasan, persuratan/TTE, SPMB, penjadwalan) | Sesuai |
| Penempatan | arc42 §7 | Diagram penempatan Azure + tabel env | Sesuai |
| Keputusan | ADR | 23 baris keputusan bertaut berkas aslinya | Sesuai |
| Mutu | ISO 25010 | Tabel skenario + bukti + status | Sebagian (status "terbukti sebagian" wajar untuk sistem berjalan) |
| Risiko/utang | arc42 §11 | Daftar 10 kategori dengan dampak & arah | Sesuai |
| Glosarium | arc42 §12 | 20 istilah bilingual | Sesuai |
| Panduan pengguna | Diátaxis | Umum = tutorial + penjelasan + rujukan; Guru = panduan tugas | Sesuai |
| Keterlacakan angka | Docs-as-Code | Setiap angka menyebut "commit `aefc719`" | Sesuai |
| Versi & status | ISO 26514 | Riwayat revisi + status (produksi/staging/main/cabang) di tiap dokumen | Sebagian (tingkat verifikasi baru T2) |
| Keamanan dokumen | Klasifikasi | `scan_sensitive.py` bersih; hal sensitif hanya disebut sebagai kategori | Sesuai |
| Pemeliharaan | Docs-as-Code | Sumber Markdown + skrip pembangun; **belum masuk CI** | Belum sesuai |

# 4. Perbaikan yang sudah diterapkan

1. **Sampul dan daftar isi di depan** — sebelumnya tersisip di akhir dokumen;
   kini dipindah ke awal badan (`build_docs.py`).
2. **Daftar isi berisi nomor halaman** — diisi lewat LibreOffice
   (`update_toc.py`), bukan sekadar bidang kosong.
3. **Diagram ERD diperbaiki** — entitas `CLASS` bertabrakan dengan kata kunci
   Mermaid; diganti `KELAS`.
4. **Arc42 §1.4 "Cara membaca dokumen" ditambahkan** — konvensi angka, status,
   dan penanganan hal sensitif.
5. **Arc42 §11 diperluas menjadi daftar utang teknis** dengan gejala, dampak,
   dan arah penanganan, serta ajakan menautkan tiket.
6. **Diátaxis pada panduan pengguna** — ditambahkan **tutorial 5 menit** (§2.1)
   dan **peta tugas menurut peran** (§4.5) sebagai jembatan tutorial → tugas →
   rujukan.
7. **Pemisahan peran** — buklet Guru berdiri sendiri; buklet peran lain
   direncanakan dengan pola sama.
8. **Perbaikan pada skrip skill** (ditemukan saat menjalankan ulang di
   lingkungan ini, commit `aefc719`):
   - `build_docs.py` memanggil mermaid-cli dengan bendera `-w`; versi terpasang
     (12.x) tidak mengenal `-w` dan **seluruh diagram gagal dirender**
     ("unknown option '-w'"). Diganti `--size`, dan diuji ulang: diagram dirender.
   - Keterangan diagram dari `%% caption:` tidak pernah muncul di `.docx` karena
     pandoc dengan pembaca `commonmark_x` membuang keterangan gambar. Kini
     keterangan ditulis eksplisit setelah gambar.
   - Angka diukur ulang dengan `collect_facts.py` pada commit `aefc719`
     (worktree bersih) dan **cocok persis** dengan yang tertulis di dokumen
     (93 modul, 289 model, 53 kode peran, 435 halaman).

# 5. Yang belum dikerjakan (usulan lanjutan)

| Usulan | Alasan | Prioritas |
|---|---|---|
| Buklet peran lainnya (sekolah, pesantren, administrasi, kepemimpinan, tata kelola, wali, santri) | Menutup seluruh pembaca | Tinggi |
| Naikkan tingkat verifikasi ke T1 | T2 hanya dari kode; perlu uji pada aplikasi berjalan | Tinggi |
| Alur CI pembangun dokumen | Mencegah dokumen basi (docs-as-code) | Sedang |
| `dapodik`/`emis` dan lampiran model data lengkap | Rujukan teknis lebih lengkap | Sedang |
| Diagram C4 tingkat 3 (komponen) untuk modul inti | Kedalaman arsitektur | Rendah |
| Tangkapan layar nyata pada kartu tugas | Membantu pembaca non-teknis | Sedang |
| Pemeriksa tautan mati dan konsistensi istilah di CI | Mutu berkelanjutan | Sedang |

# 6. Kesimpulan

Dokumen teknis mengikuti **arc42 + C4** dengan skenario runtime yang dapat
ditelusuri dan daftar keputusan tertaut; panduan pengguna mengikuti **Diátaxis**
dengan pemisahan tegas antara tutorial, tugas, dan rujukan. Keduanya menerapkan
**docs-as-code** (sumber Markdown, dibangun skrip, angka terlacak ke commit) dan
menjaga data sensitif di luar dokumen. Celah yang tersisa bersifat kelengkapan
(buklet peran lain, tingkat verifikasi, integrasi CI), bukan penyimpangan dari
standar.
