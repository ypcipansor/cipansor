# Fakta terukur — Cipansor

Diukur pada commit `ab82539` (2026-09-29), cabang `docs/dokumen-aplikasi-cipansor`; skrip dijalankan 2026-09-29 14:05.

Angka di bawah adalah hasil hitung, bukan ingatan. Kutip dengan menyebut commit/tanggal ini.

## Ringkasan angka

| Hal | Nilai |
|---|---|
| Modul API | 93 |
| Handler rute API (perkiraan, `router.get/post/put/patch/delete`) | ≈1395 |
| Modul dengan anotasi Swagger | 28 dari 93 |
| Modul dengan empat berkas (routes+controller+service+schema) | 66 |
| Modul dengan lima bagian (empat berkas + index.ts) — ukuran known-issues.md | 24 |
| Modul yang memanggil Prisma dari route/controller | 12 |
| Model Prisma / enum | 289 / 157 |
| Baris `schema.prisma` | 10382 |
| Kode peran (`RoleCode`) | 53 |
| Berkas *.job.ts | 14 |
| Entri cron di scheduler.ts | 15 |
| Berkas job yang dijadwalkan scheduler.ts | 13 |
| Kunci variabel lingkungan di `.env.example` | 78 |
| Halaman web (`page.tsx`) | 435 |
| Hook data web | 125 |
| Berkas uji unit API / web | 345 / 43 |
| Berkas spesifikasi e2e (Playwright) | 108 |
| Tangkapan layar di `docs/images` | 78 |

## Stack (versi dari package.json)

Package manager: `pnpm@9.15.9`

**apps/api**: `express` ^5.0.0, `prisma` 7.10.0, `@prisma/client` 7.10.0, `zod` ^4.6.5, `ioredis` ^6.0.0, `jsonwebtoken` ^9.0.3, `typescript` ^6.0.3, `vitest` 5.0.1, `axios` 1.20.0, `node-cron` ^4.6.0, `swagger-jsdoc` ^6.3.0, `swagger-ui-express` ^5.0.1, `helmet` ^8.3.0, `multer` ^2.4.0, `otplib` 13.5.0, `winston` ^3.11.0, `pdf-lib` ^1.17.1

**apps/web**: `next` ^16.3.6, `react` 19.3.0, `react-dom` 19.3.0, `zod` ^4.6.5, `typescript` ^6.0.3, `vitest` 5.0.1, `@playwright/test` ^1.63.0, `tailwindcss` ^4, `@tanstack/react-query` 5.103.2, `zustand` 5.0.15, `axios` 1.20.0, `otplib` 13.5.0

**packages/shared**: `zod` ^4.6.5, `typescript` ^6.0.3

## Modul API

