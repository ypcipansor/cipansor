# Evaluasi dan perbaikan skill

Catatan perubahan skill, terbaru di atas. Audit lengkap atas hasil pemakaiannya ada di
`docs/EVALUASI-DOKUMEN.md`; katalog kesalahan dan kode pemeriksanya di
`references/kesalahan-yang-sudah-terjadi.md`.

## 29 September 2026 (riset standar) — periksa ulang pilihan standar terhadap praktik terbaik

Pengguna meminta evaluasi ulang: "sesuai standar best practice seperti apa?" Riset web
diperbarui 2026-09-29 dan **pilihan kerangka lama tetap benar** (arc42 + C4 + Diátaxis +
ISO 26514 + ADR + docs-as-code). Yang berubah, dan yang ditambahkan ke
`references/standar-dan-alasan.md`:

| Temuan | Perbaikan |
|---|---|
| **ISO/IEC/IEEE 26514 sudah edisi ketiga (2022)**, bukan edisi 2010 yang lazim dikutip; edisi 2022 menambah subpasal **API dan chatbot** | Sebutan disunting ke **26514:2022** di `standar-dan-alasan.md` dan `panduan-pengguna.md`; ditambah catatan keluarga 2651x (26511–26516, 26531) dan relevansi subpasal API/chatbot (`docs/MOBILE_API.md`, modul `chatbot`) |
| **Minimalisme (Carroll) dan penulisan berbasis topik** — praktik inti manual yang belum disebut eksplisit | Bagian baru di `standar-dan-alasan.md` dan disiplin singkat di `panduan-pengguna.md` → "Gaya bahasa": mulai dari prosedur, satu topik satu tujuan, kesalahan bagian dari topik |
| **Dokumentasi ramping (agile/lean)** — "cukup, tidak berlebih; perbarui hanya bila perlu" | Prinsip ke-5 di `standar-dan-alasan.md`; menegaskan aturan repo "rangkum, jangan salin" |
| **ADR: satu keputusan per catatan; yang tergantikan tidak disunting** (arc42 tip 9-5/9-6; MADR 4.0) | Dicatat di baris ADR `standar-dan-alasan.md` |
| **arc42↔C4 saling melengkapi** dengan pemetaan bab eksplisit | Dicatat di baris C4 |
| Tidak ada tabel "sumber yang dikutip" | Bagian **Sumber yang dikutip** ditambahkan (arc42, c4model, MADR, 42010, diataxis, 26514, Carroll, agilemodeling) |

Tidak diubah: kerangka bab, kontrak bab, pemeriksa. Perubahan ini hanya memperkuat
*alasan* dan *cara menulis*, bukan struktur. Ketiga dokumen di `docs/`
masih lolos `check_docs.py` 0 ERROR tanpa perubahan isi.

## 29 September 2026 (audit) — dari "aturan prosa" ke "aturan yang diperiksa mesin"

Percobaan pertama (OpenHands/DeepSeek atas skill rancangan Sonnet) menghasilkan dokumen yang kerangkanya benar tetapi
terbit dengan semua tabel rusak, alamat rute dan entitas ERD karangan, angka pekerjaan terjadwal yang salah, kebocoran di
bab risiko dan manual, serta langkah manual yang keliru — dan menilai dirinya "Sesuai". Akar dan perbaikannya:

| Akar | Perbaikan |
|---|---|
| Tak ada yang mencocokkan kalimat dengan kode | `scripts/check_docs.py` (rute, angka, ERD, label layar, pesan, kartu tugas, tabel, id diagram, bab 9/10/11, jejak sumber) |
| Hasil biner tak diperiksa; lingkungan tak diperiksa | `build_docs.py` `verify_docx`/`verify_pdf`, GAGAL bila diagram tak terender, pengisian daftar isi yang merusak dibuang, `--pdf`; `scripts/check_env.py` (termasuk LibreOffice **Writer** dan modul `uno`) |
| Skrip ukur menyesatkan | `collect_facts.py`: berkas job vs berkas yang dijadwalkan, empat berkas vs lima bagian, indeks rute, ringkasan keputusan utuh |
| Templat membawa bug dan sistem yang sudah dihapus | `assets/template-*.md` ditulis ulang (C4 berlabel, kolom ukuran, label layar, ketersediaan satu kalimat) |
| Skill khusus lingkungan chat | `SKILL.md` ditulis ulang: gerbang per langkah, perintah yang jalan di repo mana pun, uji kemampuan alih-alih asumsi |
| Kesalahan tak tercatat | `references/kesalahan-yang-sudah-terjadi.md` |

Diverifikasi terhadap tiga dokumen lama (`git show HEAD~:…`): `check_docs.py` mencetak 10 ERROR pada dokumen teknis
(`POST /admissions/public/register`, "14 pekerjaan terjadwal", tiga entitas ERD fiktif, satu berkas keputusan ganda, bab 10
tanpa ukuran, tiga diagram C4 tak berlabel), 7 pada buklet guru (`\``, nomor PR, label yang tak ada), dan 5 pada panduan
umum (nama enum); `verify_docx` menolak `.docx` lama yang dikomit. Peringatan (WARN) menandai sisanya: NIK dan angka akses
di bab 11, 66 vs 24 modul, "produksi menyusul". Setelah perbaikan dokumen: 0 ERROR pada ketiganya.

Batas pemeriksa yang diketahui: kecocokan label memakai pencarian teks utuh di `apps/web/src`, jadi label yang kebetulan ada
di layar lain lolos (mis. "Keluar" ada di berkas lain, meski menu avatar berbunyi "Logout"), dan kekeliruan makna (ubah kata
sandi ditulis di Settings, bukan Profile → Keamanan) tak tertangkap. `--trace` mencetak berkas:baris agar manusia memastikannya;
resep T2 menyuruh mencari layar yang sebenarnya dengan `grep` judul kartu. Pemeriksa tidak menilai mutu tulisan atau kelengkapan tugas.

## 29 September 2026 (percobaan pertama, OpenHands)

Dua cacat pada `build_docs.py` diperbaiki:

1. `mmdc` dipanggil dengan `-w` (tidak dikenal mermaid-cli 12.x) sehingga semua diagram gagal; diganti `--size`.
2. Keterangan diagram dari `%% caption:` tak pernah tampil karena pembaca `commonmark_x` membuang alt gambar; keterangan
   kini ditulis eksplisit. (Kemudian ditemukan keterangan itu satu paragraf dengan gambar dan terbelah di sekitar gambar
   tinggi; kini paragraf tersendiri.)

Catatan lingkungan: `LD_LIBRARY_PATH` yang mengarah ke `/usr/lib/libreoffice/program` membuat `soffice` gagal start.
