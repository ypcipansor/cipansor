# Panduan Pengguna — cara menyusun

Kerangka: Diátaxis (tutorial · panduan tugas · rujukan · penjelasan) dengan
daftar periksa mutu ISO/IEC/IEEE 26514. Alasannya di `standar-dan-alasan.md`.
Templatnya: `assets/template-panduan.md` (bagian umum + buklet peran) dan
`assets/template-kartu-tugas.md`.

Repo sudah punya aturan penulisan panduan di skill `panduan-peran` (bagian
*Menulis panduan pengguna untuk staf*). Skill ini **memakai aturan itu**, tidak
menggantikannya. Bila `.claude/skills/panduan-peran/SKILL.md` ada di repo yang
di-clone, baca dulu.

## Bentuk terbitan

Jangan menulis satu buku raksasa untuk semua peran. Terbitkan sebagai:

1. **Panduan Pengguna — Bagian Umum** (semua peran): tentang panduan, mulai
   memakai aplikasi, konsep dasar, glosarium, bantuan.
2. **Buklet per keluarga peran**, masing-masing berdiri sendiri: Guru, Wali
   Kelas & tugas tambahan, Tata Usaha, Bendahara, Admin Unit, Kepala Sekolah,
   Pendidik Pesantren (musyrif, muhafidz, ustadz), Organ Yayasan, Wali Santri,
   Santri/Siswa, Alumni, Komite, Super Admin.

Keluarga peran yang berlaku *hari ini* dibaca dari kode (skill `panduan-peran`
dan `role-menus.ts --families`), bukan dari daftar di atas — daftar di atas
hanya contoh. Bila pengguna belum menyebut peran, **tanyakan satu kali** peran
mana yang didahulukan; jangan mencoba menulis semuanya dalam satu putaran.

## Tiga tingkat verifikasi — putuskan sebelum menulis satu langkah pun

Panduan yang berisi langkah karangan lebih buruk daripada tanpa panduan. Repo
ini mencatat pelajarannya: *"dibangun lebih lebar daripada yang dipakai"* dan
*"halaman ada ≠ fitur jalan"* (`breadth-over-depth`), dan aturan emas 11:
*katakan "selesai" hanya bila seseorang bisa mengkliknya, dan katakan seberapa
jauh*.

| Tingkat | Syarat | Yang boleh ditulis | Penanda di dokumen |
|---|---|---|---|
| **T1 Terverifikasi** | Tumpukan lokal atau staging **berjalan**, langkah dijalankan dengan akun demo peran itu, tangkapan layar asli | Langkah lengkap + gambar | tidak ada penanda |
| **T2 Dari kode** | Tidak bisa menjalankan aplikasi; langkah dirunut dari `navigation.ts`, halaman, komponen, dan rute API | Kartu tugas dengan jalur menu (dicetak dari kode) dan langkah yang *masuk akal dari kode* | `⚠ Belum dicoba di aplikasi berjalan` pada **setiap** kartu, dan dinyatakan di Riwayat Revisi |
| **T3 Tidak ada akses** | Hanya deskripsi dari pengguna | Kerangka + daftar pertanyaan untuk pengguna; **tanpa langkah** | `[ISI: …]` — dokumen belum boleh disebut selesai |

Cara mencapai T1 — bila repo di-clone dan ada waktu:
1. Skill `stack` di repo (`.claude/skills/stack/SKILL.md`): PostgreSQL, `db:push`,
   `db:seed` dengan `E2E_FIXED_2FA=1`, API :3001, web :3000.
2. `apps/web/scripts/role-menus.ts` untuk menu tiap peran.
3. `apps/web/scripts/screenshot-roles.ts` untuk tangkapan layar menu tiap
   peran; untuk layar **tugas** tertentu, tulis skrip Playwright pendek yang
   masuk sebagai akun demo, membuka halaman, mengisi formulir dengan data
   contoh, dan mengambil gambar di tiap tahap.
4. Bila tumpukan tak bisa dinyalakan: **turun ke T2 dan katakan terus terang**,
   jangan berpura-pura T1.

**Batasan yang sudah terbukti di sandbox Claude.ai (diuji 2026-09-28).**
- `pnpm install --frozen-lockfile --ignore-scripts --filter @cipansor/shared... --filter web... --filter api...`
  selesai ±22 detik; `pnpm --filter @cipansor/shared build` jalan; PostgreSQL 16 bisa dipasang
  (`apt-get update` dulu, baru `apt-get install -y postgresql-16`).
