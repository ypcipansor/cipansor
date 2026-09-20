# Quick Start

Orientasi cepat untuk siapa pun yang baru masuk ke repositori Cipansor: apa
isinya, bagaimana menjalankannya, dan ke mana harus membaca berikutnya.

> Dokumen ini menggantikan panduan "Sprint 1" lama yang sudah tidak relevan.
> Untuk gambaran sistem lihat [`ARCHITECTURE.md`](./ARCHITECTURE.md); untuk
> cacat & rencana lihat [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) dan
> [`ROADMAP.md`](./ROADMAP.md).

---

## 1. Apa ini

Sistem Informasi **Yayasan Pesantren Cipansor**: satu platform untuk TK Qur'an,
SD IT, SMP IT, SMA Qur'an, dan pesantren (tahfidz + kurikulum kepesantrenan).
Monorepo pnpm + Turborepo:

| Workspace         | Stack                                                    | Isi                        |
| ----------------- | -------------------------------------------------------- | -------------------------- |
| `apps/api`        | Express 5, Prisma 7, PostgreSQL, Socket.IO, Redis        | REST API + realtime        |
| `apps/web`        | Next.js 16 (App Router), React 19, React Query, Tailwind | Web client + PWA           |
| `packages/shared` | TypeScript + Zod                                         | Kontrak DTO kedua aplikasi |

---

## 2. Menyiapkan lingkungan

```bash
# Prasyarat: Node 20+, pnpm 9 (lewat corepack), PostgreSQL 15+ (atau Docker)

pnpm install

# Environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
#   apps/api/.env        -> DATABASE_URL, JWT_SECRET, REDIS_URL, dll.
#   apps/web/.env.local  -> NEXT_PUBLIC_API_URL (kosongkan agar relatif), API_INTERNAL_URL

# Paket shared harus dibangun lebih dulu (dipakai kedua aplikasi)
pnpm --filter @cipansor/shared build
```

### Stack lokal (Postgres + Redis) tanpa Docker

Jika Docker tersedia, cara tercepat:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Atau pakai PostgreSQL/Redis yang sudah terpasang di mesin Anda, lalu sesuaikan
`DATABASE_URL` / `REDIS_URL` di `apps/api/.env`.

---

## 3. Menyiapkan database

```bash
pnpm --filter api db:generate   # generate Prisma client (wajib setelah edit schema)
pnpm --filter api db:push       # terapkan schema ke DB dev
pnpm --filter api db:seed       # admin + data referensi + 75 akun demo
```

`db:seed` juga membuat **satu akun per `RoleCode`** (75 akun) dengan kata sandi
sama, yang muncul sebagai kartu di halaman `/login`.

---

## 4. Menjalankan

```bash
pnpm dev        # turbo: api + web dalam watch mode
```

- Web: <http://localhost:3000>
- API: <http://localhost:3001> (health: `/health`, docs: `/api/docs`)

Untuk menjalankan hanya salah satu:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

### Login

Buka `/login` dan pilih salah satu kartu akun demo (mis. **Super Admin**), atau
pakai kredensial dari `DEMO_ACCOUNTS` di
`packages/shared/src/types/demo-accounts.ts`. Kata sandi defaultnya adalah
`DEMO_PASSWORD` di berkas yang sama.

---

## 5. Peta kode

### Backend — `apps/api`

Setiap fitur adalah satu modul dengan bentuk seragam:

```
src/modules/<nama>/
  <nama>.routes.ts       # Router + auth/validate -> controller
  <nama>.controller.ts   # tipis; asyncHandler; ApiResponse
  <nama>.service.ts      # logika bisnis; satu-satunya yang menyentuh Prisma
  <nama>.schema.ts       # skema Zod (tipe via z.infer)
  index.ts               # ekspor barrel
  tests/                 # vitest (Prisma dimock)
```

Modul di-mount di `src/app.ts`. Primitif bersama yang **wajib dipakai ulang**:

- `src/utils/response.ts` — `ApiResponse.success/error/paginated`
- `src/middleware/error.ts` — `ApiError`, `Errors.*`, `asyncHandler`, `validate`
- `src/middleware/auth.ts` — `authenticate`, `authorize(RoleCode.X)`, `hasPermission`
- `src/lib/{prisma,redis,jwt,logger,event-bus,realtime}.ts`
- `src/jobs/` — pekerjaan terjadwal (node-cron): snapshot, tagihan, pembersihan

