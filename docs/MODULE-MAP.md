# Peta Modul

Peta arsitektur dan modul yang **diukur dari kode** pada commit `f7e2518`
(PR #684, 2026-10-08). Setiap modul di bawah benar-benar ada di repositori;
angkanya bisa direproduksi dengan perintah di bagian
[Verifikasi](#verifikasi). Dokumen ini melengkapi
[`ARCHITECTURE.md`](ARCHITECTURE.md) (gambaran sistem) dan
[`../apps/api/AGENTS.md`](../apps/api/AGENTS.md) (aturan modul) — bukan
menggantikannya.

> Aturan mengikat tetap di `AGENTS.md` akar dan tiap paket. Peta ini tidak
> menambah aturan; ia hanya menunjukkan di mana setiap modul berada.

## Ringkasan

| Area | Jumlah | Sumber |
|---|---|---|
| Modul API (`apps/api/src/modules/*/`) | 94 | `ls -d apps/api/src/modules/*/` |
| Router di-mount di `app.ts` (`/api`) | 93 | `apiRouter.use('<path>', <router>)` |
| Modul dengan tata letak lengkap (routes+controller+service+schema+index) | 23 | skrip di [Verifikasi](#verifikasi) |
| Modul yang memanggil Prisma dari routes/controller | 12 | `assessment, cbt, chatbot, complaints, finance-enhancement, hr, notifications, practicum, research, roles, student-compliance, student-org` |
| Modul yang mengimpor modul lain langsung (bukan lewat `eventBus`/`index.ts`) | 14 | lihat [Modul yang saling mengimpor](#modul-yang-saling-mengimpor) |
| Halaman web (`apps/web/src/app/**/page.tsx`) | 432 | `find apps/web/src/app -name page.tsx` |
| Segmen rute web tingkat atas | 97 | `ls apps/web/src/app` |
| Berkas di `apps/web/src/hooks/` (hook React Query + subdir) | 132 | `find apps/web/src/hooks -type f` |
| Model Prisma | 292 | `grep -c '^model' apps/api/prisma/schema.prisma` |
| Enum Prisma | 162 | `grep -c '^enum' apps/api/prisma/schema.prisma` |
| Migrasi Prisma | 39 | `find apps/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d` |
| Tipe DTO bersama (`packages/shared/src/types/*.ts`) | 45 | `ls packages/shared/src/types/` |
| Skema Zod bersama (`packages/shared/src/schemas/*.ts`, tanpa `index.ts`) | 22 | `ls packages/shared/src/schemas/` |
| Job terjadwal (`apps/api/src/jobs/*.job.ts`) | 16 | `ls apps/api/src/jobs/*.job.ts` |

## Tata letak monorepo

```
apps/
  api/       Express 5 + Prisma 7 REST API (+ job node-cron di src/jobs/)
  web/       Next.js 16 (App Router) + React Query
packages/
  shared/    DTO + skema Zod tanpa dependensi framework
```

## Peta modul API

`app.ts` mengimpor setiap router dari barrel `modules/<name>/index.ts` dan
memount-nya di bawah `/api`. Nama rute **tidak selalu sama** dengan nama modul
(contoh `reporting` → `/reports`, `performance-management` → `/performance-agreements`);
kolom "Rute ter-mount" adalah yang benar-benar terdaftar di router.

Kolom "Tata letak": **lengkap** = kelima berkas standar
(`<name>.routes.ts`, `<name>.controller.ts`, `<name>.service.ts`,
`<name>.schema.ts`, `index.ts`) ada; **parsial** = minimal satu tidak ada.
Ini keadaan yang diukur, bukan target — aturan tetap menuntut tata letak
lengkap untuk kode baru/tersentuh.

| Modul | Rute ter-mount | Tata letak |
|---|---|---|
| `academic-years` | `/academic-years` | parsial |
| `admissions` | `/admissions` | lengkap |
| `alumni` | `/alumni` | parsial |
| `analytics` | `/analytics` | parsial |
| `announcements` | `/announcements` | lengkap |
| `assessment` | `/assessment` | parsial |
| `assignments` | `/assignments` | parsial |
| `attendance` | `/attendance` | parsial |
| `auth` | `/auth` | parsial |
| `business-unit` | `/business-units` | parsial |
| `calendar` | `/calendar` | parsial |
| `canteen` | `/canteen` | lengkap |
| `cbt` | `/cbt` | parsial |
| `chatbot` | `/chatbot` | lengkap |
| `classes` | `/classes` | parsial |
| `complaints` | `/complaints` | parsial |
| `correspondence` | `/correspondence` | parsial |
| `counseling` | `/counseling` | parsial |
| `curriculum` | `/curriculum` | parsial |
| `daily-report` | `/daily-report` | lengkap |
| `dapodik` | `/dapodik` | parsial |
| `dashboard` | `/dashboard` | lengkap |
| `dashboard-enhancement` | `/dashboard-enhancement` | parsial |
| `donation` | `/donation` | lengkap |
| `dormitories` | `/dormitories` | lengkap |
| `duty-roster` | `/duty-roster` | parsial |
| `emis` | `/emis` | parsial |
| `environment` | `/environment` | parsial |
| `esign` | `/esign` | parsial |
| `extracurricular` | `/extracurricular` | parsial |
| `facilities` | `/facilities` | lengkap |
| `finance` | `/finance` | parsial |
| `finance-enhancement` | `/finance-enhancement` | lengkap |
| `foundation` | `/foundation` | parsial |
| `health` | `/health` | parsial |
| `homeroom` | `/homeroom` | parsial |
| `hr` | `/hr` | parsial |
| `ibadah` | `/ibadah` | parsial |
| `inventory` | `/inventory` | lengkap |
| `kitab-progress` | `/kitab-progress` | parsial |
| `kurikulum-merdeka` | `/kurikulum-merdeka` | lengkap |
| `laundry` | `/laundry` | lengkap |
| `library` | `/library` | parsial |
| `lingkungan` | `/lingkungan` | parsial |
| `marketing` | `/marketing` | parsial |
| `meals` | `/meals` | parsial |
| `messages` | `/messages` | parsial |
| `muhadatsah` | `/muhadatsah` | parsial |
| `muhadhoroh` | `/muhadhoroh` | parsial |
| `muhasabah` | `/muhasabah` | lengkap |
| `murojaah` | `/murojaah` | lengkap |
| `non-formal` | `/non-formal` | parsial |
| `notifications` | `/notifications` | lengkap |
| `organisasi` | `/organisasi` | parsial |
| `parent` | `/parent` | parsial |
| `paud-assessment` | `/paud-assessment` | lengkap |
| `paud-report` | `/paud-report` | lengkap |
| `payroll` | `/payroll` | lengkap |
| `pengawasan` | `/pengawasan` | parsial |
| `perencanaan` | `/perencanaan` | parsial |
| `performance-management` | `/performance-agreements` | parsial |
| `permits` | `/permits` | parsial |
| `portfolio` | `/portfolio` | parsial |
| `practicum` | `/practicum` | parsial |
| `procurement` | `/procurement` | parsial |
| `project` | `/projects` | parsial |
| `quality` | `/quality` | parsial |
| `rapor-pesantren` | `/rapor-pesantren` | parsial |
| `reception` | `/reception` | parsial |
| `reporting` | `/reports` | parsial |
| `research` | `/research` | parsial |
| `rewards` | `/rewards` | parsial |
| `risk` | `/risk` | parsial |
| `roles` | `/roles` | parsial |
| `sanad-certificate` | `/sanad` | lengkap |
| `scholarship` | — | parsial |
| `simaan` | `/simaan` | lengkap |
| `social-service` | `/social-service` | parsial |
| `student-compliance` | `/student-compliance` | parsial |
| `student-org` | `/student-org` | parsial |
| `students` | `/students` | parsial |
| `suppliers` | `/suppliers` | parsial |
| `syariah` | `/syariah` | parsial |
| `tahfidz` | `/tahfidz` | parsial |
| `takhosus` | `/takhosus` | lengkap |
| `talenta` | `/talenta` | parsial |
| `tatalaksana` | `/tata-laksana` | parsial |
| `teacher-compliance` | `/teacher-compliance` | parsial |
| `units` | `/units` | parsial |
| `upload` | `/upload` | parsial |
| `users` | `/users` | parsial |
| `violations` | `/violations` | parsial |
| `wallet` | `/wallet` | lengkap |
| `wilayah` | `/wilayah` | parsial |

Catatan:

- `scholarship` tidak me-mount router — isinya hanya `scoring.service.ts`
  (helper), bukan modul REST.
- `upload` menyajikan unggahan berkas; `health` adalah probe kesiapan.
- `dashboard-enhancement` dan `finance-enhancement` masih memakai akhiran
  `-enhancement` yang **tidak** sesuai konvensi penamaan (AGENTS.md akar:
  "Names say what the thing is, never its history"); keduanya terdaftar sebagai
  utang di `.claude/memory/known-issues.md`.

## Peta rute web

Segmen rute App Router tingkat atas di `apps/web/src/app`. Kolom "Halaman"
menghitung `page.tsx` di seluruh sub-pohon segmen. Kolom "layout.tsx" menandai
segmen yang menyediakan `MainLayout` untuk seluruh sub-pohonnya (`/e-office`,
`/marketing`, `/parent`, `/reception`); halaman lain membungkus dirinya sendiri.
`/api` hanya berisi `api/health/route.ts`, bukan halaman.

| Segmen | Halaman | layout.tsx |
|---|---|---|
| `/academic-years` | 4 |  |
| `/activities` | 1 |  |
| `/admin` | 1 |  |
| `/admissions` | 2 |  |
| `/alumni` | 6 |  |
| `/analytics` | 8 |  |
| `/announcements` | 1 |  |
| `/api` | 0 |  |
| `/assessment` | 16 |  |
| `/assignments` | 3 |  |
| `/attendance` | 6 |  |
| `/berita` | 2 |  |
| `/calendar` | 3 |  |
| `/campus` | 1 |  |
| `/canteen` | 1 |  |
| `/cbt` | 8 |  |
| `/certificates` | 5 |  |
| `/classes` | 4 |  |
| `/counseling` | 4 |  |
| `/curriculum` | 10 |  |
| `/daily-report` | 6 |  |
| `/dashboard` | 1 |  |
| `/donation` | 4 |  |
| `/dormitories` | 5 |  |
| `/duty-roster` | 3 |  |
| `/e-office` | 6 | ya |
| `/emis` | 1 |  |
| `/extracurricular` | 4 |  |
| `/facilities` | 1 |  |
| `/finance` | 24 |  |
| `/foundation` | 8 |  |
| `/galeri` | 1 |  |
| `/grc-dashboard` | 1 |  |
| `/health` | 5 |  |
| `/homeroom` | 5 |  |
| `/hr` | 17 |  |
| `/ibadah` | 5 |  |
| `/inventory` | 8 |  |
| `/kinerja` | 6 |  |
| `/kitab-progress` | 3 |  |
| `/kontak` | 1 |  |
| `/laundry` | 1 |  |
| `/library` | 6 |  |
| `/lingkungan` | 1 |  |
| `/login` | 1 |  |
| `/marketing` | 4 | ya |
| `/meals` | 5 |  |
| `/muhadatsah` | 4 |  |
| `/muhadhoroh` | 4 |  |
| `/muhasabah` | 3 |  |
| `/musyrif` | 2 |  |
| `/notifications` | 3 |  |
| `/organisasi` | 3 |  |
| `/parent` | 15 | ya |
| `/payroll` | 1 |  |
| `/pengawasan` | 2 |  |
| `/perencanaan` | 3 |  |
| `/permits` | 5 |  |
| `/portfolio` | 1 |  |
| `/practicum` | 3 |  |
| `/procurement` | 6 |  |
| `/profil` | 3 |  |
| `/profile` | 1 |  |
| `/program-unggulan` | 1 |  |
| `/project` | 2 |  |
| `/public` | 5 |  |
| `/quality` | 7 |  |
| `/rapor-pesantren` | 8 |  |
| `/reception` | 4 | ya |
| `/reports` | 2 |  |
| `/research` | 3 |  |
| `/reset-password` | 1 |  |
| `/rewards` | 6 |  |
| `/risk-management` | 3 |  |
| `/schedule` | 1 |  |
| `/settings` | 7 |  |
| `/spmb` | 7 |  |
| `/staff` | 1 |  |
| `/student` | 4 |  |
| `/student-org` | 2 |  |
| `/students` | 11 |  |
| `/syariah` | 2 |  |
| `/tahfidz` | 20 |  |
| `/takhosus` | 11 |  |
| `/talenta` | 5 |  |
| `/tata-laksana` | 2 |  |
| `/teacher` | 1 |  |
| `/tk` | 12 |  |
| `/unauthorized` | 1 |  |
| `/unit` | 2 |  |
| `/unit-usaha` | 2 |  |
| `/units` | 5 |  |
| `/users` | 5 |  |
| `/violations` | 6 |  |
| `/wakaf-infaq` | 1 |  |
| `/wallet` | 2 |  |
| `/wilayah` | 1 |  |

## Alur lintas-modul

- **Sinkronisasi antar-modul lewat `eventBus`** (`apps/api/src/lib/event-bus.ts`,
  event bertipe di `AppEvents`). `notification:send` contohnya menggerakkan
  modul notifications.
- **Panggilan internal frontend** lewat hook React Query di
  `apps/web/src/hooks/*`; hanya jalur yang benar-benar dilayani router API
  (dijaga `apps/api/src/utils/web-api-contract.guard.test.ts`).
- **Kontrak DTO** dibagi dari `@cipansor/shared`; enum basis data dari
  `@prisma/client`.

### Modul yang saling mengimpor

14 modul mengimpor modul lain secara langsung (melanggar aturan "modul
berbicara lewat `eventBus` atau `index.ts`"). Daftar ini diukur dengan grep
`from '@/modules/<lain>'` di seluruh berkas modul:

```
analytics -> notifications
announcements -> dormitories, notifications
assessment -> units
attendance -> dormitories, notifications
chatbot -> notifications
dapodik -> units
dashboard -> tahfidz
emis -> units
foundation -> units
parent -> announcements
permits -> dormitories
roles -> auth
student-compliance -> students
users -> auth
```

## Job terjadwal

`apps/api/src/jobs/*.job.ts` (node-cron, berjalan di dalam proses API, tanpa
lock — asumsi satu instance API). Modul yang memicunya dan jadwalnya ada di
[`ARCHITECTURE.md`](ARCHITECTURE.md):

```
accreditation-reminder      chatbot-escalation-retry   dashboard-metrics
admission-wave-status       chatbot-spend              dashboard-snapshot
asset-depreciation          chatbot-transcript-purge   finance-billing
attendance-follow-up        identity-purge             permit-note-erasure
attendance-pattern          spp-reminder               web-push-dispatch
attendance-register-reminder
```

## Primitif lintas-potong (pakai ulang, jangan bikin lagi)

Semua di `apps/api/src`, rinciannya di [`../apps/api/AGENTS.md`](../apps/api/AGENTS.md):

- `utils/response.ts` — `ApiResponse.success/error/paginated`.
- `middleware/error.ts` — `Errors.*`, `asyncHandler`, `validate`/`validateQuery`.
- `middleware/auth.ts` — `authorize(RoleCode.X)`, `hasPermission`, `isAdmin`, …
- `lib/` — `prisma`, `redis`, `jwt`, `logger`, `event-bus`, `dashboard-metrics`,
  `academic-calendar`, `password-policy`, `google-service-account`.
- `config/publicSiteUrl` / `portalUrl` untuk URL keluar (jangan menyusun sendiri).

## Paket bersama

`packages/shared/src`:

- `types/*.ts` (45 berkas) — DTO per domain (auth, finance, assessment, …).
- `schemas/*.ts` (22 berkas) — skema Zod; diekspor lewat `src/index.ts`.
- Berkas tingkat atas: `index.ts` (barrel), `password-policy.ts`,
  `public-site.ts`, `roles.ts`.

## Verifikasi

Angka di dokumen ini berasal dari perintah berikut (dijalankan dari akar repo):

```bash
# API
ls -d apps/api/src/modules/*/ | wc -l
grep -oE "apiRouter\.use\('/[^']+',\s*[A-Za-z]+\)" apps/api/src/app.ts | grep -v Limiter | wc -l
grep -cE '^model ' apps/api/prisma/schema.prisma
grep -cE '^enum ' apps/api/prisma/schema.prisma
find apps/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l
ls apps/api/src/jobs/*.job.ts | wc -l
for d in apps/api/src/modules/*/; do n=$(basename "$d"); grep -lq "prisma\." "$d$n.routes.ts" "$d$n.controller.ts" 2>/dev/null && echo "$n"; done | wc -l
# Web
find apps/web/src/app -name page.tsx | wc -l
ls apps/web/src/app | wc -l
find apps/web/src/hooks -type f | wc -l
# Bersama
ls packages/shared/src/types/*.ts | wc -l
ls packages/shared/src/schemas/*.ts | grep -v index | wc -l
```

Hitungan "tata letak lengkap/parsial", kolom "Rute ter-mount" dan "modul yang
saling mengimpor" diukur oleh
[`apps/api/src/utils/module-map.guard.test.ts`](../apps/api/src/utils/module-map.guard.test.ts),
yang membaca `docs/MODULE-MAP.md`, `apps/api/src/app.ts` dan pohon
`apps/api/src/modules/*/`. Jalankan dengan:

```bash
pnpm --filter api test module-map.guard
```
