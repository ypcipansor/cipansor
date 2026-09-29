# Dokumen Teknis Aplikasi — cara menyusun

Kerangka: arc42 (12 bab) + diagram C4 dalam Mermaid. Alasannya di
`standar-dan-alasan.md`. Templatnya: `assets/template-teknis.md` — salin, lalu
isi tiap `[ISI: …]` dari sumber di bawah.

**Pembaca:** pengurus yayasan (ringkasan eksekutif, bab 1, 3, 10), pengelola
sistem (bab 5–7, 11, lampiran operasional), pengembang baru (bab 4–9).
Tulis bab 1 dan ringkasan eksekutif dalam bahasa yang dipahami pengurus tanpa
latar teknis; bab 5 ke atas boleh teknis.

## Sebelum menulis

1. Jalankan `collect_facts.py` → `facts.md`. Semua angka di dokumen berasal dari
   sana dan disebut bersama commit + tanggalnya. Jangan menulis jumlah modul dari
   ingatan; tulis "N modul (diukur pada commit abc1234, 28 September 2026)".
2. Baca `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/deploy-azure.md`,
   `docs/EOFFICE_ESIGN_PLAN.md`, `docs/MOBILE_API.md`, `docs/EMAIL_SETUP.md`.
   Dokumen teknis **merangkum dan menautkan** — tidak menyalin — karena
   salinan pasti bergeser dari aslinya.
3. Baca `.claude/memory/progress.md` (apa yang di produksi / staging / `main`),
   `.claude/memory/known-issues.md`, dan `decisions/*.md`.
4. Untuk tiap alur di bab 6, **baca kodenya** (rute → controller → service).
   Diagram alur yang digambar dari dugaan adalah dokumen yang menyesatkan.

## Pemetaan bab → sumber