Komunikasi antar-modul lewat `eventBus` bertipe (`AppEvents`), bukan memanggil
service modul lain langsung.

### Frontend — `apps/web`

- Halaman di `src/app/**` (App Router).
- Data lewat instance Axios tunggal `src/lib/api.ts`, dibungkus hook React Query
  di `src/hooks/*`.
- Tipe dari `@cipansor/shared`; jangan deklarasikan ulang atau pakai `any`.
- UI: Tailwind + primitif Radix di `src/components/ui/*`.
- Shell aplikasi: `<MainLayout>` (sidebar, header, `ProtectedRoute`).

### Kontrak bersama — `packages/shared`

DTO/skema Zod yang dipakai kedua aplikasi. Ekspor lewat `src/index.ts`. Setelah
mengubahnya, bangun ulang (`pnpm --filter @cipansor/shared build`) lalu jalankan
ulang build/test kedua aplikasi.

---

## 6. Alur kerja harian

```bash
# 1. Buat branch
git checkout -b feat/fitur-anda

# 2. Kerjakan + tulis test-nya (lihat aturan di AGENTS.md)

# 3. Jalankan gate lengkap sebelum commit
pnpm --filter @cipansor/shared build
pnpm --filter api db:generate
pnpm --filter api build
pnpm --filter api build:strict
pnpm --filter api test
pnpm --filter web build
pnpm --filter web test
pnpm --filter web test:e2e
pnpm format && pnpm lint

# 4. Commit & push, lalu buka PR ke main
```

Jangan pernah push langsung ke `main`, dan jangan menimpa
`apps/api/prisma/schema.prisma` secara keseluruhan (edit dengan bedah lalu
`pnpm --filter api db:generate`).

---

## 7. Verifikasi visual

Dua skrip Playwright menyapu seluruh antarmuka dan menyimpan tangkapan layar,
sekaligus menandai halaman yang kosong, error, atau meluber ke samping:

```bash
cd apps/web

# Seluruh halaman App Router sebagai SUPER_ADMIN
../api/node_modules/.bin/tsx scripts/resolve-dynamic-routes.ts   # sekali, mengisi URL detail
../api/node_modules/.bin/tsx scripts/screenshot-all.ts .qa-all

# Setiap item menu untuk setiap peran (75 akun demo)
../api/node_modules/.bin/tsx scripts/screenshot-roles.ts .qa-screens
```

Hasilnya: berkas PNG per halaman + `report.json`. Ini cara tercepat memastikan
perubahan UI tidak merusak halaman yang jarang dibuka.

---

## 8. Di mana membaca berikutnya

| Topik                              | Dokumen                                            |
| ---------------------------------- | -------------------------------------------------- |
| Konvensi kanonik (wajib dibaca)    | [`AGENTS.md`](../AGENTS.md)                        |
| Peta sistem & alur request         | [`ARCHITECTURE.md`](./ARCHITECTURE.md)             |
| Cacat & technical debt             | [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md)             |
| Rencana kerja                      | [`ROADMAP.md`](./ROADMAP.md)                       |
| Deployment produksi                | [`DEPLOYMENT.md`](./DEPLOYMENT.md)                 |
| Kontrak aplikasi wali (PWA)        | [`MOBILE_API.md`](./MOBILE_API.md)                 |
| Email keluar                       | [`EMAIL_SETUP.md`](./EMAIL_SETUP.md)               |
| E-office & tanda tangan elektronik | [`EOFFICE_ESIGN_PLAN.md`](./EOFFICE_ESIGN_PLAN.md) |

---

## 9. Jika ada yang gagal

```bash
# Build bermasalah — bersihkan lalu ulang
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
pnpm --filter @cipansor/shared build
pnpm --filter api db:generate

# Prisma client tidak sinkron dengan schema
pnpm --filter api db:generate

# Test gagal — jalankan verbose untuk satu berkas
pnpm --filter api test -- <nama-berkas>
pnpm --filter web test:e2e -- <nama-spec>

# Database dev rusak — reset (menghapus data lokal)
pnpm --filter api db:push --force-reset
pnpm --filter api db:seed
```

Kalau masalahnya bertahan, catat di [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md)
alih-alih membiarkannya hilang di percakapan.
