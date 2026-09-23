## Audit ulang PR #508 — hasil verifikasi terhadap kode di HEAD

Audit dilakukan terhadap HEAD saat sesi dimulai `9ec9216`, diperbarui ke HEAD final `64817df`. Setiap finding diverifikasi dengan membaca implementasi, bukan status/ringkasan lama. Dua commit baru ditambahkan pada sesi ini (`2d56a6f`, `64817df`), di atas commit sesi sebelumnya (`706ba3a`, `0748f88`, `9d32fe7`).

**Koreksi penting atas finding realtime:** otorisasi Socket.IO sekarang menurunkan ruang dari *live/effective* assignment (`effectiveAccessOf` + `isSocketAccountUsable`), bukan snapshot token — sesuai arahan owner. `sendRecentEvents` adalah satu-satunya jalur yang masih memakai `identity.roleCode`; sudah diperbaiki di `64817df`.

### A. Bug aktif

| # | Judul | Status | Root cause | File & baris (sesudah fix) | Regression test | Command & hasil | Commit |
|---|-------|--------|-----------|---------------------------|-----------------|-----------------|--------|
| 1 | Provenance delegasi hilang saat assignment dihapus | valid-fixed (sesi ini diverifikasi) | FK `board_suspension_plh_assignments.assignment_id` `ON DELETE CASCADE` menelan provenance | `apps/api/prisma/migrations/20260923100000_plh_assignment_active_dependency_guard/migration.sql:1-63`; `apps/api/src/modules/roles/roles.service.ts:278-296` | `apps/api/tests/integration/plh-assignment-active-dependency.integration.test.ts` (4 kasus); dedup `plh-assignment-dedup-migration.integration.test.ts` (9) | `RUN_DB_TESTS=1 vitest run tests/integration` → 20 files, **165 passed** | sudah di branch |
| 2 | Laporan terminal bisa ditutup tanpa resolution | valid-fixed | Terminal immutability vs resolusi kosong | `packages/shared/src/schemas/pengawasan.ts:224-258`; `apps/api/src/modules/pengawasan/wbs.service.ts:563-586` | `pengawasan.validation.test.ts`, `wbs.service.test.ts`, e2e `pengawasan-wbs-governance.spec.ts:748` | API unit **2778 passed**; e2e **54 passed** | sudah di branch |
| 3 | Refresh gagal meninggalkan routing cookie → login loop | valid-fixed | tak ada jalur server untuk menghapus cookie HttpOnly saat kredensial sudah invalid | `apps/api/src/modules/auth/auth.controller.ts:328-363`; `auth.routes.ts:92-96`; `apps/web/src/lib/api.ts:224-268`; `apps/api/src/utils/auth-cookies.ts:110-114` | `auth.controller.cookies.test.ts:174-249`, `public-routes-gated.test.ts`, `middleware-rbac.test.ts`, `session-hint.test.ts` | API unit + web unit **469 passed** | sudah di branch (`0748f88`) |
| 4 | Role Pengurus dapat dicabut di tengah suspension | valid-fixed | user-row lock tidak menserialisasi assignment writer | `apps/api/src/modules/pengawasan/board-suspension.service.ts:396-402`; `apps/api/src/utils/role-assignment-lock.ts:1-70` | `board-suspension-concurrency.integration.test.ts` | integration **165 passed** | sudah di branch |
| 5 | Cookie setup 2FA lebih pendek dari temp token | valid-fixed | TTL cookie default `'5m'` terpisah dari TTL token `10m` | `apps/api/src/modules/auth/auth.controller.ts:48-60`; `auth.service.ts:23-24,224-229` | `auth.controller.cookies.test.ts:93-110` (`Max-Age=600`) | API unit pass; strict build `tsc` pass | sudah di branch |
| 6 | Plh `expiresAt` habis saat suspension aktif | valid-fixed | assignment efektif dipakai ulang tanpa perpanjangan/ownership expiry | `apps/api/src/modules/pengawasan/board-suspension.service.ts:592-640` | `plh-assignment-expiry-restore.integration.test.ts` (4 kasus) | integration **165 passed** | sudah di branch |
| 7 | Concurrent refresh → 500 | valid-fixed | `delete({where:{id}})` lempar P2025 → dipetakan 500 | `apps/api/src/modules/auth/auth.service.ts:564-585` | `refresh-token-concurrency.integration.test.ts` | integration **165 passed** | sudah di branch |

### B. Security