| Bab arc42 | Isi untuk Cipansor | Sumber (baca, jangan mengarang) | Diagram |
|---|---|---|---|
| **Ringkasan eksekutif** | Satu halaman: apa itu Cipansor, siapa yang memakai, apa yang sudah jalan, apa yang belum, seberapa aman dipelihara | `README.md`, `progress.md`, `facts.md` | — |
| **1 Pendahuluan & tujuan** | Tujuan sistem; pemangku kepentingan (organ yayasan, unit: TKQ/SDIT/SMPIT/SMAQ dan pesantren, guru, staf, wali santri, santri, alumni, komite); 3–5 tujuan mutu teratas | `README.md`, `panduan-peran` (keluarga menu), `roadmap.md` | — |
| **2 Batasan** | Teknis (stack & versi, pnpm workspaces, PostgreSQL, Node), organisasi (tim kecil, tools hibah nonprofit, repo publik sampai rilis), hukum (yang *tercatat di repo*: UU Yayasan, UU PDP, PP 71/2019 untuk TTE) | `facts.md` → stack; `decisions/esign-standards-ceiling.md`; `tata-kelola-yayasan` | — |
| **3 Konteks & lingkup** | Siapa/apa di luar sistem: pengguna per keluarga peran; sistem luar (penyedia surel — Gmail API/SMTP, WhatsApp, Cloudflare Turnstile, penyedia model bahasa untuk chatbot, Sentry, Google Analytics). Apa yang **di luar lingkup** | `facts.md` → prefiks variabel lingkungan; `docs/EMAIL_SETUP.md`; `docs/MOBILE_API.md` | **C4-1** Konteks |
| **4 Strategi solusi** | Keputusan besar dalam satu paragraf tiap satu: monorepo + modul per ranah; web & API terpisah; satu basis data; tipe & validasi bersama (`packages/shared`); RBAC dua lapis; pengujian berlapis | `docs/ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md` | — |
| **5 Blok bangunan** | Tingkat 1: kontainer (web, API, shared, PostgreSQL, Redis opsional, penjadwal). Tingkat 2: lapisan modul API (routes → controller → service → schema), middleware, pengelompokan modul menurut ranah. Katalog modul lengkap masuk Lampiran A | `apps/api/src/app.ts`, `apps/api/src/middleware/`, `apps/api/src/modules/`, `apps/web/src/`, `facts.md` | **C4-2** Kontainer; **C4-3** Komponen API |
| **6 Runtime** | 4–6 skenario **yang benar-benar dibaca dari kode**: (a) masuk + 2FA + penyegaran token; (b) satu permintaan API melewati middleware (rate limit → autentikasi → otorisasi → validasi → service); (c) alur persetujuan dokumen yayasan (RPJP → Renstra → RKA); (d) persuratan & verifikasi naskah dengan unggah PDF; (e) SPMB publik dengan Turnstile; (f) pekerjaan terjadwal | modul terkait; `decisions/pengesahan-dokumen-yayasan.md`, `eoffice-verify-by-upload-not-qr.md`; `apps/api/src/jobs/` | diagram urutan (Mermaid `sequenceDiagram`) |
| **7 Penempatan** | Lokal (docker-compose: db, api, web, redis), CI/CD (nama workflow), staging vs produksi, CDN/proxy. **Kategori** variabel lingkungan dan fungsinya — bukan nilainya | `docker-compose.yml`, `.github/workflows/`, `docs/deploy-azure.md`, `docs/DEPLOYMENT.md`, `facts.md` → env | **Penempatan** (`flowchart`) |
| **8 Konsep lintas-bidang** | Autentikasi & sesi; otorisasi (bucket + kode peran + lingkup unit); validasi (Zod); amplop respons `{success, data}`; penanganan galat; log; data pribadi (pilih kolom eksplisit, jangan `include` relasi penuh); i18n (portal Indonesia; situs publik tiga bahasa); migrasi basis data; pengujian (unit, e2e, uji penjaga); pekerjaan terjadwal | `panduan-peran`; `lessons/*.md`; `apps/api/src/middleware/`; `apps/api/prisma/`; `istilah-dan-penamaan.md` | — |
| **9 Keputusan arsitektur** | Tabel: keputusan · ringkasan · tautan berkas. Daftar berkas dari `facts.md` → *Keputusan tercatat*; **ringkasannya ditulis ulang** (lihat di bawah tabel ini) | `.claude/memory/decisions/`, `INDEX.md` | — |
| **10 Persyaratan kualitas** | Skenario terukur per mutu: keamanan, ketersediaan/pemulihan, kinerja, keterpeliharaan, kemudahan pakai. Tiap skenario menyebut **buktinya** (uji, CI, kebijakan) atau berkata "belum terbukti" | `AGENTS.md`, CI, uji penjaga, `known-issues.md` → Performance & Tests | — |
| **11 Risiko & utang teknis** | Ringkasan per kategori dari `known-issues.md` + jarak antara aturan repo dan kenyataan kode (mis. modul yang memanggil Prisma dari route/controller — angkanya dari `facts.md`). **Lihat aturan kepekaan di bawah** | `known-issues.md`, `roadmap.md`, `facts.md` | — |
| **12 Glosarium** | Istilah pesantren (dengan ejaan yayasan) dan istilah teknis yang dipakai dokumen | `istilah-dan-penamaan.md`; kata yang muncul di dokumen | — |
| **Lampiran** | A Katalog modul (tabel dari `facts.md`); B ERD tingkat ranah; C Variabel lingkungan (nama + fungsi); D Prosedur operasional (build, jalankan, migrasi, cadangkan, kembalikan) → tautkan `docs/DEPLOYMENT.md`; E Daftar sumber & commit | `facts.md`; `apps/api/prisma/schema.prisma` | ERD ranah |

### Bab 9: tulis ulang, jangan menyalin mentah

Baris pertama tiap berkas keputusan bukan ringkasan yang siap terbit: sebagian berbahasa Inggris,
sebagian diawali "Keputusan pengguna 2026-…", sebagian panjang sampai terpotong. Untuk tiap berkas:
baca ringkasannya (`INDEX.md` dan paragraf pembuka), lalu tulis **satu kalimat Indonesia, ≤ 30 kata**
yang mengatakan apa yang diputuskan — bukan mengapa. Jangan memotong di tengah kalimat. Jangan
menambahkan alasan atau tanggal yang tidak ada di berkas. Kolom tautan tetap menunjuk berkasnya,
supaya pembaca yang ingin alasannya membuka sumber aslinya. Pastikan **setiap** berkas keputusan
punya baris (bandingkan jumlah baris dengan jumlah berkas di `facts.md`).

## Aturan kepekaan (repo publik sampai rilis)

Definisi resmi repo: *sensitif* = yang bisa dipakai penyerang — kredensial dan
statusnya, kunci, token, connection string, **nama dan id sumber daya cloud**,
alamat IP, jalur host, **kelemahan yang masih terbuka di produksi**, detail
insiden, data pribadi.

- Sebut **jenis** layanan ("basis data PostgreSQL terkelola", "brankas rahasia"),
  bukan nama/ID sumber dayanya.