- **`prisma generate` dan `prisma db push` GAGAL**: mesin Prisma diunduh dari `binaries.prisma.sh`,
  yang **tidak ada di daftar domain yang diizinkan** (`403 host_not_allowed`), jadi skema tak bisa
  dibuat, API tak bisa jalan, dan T1 mustahil. Jangan menghabiskan waktu mencoba jalan memutar.
  Kalau pengguna ingin T1, katakan: *"Tambahkan `binaries.prisma.sh` ke domain yang diizinkan pada
  pengaturan jaringan sesi/akun, lalu minta saya mengulang"* — keputusan itu milik pengguna, jangan
  ditebak menunya.
- `role-menus.ts` **tetap bisa dijalankan** (tidak butuh basis data) — jadi jalur menu selalu bisa dicetak
  dari kode pada T2:
  `cd apps/web && ../api/node_modules/.bin/tsx scripts/role-menus.ts SMPIT_GURU`.

**Tidak ada tingkat "kira-kira".** Bila sebuah langkah tidak bisa dipastikan
dari kode, tulis "[ISI: konfirmasi langkah ini — …]" dan laporkan.

## Resep T2 — merunut langkah dari kode

Untuk tiap tugas, baca berurutan:

1. **Menu** — `role-menus.ts` untuk peran itu (jalur persis, dan apakah grupnya bersyarat,
   mis. *Wali Kelas — hanya bagi yang menjalankan tugas itu*). Bila peran lain (guru mapel) tidak
   melihat butir itu, cari jalur lain: biasanya tombol di halaman induk (mis. **Isi Absensi Harian**
   di halaman Kehadiran). Tulis **kedua** jalur.
2. **Halaman** — `apps/web/src/app/<rute>/page.tsx`: judul, nama tombol, label isian, `placeholder`,
   teks `toast`, teks `Alert`, ke mana `router.push` setelah simpan.
3. **Hook data** — `apps/web/src/hooks/use-*.ts`: label status, pesan hasil (mis. `describeAttendanceSave`).
4. **Aturan siapa** — `authorize(...)` di `*.routes.ts` dan penjaga di service; keputusan di `decisions/`.

**Perangkap T2 (semuanya sudah terjadi pada uji skill ini):**

- **Keadaan awal salah dibaca.** Menulis "bila hanya punya satu kelas, kelas itu terpilih" padahal kode
  memilih kelas *pertama* apa pun jumlahnya. Untuk tiap isian, baca **nilai bawaan, pra-pilihan, dan
  kondisi `disabled`** dari kode, jangan menyimpulkan dari label.
- **Satu jalur menu untuk semua peran.** Guru mapel dan wali kelas punya jalur berbeda ke halaman yang sama.
- **Pesan yang dikarang.** Salin teks pesan dari kode (`toast.*`, `Alert`), jangan memparafrasekannya
  di dalam tanda kutip.
- **Tanggal/angka ambang.** "Tanggal esok tidak bisa dipilih" harus ada di kode (`disabled={(d) => d > new Date()}`),
  bukan asumsi.

Karena perangkap ini, **setiap kartu T2 tetap bertanda ⚠** sampai seorang pengguna sungguhan mencobanya.

## Kartu tugas (unit dasar panduan)

Satu kartu = satu tugas dalam istilah kerja pembaca ("Mencatat absensi harian",
bukan "Modul attendance"). Empat bagian wajib + tiga opsional:

| Bagian | Isi | Sumber |
|---|---|---|
| **Tujuan** | Satu kalimat, bahasa kerja pembaca | wawancara / `decisions/` |
| **Siapa** | Keluarga peran (dan unit bila relevan) | `panduan-peran`, `authorize(...)` di `*.routes.ts` |
| **Jalur menu** | `Grup → Butir → Sub-butir`, persis seperti tertera (sebagian judul masih Inggris — tulis apa adanya). Dicetak dari `role-menus.ts` untuk **penugasan utama** | `role-menus.ts` |
| **Langkah** | Bernomor; **satu tindakan per langkah**; nama tombol/kolom persis seperti layar; hasil yang terlihat ditulis miring | aplikasi berjalan (T1) atau kode (T2) |
| *Hasil & giliran berikutnya* | "Status menjadi *Menunggu Paraf*; giliran pemaraf pertama" | kode service + `decisions/` |
| *Bila tidak berhasil* | 2–4 masalah paling umum + penyebab + apa yang harus dilakukan | uji, `lessons/`, pesan galat di kode |
| *Ketersediaan* | Di cabang / `main` / staging / produksi | `progress.md` |

Bila halamannya **tidak ada di menu perannya**, katakan: "tidak ada di menu —
buka `/…`", dan catat sebagai celah (jangan dikarang jalurnya). Bila
`known-issues.md` mencatat alurnya rusak, tulis batasannya di kartu atau
keluarkan kartunya dan masukkan ke Lampiran *Belum tersedia*.