| Modul | Mount | Handler | Swagger | Layering |
|---|---|---|---|---|
| academic-years | /api/academic-years | 6 | ya | ok |
| admissions | /api/admissions | 38 | ya | ok |
| alumni | /api/alumni | 30 | ya | ok |
| analytics | /api/analytics | 26 | ya | ok |
| announcements | /api/announcements | 7 | ya | ok |
| assessment | /api/assessment | 49 | ya | ⚠ Prisma di route/controller |
| assignments | /api/assignments | 8 | - | ok |
| attendance | /api/attendance | 12 | ya | ok |
| auth | /api/auth | 13 | ya | ok |
| business-unit | /api/business-units | 7 | - | ok |
| calendar | /api/calendar | 12 | - | ok |
| canteen | /api/canteen | 19 | - | ok |
| cbt | /api/cbt | 20 | - | ⚠ Prisma di route/controller |
| chatbot | /api/chatbot | 9 | - | ⚠ Prisma di route/controller |
| classes | /api/classes | 9 | ya | ok |
| complaints | /api/complaints | 6 | - | ⚠ Prisma di route/controller |
| correspondence | /api/correspondence | 15 | - | ok |
| counseling | /api/counseling | 14 | - | ok |
| curriculum | /api/curriculum | 21 | ya | ok |
| daily-report | /api/daily-report | 9 | ya | ok |
| dapodik | /api/dapodik | 6 | - | ok |
| dashboard | /api/dashboard | 8 | - | ok |
| dashboard-enhancement | /api/dashboard-enhancement | 8 | - | ok |
| donation | /api/donation | 20 | - | ok |
| dormitories | /api/dormitories | 23 | ya | ok |
| duty-roster | /api/duty-roster | 18 | - | ok |
| emis | /api/emis | 5 | - | ok |
| esign | /api/esign | 18 | - | ok |
| extracurricular | /api/extracurricular | 17 | - | ok |
| facilities | /api/facilities | 21 | - | ok |
| finance | /api/finance | 47 | ya | ok |
| finance-enhancement | /api/finance-enhancement | 34 | - | ⚠ Prisma di route/controller |
| foundation | /api/foundation | 26 | ya | ok |
| health | /api/health | 25 | ya | ok |
| homeroom | /api/homeroom | 14 | - | ok |
| hr | /api/hr | 37 | ya | ⚠ Prisma di route/controller |
| ibadah | /api/ibadah | 25 | - | ok |
| inventory | /api/inventory | 34 | - | ok |
| kitab-progress | /api/kitab-progress | 16 | - | ok |
| kurikulum-merdeka | /api/kurikulum-merdeka | 45 | - | ok |
| laundry | /api/laundry | 13 | - | ok |
| library | /api/library | 16 | ya | ok |
| lingkungan | /api/lingkungan | 12 | - | ok |
| marketing | /api/marketing | 14 | - | ok |
| meals | /api/meals | 18 | - | ok |
| messages | /api/messages | 6 | - | ok |
| muhadatsah | /api/muhadatsah | 12 | - | ok |
| muhadhoroh | /api/muhadhoroh | 11 | - | ok |
| muhasabah | /api/muhasabah | 13 | - | ok |
| murojaah | /api/murojaah | 15 | - | ok |
| non-formal | /api/non-formal | 5 | - | ok |
| notifications | /api/notifications | 29 | ya | ⚠ Prisma di route/controller |
| organisasi | /api/organisasi | 11 | - | ok |
| parent | /api/parent | 17 | ya | ok |
| paud-assessment | /api/paud-assessment | 22 | ya | ok |
| paud-report | /api/paud-report | 13 | - | ok |
| payroll | /api/payroll | 24 | - | ok |
| pengawasan | /api/pengawasan | 12 | - | ok |
| perencanaan | /api/perencanaan | 22 | - | ok |
| performance-management | /api/performance-agreements | 24 | - | ok |
| permits | /api/permits | 14 | ya | ok |
| portfolio | /api/portfolio | 15 | - | ok |
| practicum | /api/practicum | 8 | - | ⚠ Prisma di route/controller |
| procurement | /api/procurement | 6 | - | ok |
| project | /api/projects | 12 | - | ok |
| quality | /api/quality | 9 | - | ok |
| rapor-pesantren | /api/rapor-pesantren | 9 | ya | ok |
| reception | /api/reception | 10 | - | ok |
| reporting | /api/reports | 7 | ya | ok |
| research | /api/research | 8 | - | ⚠ Prisma di route/controller |
| rewards | /api/rewards | 9 | ya | ok |
| risk | /api/risk | 8 | - | ok |
| roles | /api/roles | 10 | - | ⚠ Prisma di route/controller |
| sanad-certificate | /api/sanad | 11 | - | ok |
| scholarship | **tidak ter-mount** | 0 | - | ok |
| simaan | /api/simaan | 12 | - | ok |
| social-service | /api/social-service | 5 | - | ok |
| student-compliance | /api/student-compliance | 5 | - | ⚠ Prisma di route/controller |
| student-org | /api/student-org | 6 | - | ⚠ Prisma di route/controller |
| students | /api/students | 13 | ya | ok |
| suppliers | /api/suppliers | 5 | - | ok |
| syariah | /api/syariah | 7 | - | ok |
| tahfidz | /api/tahfidz | 9 | - | ok |
| takhosus | /api/takhosus | 29 | - | ok |
| talenta | /api/talenta | 19 | - | ok |
| tatalaksana | /api/tata-laksana | 9 | - | ok |
| teacher-compliance | /api/teacher-compliance | 6 | - | ok |
| units | /api/units | 13 | ya | ok |
| upload | /api/upload | 1 | - | ok |
| users | /api/users | 5 | ya | ok |
| violations | /api/violations | 7 | ya | ok |
| wallet | /api/wallet | 10 | - | ok |
| wilayah | /api/wilayah | 12 | - | ok |

Modul tanpa routes (pustaka internal, bukan endpoint): `scholarship`

## Job terjadwal