| # | Judul | Status | Root cause | File & baris (sesudah fix) | Regression test | Command & hasil | Commit |
|---|-------|--------|-----------|---------------------------|-----------------|-----------------|--------|
| 8 | `optionalAuth` abaikan suspension/account state | valid-fixed | hanya verifikasi signature, tak cek state persisten | `apps/api/src/middleware/auth.ts:275-308` (pakai `isUserSuspended`) | `apps/api/src/middleware/auth-optional.test.ts` | API unit pass | sudah di branch |
| 9 | Teks WBS authenticated tanpa batas maksimum | valid-fixed | handler endpoint tanpa `.max()` | `packages/shared/src/schemas/pengawasan.ts:160-179,238-269` (`WBS_MAX`) | `pengawasan.validation.test.ts` boundary tests | API unit pass | sudah di branch |
| 10 | User suspended masih bisa realtime | valid-fixed | room grant memakai snapshot handshake | `apps/api/src/lib/realtime.ts:295-311` (`isSocketAccountUsable`), re-cek sebelum join/subscribe | `realtime-socket-auth.test.ts` | realtime tests **30 passed** | sudah di branch |
| 11 | Client bisa join arbitrary realtime room | valid-fixed | `join-unit`/`join-role` mempercayai input client | `apps/api/src/lib/realtime.ts:260-280,407-447` (`effectiveAccessOf`, `allowedUnitIds`) | `realtime-scope.test.ts`, `realtime-socket-auth.test.ts` | realtime **30 passed** | sudah di branch |
| 12 | Dashboard realtime terima scope global/arbitrary | valid-fixed | caller-provided `unitId` diterima | `apps/api/src/lib/realtime.ts:448-527` (tolak unitless non-foundation) | `realtime-scope.test.ts` | realtime **30 passed** | sudah di branch |
| 13 | User suspended masih akses uploads | valid-fixed | gate berhenti di signature token | `apps/api/src/middleware/upload.ts:285-304` | `apps/api/src/middleware/upload.test.ts` | API unit pass | sudah di branch |
| 14 | Role switching bisa buat refresh token sesudah suspension | valid-fixed | token dibuat tanpa lock/serialisasi dengan suspension | `apps/api/src/modules/roles/roles.service.ts:410-445` (transaksi + `lockUserAndAssignments`) | `token-issuance-suspension-race.integration.test.ts:208` | integration **165 passed** | sudah di branch |
| 15 | Normal login bisa buat refresh token sesudah suspension | valid-fixed | insert refresh token tak revalidasi state di commit point | `apps/api/src/modules/auth/auth.service.ts:236-272` | `token-issuance-suspension-race.integration.test.ts:155` | integration **165 passed** | sudah di branch |

### C. Investigation

| # | Judul | Status | Bukti / keputusan | File & baris | Test | Hasil | Commit |
|---|-------|--------|-------------------|--------------|------|-------|--------|
| 16 | PLH eligibility mungkin izinkan ordinary staff | valid-fixed | Ditemukan `isPlhEligible`/`PLH_INELIGIBLE_ROLE_CODES`; `PLH_ROLE_CODES` = Ketua/Sekretaris/Bendahara/Anggota; Pembina, Pengawas, Super Admin, role eksternal dikecualikan; `SDIT_GURU` **diizinkan** (staf naik menjadi officeholder Pengurus) — selaras `trg_yayasan_organ_exclusive`. Status quo dipertahankan + test negatif. | `packages/shared/src/types/pengawasan.ts:107-159`; `board-suspension.service.ts:157-166,255-258,589-591` | `pengawasan.roles.test.ts:99-132` | API unit pass | sudah di branch |
| 17 | Endpoint WBS detail orphaned | valid-fixed | `GET /wbs/reports/:id` + `getWbsReportById` tanpa consumer web; dihapus | diff `pengawasan.routes.ts` (blok dihapus) | — | route hilang, build pass | sudah di branch |
| 18 | Lock-order correspondent terhadap role writer | valid-fixed | Satu protokol: users (`ORDER BY id`) → assignment (`ORDER BY id`) | `apps/api/src/utils/role-assignment-lock.ts:1-70`; `correspondence.service.ts:637-663` | `correspondence-generated-draft-recipient-race.integration.test.ts`, `esign-activation-suspension-lock-order.integration.test.ts` | integration **165 passed** | sudah di branch |
| 19 | Default `startDate` lewat validasi date ordering | valid-fixed | `effectiveStart = startDate ?? now`; tolak `projectedEndDate` sebelum effective start | `packages/shared/src/schemas/pengawasan.ts:293-353` | `pengawasan.validation.test.ts` | API unit pass | sudah di branch |
| 20 | Mandatory quality gate belum diverifikasi | valid-fixed | seluruh gate dijalankan (lihat tabel gate) | `AGENTS.md` | — | semua exit 0 | sesi ini |

### D. Informational