- Variabel lingkungan: **nama dan fungsi**, tidak pernah nilai, tidak pernah contoh yang menyerupai nilai asli.
- Akun demo dan kata sandinya **tidak masuk** dokumen (masuk akal di repo; di
  dokumen yang dikirim keluar tidak).
- Bab 11: tulis *kategori dan tingkat dampak* ("ada N butir akses yang terlalu
  sempit, dilacak internal"). Jangan menulis kelemahan produksi yang masih
  terbuka beserta cara memanfaatkannya. Bila ragu apakah suatu butir masih
  terbuka: **jangan tulis, dan katakan kepada pengguna** butir mana yang
  ditahan dan mengapa.
- Selalu jalankan `scan_sensitive.py`. Ia menangkap yang mekanis; yang butuh
  penilaian (kelemahan terbuka) hanya bisa ditangkap dengan membaca bab 11.

## Kedalaman: jangan menulis semuanya

Dokumen yang mencatat puluhan modul satu per satu tidak akan dibaca dan akan basi.
- **Bab utama:** ringkas per *ranah* (mis. Akademik, Kesantrian, Keuangan,
  Persuratan, Tata Kelola, Situs publik). Kelompokkan modul dari `facts.md`
  berdasarkan namanya; bila ragu pengelompokannya, tanyakan pengguna satu kali.
- **Lampiran A:** satu tabel modul (nama, ranah, jumlah rute, anotasi Swagger).
- Tulis rinci hanya untuk yang membedakan Cipansor: RBAC dua lapis, rantai
  perencanaan empat tingkat, persuratan + TTE, perizinan santri, absensi harian,
  chatbot.

## Jebakan Mermaid (sudah pernah menggagalkan build)

`build_docs.py` mencetak galat bila sebuah diagram gagal dirender, tetapi tetap menerbitkan dokumen
dengan diagram itu sebagai kode. **Periksa keluarannya; jangan menyerahkan dokumen yang masih
memuat blok kode Mermaid.**

- **Titik koma (`;`) di dalam teks** `Note`/pesan pada `sequenceDiagram` dianggap pemisah pernyataan
  dan memecah diagram. Pakai koma atau titik.
- Label `flowchart` yang berisi tanda kurung, titik dua, atau tanda kutip: bungkus dengan kutip
  ganda — `A["Teks (dengan kurung)"]`. Baris baru dalam label: `<br/>`.
- Penanda `[ISI: …]` boleh berada di dalam **label**, tetapi jangan menggantikan sintaks
  (mis. seluruh isi `erDiagram`) — blok itu tidak akan valid.
- Diagram yang terlalu lebar dirender mengecil dan tak terbaca. Pecah menjadi dua, atau ubah
  `flowchart LR` menjadi `flowchart TB`.

## Gaya

- Bahasa Indonesia baku, kalimat pendek, aktif. Istilah teknis dipertahankan
  dalam bahasa Inggris (API, middleware, commit) dan dijelaskan di glosarium
  pada kemunculan pertama.
- *Santri*, bukan *murid*, di seluruh dokumen; *murid/peserta didik* hanya bila
  menyebut format negara (rapor, SPMB, Dapodik/EMIS). Istilah pesantren tidak
  diterjemahkan.
- Tiap diagram: `%% caption: …` di baris pertama blok Mermaid, dan satu kalimat
  di teks yang mengatakan apa yang harus dilihat pembaca darinya.
- Tiap tabel angka: sebut sumber dan commit di bawahnya.
- Catatan penting dalam kotak: awali baris dengan `> **Catatan.**` atau
  `> **Batasan.**`.
- Tanggal: "28 September 2026".

## Daftar periksa sebelum menyerahkan

- [ ] Setiap angka bisa ditelusuri ke `facts.md` (commit + tanggal disebut)
- [ ] Setiap kemampuan yang disebut punya status: cabang / `main` / staging / produksi
- [ ] Diagram C4-1, C4-2, C4-3 ada, tiap diagram punya keterangan
- [ ] Bab 6: tiap skenario dibaca dari kode (sebutkan berkas rujukannya di Lampiran E)
- [ ] Bab 9: satu baris per berkas keputusan, ringkasan Indonesia ditulis ulang (bukan salinan mentah), tak ada yang terpotong
- [ ] Bab 11 jujur tetapi tidak membuka kelemahan terbuka
- [ ] `scan_sensitive.py` bersih
- [ ] Tidak ada `[ISI: …]`, `TODO`, `TBD` tersisa
- [ ] `.docx` sudah dirender dan halamannya dilihat (sampul, daftar isi terisi, diagram terbaca, tabel tidak terpotong)