Dijadwalkan oleh `scheduler.ts`: `accreditation-reminder.job.ts`, `attendance-follow-up.job.ts`, `attendance-pattern.job.ts`, `attendance-register-reminder.job.ts`, `chatbot-escalation-retry.job.ts`, `chatbot-spend.job.ts`, `chatbot-transcript-purge.job.ts`, `dashboard-metrics.job.ts`, `dashboard-snapshot.job.ts`, `finance-billing.job.ts`, `identity-purge.job.ts`, `permit-note-erasure.job.ts`, `spp-reminder.job.ts`

**Ada berkas job yang TIDAK dijadwalkan** (dipanggil dari tempat lain; jangan disebut terjadwal): `asset-depreciation.job.ts`

## Variabel lingkungan (nama saja)

- **CHATBOT**: `CHATBOT_PROVIDER`, `CHATBOT_API_BASE_URL`, `CHATBOT_API_KEY`, `CHATBOT_MODEL`, `CHATBOT_PERSONA`, `CHATBOT_RATE_LIMIT_WINDOW_MS`, `CHATBOT_RATE_LIMIT_MAX_REQUESTS`, `CHATBOT_RETRY_MAX_ATTEMPTS`, `CHATBOT_RETRY_BASE_MS`, `CHATBOT_RETRY_MAX_DELAY_MS`, `CHATBOT_RETRY_BUDGET_MS`, `CHATBOT_MAX_CONCURRENT`, `CHATBOT_QUEUE_MAX`, `CHATBOT_QUEUE_WAIT_MS`, `CHATBOT_ESCALATION_TO`, `CHATBOT_ESCALATION_WINDOW_MS`, `CHATBOT_ESCALATION_MAX`, `CHATBOT_PRICE_INPUT_PER_MTOK`, `CHATBOT_PRICE_OUTPUT_PER_MTOK`, `CHATBOT_PRICE_CACHED_INPUT_PER_MTOK`, `CHATBOT_PRICE_CURRENCY`, `CHATBOT_MONTHLY_BUDGET`, `CHATBOT_SPEND_ALERT_TO`
- **SMTP**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_OAUTH_CLIENT_ID`, `SMTP_OAUTH_CLIENT_SECRET`, `SMTP_OAUTH_REFRESH_TOKEN`
- **WA**: `WA_API_URL`, `WA_API_KEY`, `WA_PROVIDER`, `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`
- **RATE**: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_AUTH_WINDOW_MS`, `RATE_LIMIT_AUTH_MAX_REQUESTS`
- **DB**: `DB_USER`, `DB_PASSWORD`, `DB_PORT`
- **JWT**: `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- **TURNSTILE**: `TURNSTILE_SECRET_KEY`, `TURNSTILE_TIMEOUT_MS`, `TURNSTILE_ALLOWED_HOSTNAMES`
- **GOOGLE**: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_ANALYTICS_ID`
- **NEXT**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- **REDIS**: `REDIS_URL`, `REDIS_PORT`
- **COOKIE**: `COOKIE_SECURE`, `COOKIE_DOMAIN`
- **MAIL**: `MAIL_FROM`, `MAIL_REPLY_TO`
- **LAINNYA**: `DATABASE_URL`, `STUDENT_CARD_HMAC_SECRET`, `PORT`, `NODE_ENV`, `API_INTERNAL_URL`, `WEB_PORT`, `SCHEDULER_ENABLED`, `OUTBOUND_MESSAGES_ENABLED`, `MIGRATE_ON_START`, `PUBLIC_SITE_URL`, `PORTAL_URL`, `CORS_ORIGIN`, `LOG_LEVEL`, `MAX_FILE_SIZE`, `UPLOAD_DIR`, `GMAIL_SENDER`, `PASSWORD_RESET_RATE_LIMIT_MAX`, `IDENTITY_DOCUMENT_RETENTION_YEARS`

## Rute web tingkat atas

