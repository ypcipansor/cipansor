# Standar yang dipakai, dan alasannya

Riset dilakukan 2026-09-28 atas pertanyaan: dokumentasi aplikasi seperti apa yang
dianggap praktik terbaik untuk (a) dokumen teknis dan (b) panduan pengguna, pada
sistem seukuran Cipansor — monorepo dengan puluhan modul, dikembangkan tim kecil,
dipakai belasan keluarga peran, repo publik sampai rilis.

Baca berkas ini bila pengguna bertanya "kenapa formatnya begini", atau bila harus
memilih antara dua cara menyusun. Untuk *cara mengerjakan*, buka
`dokumen-teknis.md` dan `panduan-pengguna.md`.

## Ringkasan pilihan

| Kebutuhan | Dipakai | Bukan format, melainkan | Kenapa cocok untuk Cipansor |
|---|---|---|---|
| Kerangka dokumen teknis | **arc42** (12 bab) | kerangka bab | Gratis, ringan, dipakai luas, tiap bab menjawab satu pertanyaan pembaca. Tim kecil bisa mengisi bab yang perlu dan menulis "tidak berlaku" pada yang tidak. Sudah ada tempat untuk *keputusan* (bab 9) dan *risiko & utang teknis* (bab 11), dua hal yang paling sering hilang. |
| Menggambar arsitektur | **Model C4** (Context → Container → Component) | cara menggambar | Tiga tingkat zoom yang bisa dibaca pengurus (tingkat 1) sampai pengembang baru (tingkat 3). Tingkat 4 (kode) tidak digambar: kodenya sendiri sumbernya. |
| Menyimpan alasan keputusan | **ADR** (catatan keputusan arsitektur) | isi bab 9 | Repo sudah melakukannya di `.claude/memory/decisions/`. Dokumen *merangkum dan menautkan*, tidak menulis ulang alasannya. |
| Pemeriksa kelengkapan dokumen teknis | **IEEE 1016 / ISO/IEC/IEEE 42010** (deskripsi rancangan, sudut pandang) | daftar periksa | Bab 5–8 arc42 sudah mencakup sudut pandang yang diminta: struktur, perilaku saat berjalan, penempatan, konsep lintas-bidang. Dipakai untuk memastikan tak ada sudut pandang yang terlewat, bukan sebagai format. |
| Menata panduan pengguna | **Diátaxis** (tutorial · panduan tugas · rujukan · penjelasan) | pemisah jenis isi | Orang membuka panduan dengan empat niat berbeda: belajar dari nol, menyelesaikan satu tugas, mencari fakta, memahami alasan. Mencampurnya membuat panduan tebal dan sulit dipakai. |
| Isi & mutu panduan pengguna | **ISO/IEC/IEEE 26514** (rancangan & pengembangan informasi untuk pengguna) | daftar periksa | Meminta dokumentasi berangkat dari analisis pengguna dan tugasnya (bukan dari daftar menu), memuat unsur lazim (pendahuluan, prosedur, penanganan masalah, glosarium), memakai istilah yang konsisten, dan diuji pada pembaca sungguhan. |
| Cara mengelola berkas | **Docs-as-code** | praktik kerja | Dokumen dekat dengan kode, ditulis dalam Markdown, angka dihitung dari kode. Sesuai dengan cara repo ini bekerja dan menekan dokumen basi. |

## Cara tiap standar diterapkan

### arc42 → dokumen teknis
Dua belas bab: (1) Pendahuluan & tujuan, (2) Batasan, (3) Konteks & lingkup,
(4) Strategi solusi, (5) Tampak blok bangunan, (6) Tampak runtime, (7) Tampak
penempatan, (8) Konsep lintas-bidang, (9) Keputusan arsitektur, (10) Persyaratan
kualitas, (11) Risiko & utang teknis, (12) Glosarium. Pemetaan ke sumber di repo
ada di `dokumen-teknis.md`. Sumber resmi: arc42.org.

### C4 → diagram
- **Tingkat 1, Konteks:** Cipansor sebagai satu kotak; di sekelilingnya orang
  (peran) dan sistem luar (surel, WhatsApp, Turnstile, penyedia model bahasa).
  Untuk pengurus yayasan dan donor.