Jangan menyalin pohon menu lengkap ke panduan; tautkan tugasnya saja.

## Empat pertanyaan "bisakah peran X melakukan Y?"

Sebelum menulis "Guru dapat …", lolos-kan empat lapis (skill `panduan-peran`):
menu → halaman (`canAccessRoute`) → rute API (`authorize`) → service & lingkup
data. Ada aksi yang bergantung **baris**, bukan peran (izin santri diputuskan
musyrif atau wali kelas santri itu; absensi kelas oleh wali kelas dan guru yang
mengajar di kelas itu). Tulis aturannya, bukan sekadar "guru bisa".

## Struktur Bagian Umum

1. **Tentang panduan ini** — siapa pembacanya; cara memakai; konvensi (tombol
   dalam **tebal**, jalur menu dengan panah, ⚠ untuk yang belum diverifikasi);
   basis versi aplikasi (commit + tanggal); cara melapor kekeliruan.
2. **Mulai** (tutorial): membuka aplikasi; masuk; verifikasi dua langkah untuk
   admin; mengenal dasbor, menu, dan notifikasi; mengubah kata sandi dan profil;
   keluar. Semua dari layar nyata.
3. **Konsep** (penjelasan, tiap konsep ≤ satu halaman): mengapa menu tiap orang
   berbeda; persetujuan berjenjang; apa yang dilihat wali santri dan apa yang
   tidak; perlindungan data santri.
4. **Rujukan**: arti status; daftar peran singkat; pesan galat umum; glosarium
   (ejaan yayasan: Tahfidz, Tahsin, Takhosus, Kitab Kuning; istilah pesantren tidak
   diterjemahkan).
5. **Bantuan**: ke siapa bertanya (peran, bukan nama orang), dan cara melapor.

## Tangkapan layar

- Satu gambar per **layar penentu**, bukan per langkah. Lebih dari tiga gambar
  per kartu berarti kartunya terlalu besar — pecah.
- Hanya dari **akun demo** dengan **data contoh**. Tidak pernah data santri,
  wali, atau pegawai sungguhan. Wajah, nama, nomor: tak boleh.
- Pola nama: `screens/<peran>/<tugas>-<nn>.png`; keterangan bernomor:
  "Gambar 3. Formulir absensi harian".
- Bila gambar tak bisa dibuat (T2), **jangan menyisipkan gambar kosong atau
  gambar dari fitur lain**. Tulis `[ISI: tangkapan layar formulir …]`.
- Di `.docx`: lebar maksimal 15 cm; format PNG.

## Gaya bahasa

- Perintah pendek: "Klik **Simpan**." Bukan "Anda dapat mengklik tombol Simpan
  untuk menyimpan."
- Satu tindakan per langkah; hasil yang terlihat dalam *miring*.
- Nama tombol, menu, kolom: persis layar. Jangan menerjemahkan yang di layar
  masih Inggris.
- *Santri* dan *wali santri* di seluruh panduan portal (keputusan yayasan
  2026-09-27); *murid/peserta didik* hanya dalam format negara (rapor, SPMB,
  Dapodik/EMIS, ijazah).
- Istilah pesantren tidak diterjemahkan; jelaskan di glosarium.
- Hindari jargon (API, token, endpoint) di panduan untuk staf dan wali.
- Jangan menjanjikan fitur yang belum ada. Ketersediaan ditulis apa adanya.
- Tanggal: "28 September 2026".

## Daftar periksa sebelum menyerahkan

- [ ] Tingkat verifikasi tiap bagian dinyatakan di **Riwayat Revisi**
- [ ] Bila T2: **tiap** kartu bertanda ⚠
- [ ] Jalur menu dicetak dari kode pada commit yang disebut, bukan disalin dari dokumen lain
- [ ] Peran & lingkup data tiap tugas lolos empat lapis
- [ ] Ketersediaan (cabang/main/staging/produksi) tertulis di tiap kartu
- [ ] Tak ada tangkapan layar berisi data sungguhan
- [ ] Istilah: santri / wali santri; ejaan yayasan; nama tombol persis layar
- [ ] Alur yang dicatat rusak di `known-issues.md` tidak dipresentasikan sebagai jalan
- [ ] `scan_sensitive.py` bersih (tak ada kata sandi demo, IP, dsb.)
- [ ] Tak ada `[ISI: …]` tersisa **atau** dokumen ditandai Draf dan sisa isian dilaporkan
- [ ] `.docx` dirender dan dilihat; daftar isi terisi; gambar terbaca
- [ ] (Ideal) satu orang dari peran itu mencoba kartu tanpa bantuan — ISO 26514 meminta panduan diuji pada pembaca