`/academic-years`, `/admin`, `/admissions`, `/alumni`, `/analytics`, `/announcements`, `/api`, `/assessment`, `/assignments`, `/attendance`, `/berita`, `/calendar`, `/canteen`, `/cbt`, `/certificates`, `/classes`, `/counseling`, `/curriculum`, `/daily-report`, `/dashboard`, `/donation`, `/dormitories`, `/duty-roster`, `/e-office`, `/emis`, `/extracurricular`, `/facilities`, `/finance`, `/foundation`, `/galeri`, `/grc-dashboard`, `/health`, `/homeroom`, `/hr`, `/ibadah`, `/inventory`, `/kinerja`, `/kitab-progress`, `/kontak`, `/laundry`, `/library`, `/lingkungan`, `/login`, `/marketing`, `/meals`, `/muhadatsah`, `/muhadhoroh`, `/muhasabah`, `/musyrif`, `/notifications`, `/organisasi`, `/parent`, `/payroll`, `/pengawasan`, `/perencanaan`, `/permits`, `/portfolio`, `/practicum`, `/procurement`, `/profil`, `/profile`, `/program-unggulan`, `/project`, `/public`, `/quality`, `/rapor-pesantren`, `/reception`, `/reports`, `/research`, `/reset-password`, `/rewards`, `/risk-management`, `/schedule`, `/settings`, `/spmb`, `/staff`, `/student`, `/student-org`, `/students`, `/syariah`, `/tahfidz`, `/takhosus`, `/talenta`, `/tata-laksana`, `/teacher`, `/tk`, `/unauthorized`, `/unit`, `/unit-usaha`, `/units`, `/users`, `/violations`, `/wakaf-infaq`, `/wallet`, `/wilayah`

## Infrastruktur

- Workflow CI/CD: ci.yml, deploy-production.yml, deploy-staging.yml, e2e-tests.yml
- Layanan docker-compose: db, api, web, redis
- Dockerfile: apps/api/Dockerfile, apps/web/Dockerfile, deploy/azure/nginx/Dockerfile

## Dokumen & catatan yang sudah ada di repo

- `docs/`: ARCHITECTURE.md, DEPLOYMENT.md, EMAIL_SETUP.md, EOFFICE_ESIGN_PLAN.md, MOBILE_API.md, deploy-azure.md
- Skill repo (`.claude/skills`): dokumen-aplikasi-cipansor, gate, naskah-dinas, panduan-peran, screenshot-roles, stack, sync-records, tata-kelola-yayasan
- Keputusan tercatat: 23 berkas di `.claude/memory/decisions/` (ringkasan di bawah)
- Bagian `known-issues.md`: Broken flows and wrong figures; Access that is too narrow, or needs review; Waiting on a decision; Design gaps; Performance; Tests; Unverified; Deliberate — do not "fix"
- Lisensi: HAK CIPTA DAN KETENTUAN PENGGUNAAN — PERANGKAT LUNAK PROPRIETARY

## Keputusan tercatat (ringkasan satu kalimat dari tiap berkas)

Bahan bab *Keputusan Arsitektur*. Kutip dan tautkan; jangan mengarang ulang alasannya.