| # | Judul | Status | Bukti |
|---|-------|--------|-------|
| 21 | WBS scope consistency | valid-fixed | `loadReportInScope` + `buildScopeWhere` dipakai di get/status/forward/comment (`wbs.service.ts:359-402,477-529`); re-cek di dalam transaksi. Test: `wbs.service.test.ts`, e2e scope 403 untuk out-of-scope. |
| 22 | Dedup preserving existing delegation | valid-fixed (desain benar) | `plh-assignment-dedup-migration.integration.test.ts` (9 kasus): survivor tak ditandai suspension-created, tak ada orphan, lift hanya menghapus yang di-mint. |

### E. Audit tambahan
- **23 (realtime menyeluruh):** seluruh `realtime.ts` diaudit; grant ruang dari identitas live; disconnect + re-cek state. `sendRecentEvents` diperbaiki di `64817df` (`realtime.ts:692-708`). Test realtime **30 passed**.
- **24 (token issuance menyeluruh):** semua tempat membuat token = login, 2FA completion, refresh rotation, role switch; semuanya punya validasi account-state + lock user. Recovery flow tidak menerbitkan sesi. Impersonation tidak ada. Test race integration **165 passed**.
- **25 (role-assignment writers):** protokol tunggal `utils/role-assignment-lock.ts`, dipakai roles + board-suspension + correspondence. Test race integration pass.
- **26 (CSRF + SameSite=Lax):** `assertSameSiteDeployment` fail-fast pada boot cross-site (`config/same-site.ts`, `main.ts:32-37`) + `same-site.test.ts`; transport cookie-first tetap menerima `Authorization` header. Tidak diubah ke `SameSite=None`. Test: `same-site.test.ts`, `auth-cookies.test.ts`.

### Quality gate (command exact & hasil)
| Gate | Command | Exit | Hasil |
|------|---------|------|-------|
| Shared build | `pnpm --filter @cipansor/shared build` | 0 | OK |
| API build | `pnpm --filter api build` | 0 | OK |
| API strict | `pnpm --filter api build:strict` | 0 | OK |
| API unit | `PUBLIC_SITE_URL=https://cipansor.or.id PORTAL_URL=https://portal.cipansor.or.id vitest run` | 0 | **2778 passed**, 170 skipped, 0 failed |
| Web build | `pnpm --filter web build` | 0 | OK (setelah `rm -rf .next` dari cache dev yang basi) |
| Web unit | `pnpm --filter web test` | 0 | **469 passed** |
| Prisma generate | `pnpm --filter api db:generate` | 0 | OK |
| Prisma validate | `prisma validate` | 0 | valid |
| Migrate deploy (DB bersih) | `prisma migrate deploy` ke `cipansor_migrate_clean` | 0 | All migrations applied |
| Integration (PostgreSQL+Redis nyata) | `RUN_DB_TESTS=1 vitest run tests/integration` | 0 | **20 files, 165 passed** |
| E2E (governance/auth/WBS/realtime) | `PW_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium playwright test --project=chromium ...` | 0 | **54 passed**, 1 skipped |
| Lint | `pnpm lint` | 0 | 0 error (warning saja) |

Catatan env: `apps/api/.env` lokal menyetel `PUBLIC_SITE_URL=http://localhost:3000`, sehingga 2 test (`verification-url.test.ts`, `id-card-hmac.test.ts`) gagal bila env tidak di-override. Di CI `.env` tidak ada sehingga default `https://cipansor.or.id` dipakai dan test lulus. Bukan regresi PR.

### File berubah, migration, tree
- Perubahan sesi ini: `apps/api/src/lib/realtime.ts:692-708` dan `apps/api/src/lib/realtime-socket-auth.test.ts`.
- Migration safety: satu migration baru (`20260923100000_plh_assignment_active_dependency_guard`) — trigger `BEFORE DELETE`, aman untuk DB existing (tanpa backfill; hanya menegakkan invariant pada delete berikutnya). Replay DB bersih dibuktikan.
- Working tree: **clean**. LOCAL = REMOTE = `64817df88555c66249d387b89ed886c1062819ac`.

### Sisa risiko / keputusan owner
- **Needs owner decision (dokumentasi, bukan blocker):** apakah staff/`SDIT_GURU` boleh menjadi Plh/Plt. Kode saat ini mengizinkannya secara sadar (naik ke jabatan Pengurus), dengan organ-exclusivity sebagai pengaman. Jika kebijakan yayasan membatasi hanya pada officeholder Pengurus, `PLH_INELIGIBLE_ROLE_CODES` perlu diperluas.
- Tidak ada severe/critical tersisa; tidak ada investigation unresolved kecuali butir di atas.

**Merge readiness:** seluruh severe & critical selesai, investigation diputuskan, dan quality gate (unit, strict typecheck, integration PostgreSQL nyata, migrate deploy DB bersih, e2e) dijalankan hijau. Satu keputusan owner yang tersisa bersifat dokumentasi kebijakan, bukan kegagalan kode.

_This comment was created by an AI agent (OpenHands) on behalf of the reviewer._