- **Tingkat 2, Kontainer:** hal yang berjalan sendiri — web, API, basis data,
  Redis, penjadwal. Untuk pengelola sistem.
- **Tingkat 3, Komponen:** isi satu kontainer — lapisan modul API
  (routes → controller → service → schema) dan pengelompokan modul menurut
  ranah. Untuk pengembang.
- Tulis diagram sebagai **Mermaid** dalam Markdown: bisa disunting, dibanding
  per baris di git, dan dirender GitHub. `build_docs.py` mengubahnya menjadi
  gambar untuk `.docx`. Sumber resmi: c4model.com.

### Diátaxis → panduan pengguna
| Jenis | Pertanyaan pembaca | Wujud di panduan Cipansor |
|---|---|---|
| Tutorial | "Saya baru, ajari saya" | Bagian *Mulai*: masuk, mengenal dasbor & menu, ganti kata sandi, keluar |
| Panduan tugas | "Bagaimana saya melakukan X?" | *Kartu tugas* per peran (Tujuan → Jalur menu → Langkah → Hasil) |
| Rujukan | "Apa arti/isi X?" | Glosarium, arti status, daftar peran, pesan galat |
| Penjelasan | "Mengapa begitu?" | Konsep singkat: persetujuan berjenjang, hak akses per peran, privasi data santri |

Aturannya: **satu halaman, satu jenis.** Kartu tugas tidak berisi ceramah konsep;
konsep ditautkan. Sumber resmi: diataxis.fr.

### ISO/IEC/IEEE 26514 → mutu panduan
Dipakai sebagai daftar periksa mutu, bukan format:
- disusun dari **tugas pengguna**, bukan dari menu (cf. `panduan-peran` di repo);
- ada pendahuluan (siapa pembaca, cara memakai panduan), prosedur, penanganan
  masalah, glosarium;
- **istilah konsisten** dengan layar (nama tombol persis; *santri*, bukan *murid*,
  di panduan portal);
- prosedur **dicoba** pada aplikasi/pembaca sungguhan sebelum dinyatakan selesai;
- ada riwayat revisi dan basis versi aplikasi.

## Yang sengaja tidak dipakai

- **SRS penuh (IEEE 830 / ISO/IEC/IEEE 29148).** Sistem dibangun bertahap;
  kebutuhan hidup di `roadmap.md` dan `decisions/`. Dokumen teknis cukup
  memuat *tujuan dan kebutuhan kualitas utama* (arc42 bab 1 dan 10). SRS penuh
  akan basi sebelum selesai dicetak.
- **Diagram UML lengkap tiap kelas.** Ratusan model dan puluhan modul: hasilnya tak
  terbaca dan berubah tiap PR (angka pastinya diukur `collect_facts.py`, bukan ditulis di sini). Cukup ERD tingkat ranah (kelompok model), dengan
  skema Prisma sebagai rujukan tunggal.
- **Salinan daftar endpoint.** Sumbernya Swagger dan kode; salinan pasti basi.
  Dokumen menautkan ke sana dan menyebut *cakupannya* (berapa modul
  beranotasi), apa adanya.
- **Salinan pohon menu.** Menu berubah tiap PR menu. Panduan menulis jalur menu
  per tugas, dicetak dari kode pada saat penulisan.
- **Panduan satu buku raksasa untuk semua peran.** Ada belasan keluarga peran
  dengan tugas berbeda. Diterbitkan sebagai **bagian umum + buklet per keluarga
  peran**, supaya guru tidak membaca bab bendahara.

## Prinsip yang menyatukan semuanya

1. **Angka dari kode, bukan ingatan** — `collect_facts.py`; sebut commit dan
   tanggalnya. Repo ini sendiri melarang angka yang ditulis dari ingatan.
2. **Katakan seberapa jauh:** tiap kemampuan ditandai *di cabang / di `main` /
   di staging / di produksi* (aturan emas 11 di `AGENTS.md`). "Halamannya ada"
   bukan "fiturnya jalan" (pelajaran `breadth-over-depth`).
3. **Jujur soal utang teknis**, tetapi jangan membuka apa yang bisa dipakai
   penyerang. Repo publik sampai rilis; dokumen sering dikirim ke donor,
   auditor, vendor.
4. **Satu sumber, banyak keluaran:** tulis Markdown, turunkan `.docx`/`.md`.