- `absensi-harian.md` — Keputusan pengguna 2026-09-27 — register harian diisi di kelas oleh wali kelas atau guru yang mengajar di kelas itu (operator unit cadangan); satu halaman; tindak lanjut otomatis dengan pemilik yang sudah ada (wali kelas untuk murid harian, musyrif untuk santri mukim); tanpa guru piket. 2026-09-28: parameter tanda pola
- `akreditasi-unit.md` — Keputusan pengguna 2026-09-28 — akreditasi tiap unit dicantumkan di situs publik (fakta, tautan cek BAN-PDM, PDF sertifikat) dari satu catatan resmi di portal yang diisi admin unit atau Super Admin; unit tampil begitu sertifikatnya ada; pengingat 12 bulan sebelum berakhir
- `autentikasi-2fa-dan-sandi.md` — KEPUTUSAN 2026-09-28: siapa yang wajib 2FA (admin, organ, kepala unit), siapa yang diajak sesudah login (staf dan wali, "Nanti saja" tanpa batas), dan kebijakan sandi (ganti karena kejadian, bukan kalender; panjang dan daftar terlarang, bukan aturan campuran). KEPUTUSAN 2026-09-29: "Masuk dengan Google" untuk akun @cipansor.or.id saja, dan peran wajib 2FA tetap memasukkan kode Cipansor sesudah Google. Riset dan sumbernya ada di bawah; jangan diulang.
- `chatbot-retrieval-settled.md` — Korpus chatbot 628 token — ambang RAG ~100 ribu, jadi seluruh korpus dikirim dan BM25 tidak lagi menjadi gerbang; angka biayanya, dan pemicu untuk meninjau ulang
- `eoffice-revocation-authority.md` — Kewenangan mencabut naskah dinas — tabelnya, tiga sumber yang menyepakatinya, dan mengapa Super Admin tidak termasuk
- `eoffice-revocation-mechanics.md` — Pencabutan itu pernyataan bertanda tangan (bukan kolom status) — passphrase, cap DICABUT, dan alur permohonan
- `eoffice-verify-by-upload-not-qr.md` — E-Office letter verification is deliberately upload-the-PDF + Turnstile, never scan-QR-and-trust — the feature as it stands is the `naskah-dinas` skill; its audit and plan are docs/EOFFICE_ESIGN_PLAN.md
- `esign-standards-ceiling.md` — Batas atas TTE Cipansor menurut AATL/eIDAS/PP 71 — dan satu temuan: Ed25519 tidak ada di daftar algoritma AATL
- `istilah-dan-penamaan.md` — Glossary and naming decisions of 2026-09-25, taken by the user on the architecture audit (the learner's name revised 2026-09-27: santri on every portal screen, murid only in state formats); the yayasan's own spellings; the portal in Indonesian only and the public site in three languages; tables renamed with their models; `/api/v1`; no laboratory module; donations, ZIS and wakaf built properly. Read before naming anything.
- `menu-ia-tiga-tingkat.md` — Riset IA menu (maks 3 tingkat, submenu maks 2 tingkat) + keputusan 2026-09-07 mengelompokkan menu utama per disiplin; jangan riset ulang dan jangan usulkan tingkat keempat
- `pemutus-izin-santri.md` — Keputusan pengguna 2026-09-25 — izin santri diputuskan pembimbing langsungnya (musyrif atau wali kelas), bukan kepala sekolah; kepala unit hanya untuk izin panjang, santri tanpa pembimbing, atau ambil alih. 2026-09-27: batas 7 hari tetap; surat dokter bila perlu; pulang/menginap → koordinator asrama; izin staf keluar pondok menunggu wali. 2026-09-28: surat dokter disimpan sampai akhir TA, dibuka pemutus + wali + kepala unit (#606); koordinator asrama dibangun — "menginap" = di luar pondok melewati tengah malam WIB
- `pengawasan-dan-rapat-pembina.md` — KEPUTUSAN 2026-09-28 — PR #508 (pemberhentian sementara Pengurus + WBS) dan #509 (keputusan dan risalah organ) ditutup; keduanya dibangun ulang dengan syarat di bawah. Dasar hukum dan standarnya sudah diriset, jangan diulang. Rancangannya diputuskan pengguna pada hari yang sama (bagian "Diputuskan").
- `pengesahan-dokumen-yayasan.md` — KEPUTUSAN 2026-09-11 — RPJP, Renstra, dan RKA Yayasan disahkan lewat Pengurus → Pengawas (reviu) → Pengurus (tanggapan) → Pembina (tetapkan/kembalikan); RKA Unit disusun kepala sekolah dan disahkan Ketua Pengurus; dokumen yang sudah disahkan beku; dasar hukumnya sudah diriset
- `penyimpanan-berkas.md` — KEPUTUSAN 2026-09-29: berkas unggahan (foto, dokumen, surat) dicatat di satu tabel berkas dengan pemilik dan status; isinya di Azure Blob **privat**, diakses lewat managed identity dan SAS delegasi pengguna berumur pendek; tanpa kunci akun dan tanpa kontainer publik; berkas yang tidak pernah ditautkan dihapus sesudah 24 jam. Riset di bawah; jangan diulang.
- `peran-dan-tugas-tambahan.md` — Keputusan pengguna 2026-09-26 — kode peran = fungsi seseorang; tugas tambahan (wakasek, wali kelas, guru wali, kepala perpustakaan/lab, pembina, panitia) = relasi atau penugasan, bukan kode peran. `*_WAKASEK` dan `*_WALI_KELAS` digabung ke `*_GURU`. Sesi konseling rahasia dibaca konselornya dan guru BK unit; kepala sekolah hanya rujukannya.
- `pimpinan-pesantren-kiai.md` — KEPUTUSAN 2026-09-24: tidak ada Direktur Pesantren di Cipansor — PESANTREN_DIREKTUR dihapus; Kiai = Pimpinan/Pengasuh = kepala unit pesantren DAN Pembina yayasan (dua peran); dasar UU 18/2019 Ps. 1(9), 9(2); UU 16/2001 Ps. 5, 29, 35(3) — jangan riset ulang
- `pk-organ-yayasan-tanpa-kontrak.md` — Keputusan 2026-09-06 — Pembina, Pengurus, dan Pengawas TIDAK membuat Perjanjian Kinerja; kontrak Pengurus sudah berupa RKA Yayasan, dan PK unit menginduk pada dokumen RKA
- `public-site-photography.md` — Where the pesantren's real photographs come from (pesantrencipansor.com), what was migrated for the Google for Nonprofits re-review, and the two articles deliberately left behind
- `realtime-polling.md` — KEPUTUSAN 2026-09-28: portal tidak punya kanal dorong (Socket.IO, WebSocket, SSE). Web segar lewat polling React Query. Server Socket.IO dihapus karena tidak punya klien. Di bawah: pembandingnya, sumbernya, dan syarat membangun kanal dorong kelak. Jangan ulang risetnya.
- `rka-dua-tingkat.md` — Keputusan pengguna 2026-09-06 — tingkat tahunan bertingkat DUA (RKA Yayasan konsolidasi → RKA Unit); jangan usulkan lagi rantai tiga tingkat
- `route-naming.md` — Route/naming refactor decided 2026-07-21 — PPDB/PSB → SPMB, every retired path keeps a permanent redirect, and pesantren domain terms are never translated
- `struktur-organisasi-dan-identitas.md` — Keputusan pengguna 2026-09-29, sesudah audit realm/group/sub group/unit organisasi — unit Pesantren dibuat (rumah Kiai, musyrif, ustadz, muhafidz, TU Pesantren, santri takhosus-only); satu pohon organisasi maks 3 tingkat (Yayasan → Unit → Bidang) dengan jabatan terpisah dari pemegangnya; Model A bertahap tetapi menyeluruh, dijaga uji "baseline hanya boleh menyusut"; Google Workspace: OU per kebijakan, grup diturunkan otomatis dari Cipansor; jalur identitas Cipansor → Google → Microsoft ditegaskan ulang dengan riset.
- `unit-vs-asrama-vs-takhosus.md` — RISET + REKOMENDASI 2026-09-13: asrama/boarding BUKAN unit (mukim/non-mukim itu atribut EMIS); pesantren = Foundation; Takhasus butuh unit TAPI TakhosusEnrollment yang sudah ada adalah sumbu lain; DIPUTUSKAN: unit pesantren = `UnitType.PESANTREN` yang sudah ada, syahadah saja

## Kode peran

`SUPER_ADMIN`, `YAYASAN_PEMBINA`, `YAYASAN_KETUA`, `YAYASAN_SEKRETARIS`, `YAYASAN_BENDAHARA`, `YAYASAN_ANGGOTA`, `YAYASAN_PENGAWAS`, `TKQ_ADMIN`, `TKQ_KEPALA_SEKOLAH`, `TKQ_GURU`, `TKQ_TATA_USAHA`, `TKQ_BENDAHARA`, `TKQ_KOMITE`, `TKQ_ORANG_TUA`, `SDIT_ADMIN`, `SDIT_KEPALA_SEKOLAH`, `SDIT_GURU`, `SDIT_TATA_USAHA`, `SDIT_BENDAHARA`, `SDIT_KOMITE`, `SDIT_ORANG_TUA`, `SDIT_SISWA`, `SMPIT_ADMIN`, `SMPIT_KEPALA_SEKOLAH`, `SMPIT_GURU`, `SMPIT_GURU_BK`, `SMPIT_TATA_USAHA`, `SMPIT_BENDAHARA`, `SMPIT_KOMITE`, `SMPIT_ORANG_TUA`, `SMPIT_SISWA`, `SMPIT_ALUMNI`, `SMAQ_ADMIN`, `SMAQ_KEPALA_SEKOLAH`, `SMAQ_GURU`, `SMAQ_GURU_BK`, `SMAQ_TATA_USAHA`, `SMAQ_BENDAHARA`, `SMAQ_KOMITE`, `SMAQ_ORANG_TUA`, `SMAQ_SISWA`, `SMAQ_ALUMNI`, `PESANTREN_PENGASUH`, `PESANTREN_TATA_USAHA`, `USTADZ`, `MUSYRIF`, `MUHAFIDZ`, `PUSTAKAWAN`, `PERAWAT`, `KEAMANAN`, `LABORAN`, `BUSINESS_MANAGER`, `BUSINESS_STAFF`
