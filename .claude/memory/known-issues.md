# Known issues — open defects

Open defects only, each rechecked against the code on **2026-09-25**
(asrama and schema entries on 2026-09-26). The
ordered backlog is [`roadmap.md`](./roadmap.md); where the work stands is
[`progress.md`](./progress.md); the system overview is
[`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

- **Fixed → delete the entry.** Git keeps the history; this file is not a
  changelog. (The long record of what was fixed before 2026-09-25 is in the
  history of this file and of `docs/KNOWN_ISSUES.md`.)
- **An entry can be stale.** Check it against `main` before quoting it to
  anyone — this file once called a finished feature "urgent".
- **Nothing sensitive** (`AGENTS.md` → "Where things live"). An authorization
  weakness that is still open is recorded outside the repository until it is
  fixed; say here only that a module needs review.

## Broken flows and wrong figures

- **The web calls API paths that do not exist — 200 distinct calls left**
  (212 when measured on 2026-09-25; Perizinan fixed in #564, the asrama pages
  in #569 and the asrama PR after it; the list is
  `apps/api/src/utils/web-api-contract.baseline.json`, which the contract guard
  keeps honest — it only shrinks; staging answers them "Route … not found").
  Worst felt now: the Kurikulum list
  (`/curriculum/curriculums`), HR employees (`/hr/employees`), every
  Sertifikat page (`/certificates`), parent messages (`/parent/messages`),
  and three pages that write `/api/…` and so call `/api/api/…`
  (`analytics/grc`, `talenta/analytics`, `perencanaan/[id]/activity-dialog`).
  84 more sit in functions nothing imports, mostly `services/`. The Tagihan and
  Types entries below are part of this. Phase 1 of the audit plan fixes it area
  by area; the guard (#563) stops new ones.
- **The staff dashboard's other counters are always 0.** `use-staff-dashboard.ts`
  reads `meta.pagination.total` for health, violations, rewards and students;
  those APIs send other shapes (#564 fixed only the permit counter). The API has
  three pagination shapes (`pagination`, `meta.pagination`, `meta`) — phase 6.
- **`/musyrif/boarding-center` is still mostly sample data** (Social Harmony,
  "4 Musyrif on Duty", alerts, health counts); only the dormitory list and,
  since #564, the permit card and tab are live. The page says so.
- **Permits without a gate code.** Older seeded permits have `code` null, so the
  gate cannot find them once approved. New permits always get one; approving a
  code-less permit should assign one.
- **2FA recovery codes are stored but never accepted.** Enrolment writes
  `twoFactorRecoveryCodes`; no login path reads them, so a user who loses the
  authenticator cannot use them.

- **Tagihan & SPP — the write screens call an API that does not exist.** The
  read screens were fixed in #540; the writes still use the imagined contract
  (`apps/web/src/hooks/use-finance.ts`): "Buat Tagihan" sends `billType` (the
  API wants `paymentTypeId`), "Tagihan Massal" posts to
  `/finance/invoices/bulk` (no such route), "Catat Pembayaran" sends
  `billId`/`paymentMethod` (API: `invoiceId`/`method`), and deleting a payment
  calls `DELETE /finance/payments/:id` (no such route).
- **Notification settings save nothing, and say they did.**
  `apps/web/src/app/notifications/settings/page.tsx` loads a constant
  (`DEFAULT_PREFERENCES`), and its save mutation waits 500 ms and toasts
  "berhasil disimpan" without calling the API. The event bus reads the real
  `preferences.service`, so what a wali sets here is not what is used.
- **Every save error is shown twice, app-wide.** The axios interceptor in
  `apps/web/src/lib/api.ts` toasts every error response, and
  `components/providers/query-provider.tsx` sets `mutations.onError:
  handleQueryError`, which toasts again. Pick one place; do not patch per page.
- **SPMB decision buttons are disabled for the unit admins who may use them.**
  `apps/web/src/app/spmb/registrations/[id]/page.tsx` compares the primary
  role code with `"UNIT_ADMIN"`, which no role code is (`SDIT_ADMIN`,
  `SMPIT_ADMIN`, …). The fix is one line, but it changes who decides
  admissions — see "Waiting on a decision".
- **Kelengkapan Data Santri list.** "Nama Siswa" shows the NIS (the row
  carries `user.name`, the page reads `name`); the summary cards read a
  different shape from what `report/completeness` returns; and the child's NIK
  is shown in full in the table, where UU 27/2022 Ps. 4 asks for minimal
  display of specific personal data.
- **Raport Merdeka on-screen preview** prints a literal letterhead — "SMP
  Cipansor, Jl. Pendidikan No. 123, Kabupaten Bogor" — for every unit
  (`assessment/raport-merdeka/page.tsx`, the preview header). The exported PDF
  is generated server-side.
- **"+ Tambah Sasaran" and "+ Tambah Kegiatan"** (`perencanaan/[id]/page.tsx`)
  show to every reader, including the Pembina, the Pengawas, and anyone on a
  ratified plan. The server refuses correctly; the buttons mislead.
- **`/certificates/verify/[code]` is behind the session wall** (404 on the apex,
  307 → `/login` on the portal), so a verification link cannot serve the people
  it is for. Sanad certificates already point at `/public/verify-sanad`.
  Making this one public first needs a decision on what it discloses.
- **The seed's closing log prints three logins that do not exist**
  (`apps/api/prisma/seed.ts`, the final `console.log` block): `pengawas@`,
  `kepala.sdit@`, `kepala.smpit@`. The accounts created are
  `yayasan.pengawas@`, `sdit.kepala@`, `smpit.kepala@`. Trust
  `packages/shared/src/types/demo-accounts.ts`, not that log.
- **The pager speaks English** in an Indonesian system —
  `components/shared/pagination.tsx` ("Showing 1 to 10 of 14 results", "Rows
  per page"), used by every `DataTable`.
- **Violation and reward "Types" tabs write to nothing.** No `ViolationType` /
  `RewardType` model exists; `/violations/categories` and `/rewards/categories`
  return the bare enum. Either build the models and endpoints, or remove the
  tab and its hooks (`useViolationTypes`, `useRewardTypes` and their mutations).
- **One RKA Yayasan per year is enforced by a `findFirst` only**
  (`perencanaan.service.ts`, `createPlan`), so two concurrent requests can both
  pass. The real fix is a partial unique index — a schema change.

## Access that is too narrow, or needs review

- **Who manages asrama is undecided.** Adding asrama and kamar and placing
  santri admits the super admin, every school's admin (TK's included, whose
  pupils never board) and the yayasan organs — the legacy `UNIT_ADMIN`
  bucket, now named once as `DORMITORY_MANAGER_ROLE_CODES`. The Pimpinan
  Pesantren, who assigns the musyrif (#569), cannot add a kamar, and TU
  Pesantren has no Asrama menu. For the yayasan (`progress.md`).
- **The dormitories module needs a read-scope review.** Its read routes do not
  all apply the same scope check; see the module before widening who reads it.

- **Page gates (`allowedRoles`) disagree with `rbac.ts` on 23 pages.** Most are
  deliberate (`/settings` for one's own profile, `/settings/roles` for Super
  Admin only). To review: `/homeroom/performance` and
  `/rapor-pesantren/config` for TEACHER (wali kelas), and
  `/analytics/parent-engagement` for TEACHER/STAFF. Model A replaces both lists.
- **Some modules still admit whole legacy buckets** (`STAFF` in particular),
  where a feature permission would be narrower. Review module by module under
  Model A; the list is kept outside the repository.
- **"Roles & Permissions" edits a list almost nothing reads** (measured
  2026-09-25). Super Admin can create a role and tick permissions, stored in
  `roles.permissions`, but only 13 API routes check a permission
  (`hasPermission`); 670 check a legacy bucket (`authorize`), menus come from
  `navigation.ts` by role code, and web routes from `rbac.ts` by bucket. A new
  role gets the fallback menu, and unticking a permission does not remove the
  access a bucket grants. Model A (roadmap §1.2) is the fix. Until it lands
  the page says so itself (`PermissionScopeNotice`, 2026-09-25): deactivating
  the account is what revokes access, within the 15-minute token life.

## Waiting on a decision

Measured, and deliberately not decided alone because each changes authority or
opens personal data. Once answered: do it, delete the item, and record the
decision.

1. **Tata Usaha and "Luluskan".** The API lets TU graduate a student
   (`manageAlumni`, #500); the page `students/[id]` admits only
   `SUPER_ADMIN`/`UNIT_ADMIN`/`TEACHER`, so TU is bounced. Widening the page
   opens the student's full personal record to TU.
2. **The `students.nis` column.** #515 dropped its unique index and kept the
   column so the rollback image could still write. Drop it in a release of its
   own, after one full release with no old writer — or keep it as a snapshot.
3. **Who may accept or reject an SPMB applicant** (the disabled buttons above).
4. **Takhosus as a fifth unit** (`UnitType.PESANTREN`, decided 2026-09-13) is
   not built. Until it is, every pesantren role — the Kiai included — is
   assigned in the **SMP IT** unit, and takhosus halaqoh sit under SMA.
5. **Dashboard metrics cadence.** `aggregateDashboardMetrics` runs every minute
   and writes 6 rows a run (`jobs/scheduler.ts`), for figures that move on the
   scale of a class period. Retention was fixed; the cadence is a product call.
6. **Two kepala sekolah in one unit.** The 2026-08-14 e-mail rename put two seed
   families side by side. The seed now has one per unit; the live data was not
   rechecked. Prefer `is_active = false` over deleting, so the audit trail
   survives.

## Design gaps

- **Names that say something other than what the module does** (audit
  2026-09-25, every module): `practicum` is Amaliyah Tadris, `research` is
  Fathul Kutub (shown as "Turats Lab"), `inventory` is fixed assets,
  `student-`/`teacher-compliance` are data completeness,
  `finance-`/`dashboard-enhancement` name their history, `pengawasan`
  (internal audit) reads as the Pengawas organ, `non-formal` is courses,
  `/api/health` is the UKS module while `/health` is the server check, and
  `/assessment/skhun` prints a document not issued since the national exam was
  abolished (2021). 50 English menu labels in an Indonesian UI; 27 paths with
  more than one label. Full table: the audit report linked in `progress.md`.
- **One concept, several modules** (audit 2026-09-25): tahfidz across five
  modules (`takhosus` re-exposes murojaah, simaan, sanad and halaqoh on the same
  tables), report cards in five places, lesson plans in three models, P5 in two
  modules (the term was retired by Permendikdasmen 13/2025 — now
  *kokurikuler*), chart of accounts and journals in `finance` and
  `finance-enhancement`, two monthly-depreciation implementations
  (`jobs/asset-depreciation.job.ts` runs; `inventory/depreciation.service.ts`
  never did), three daily santri logs (`daily-report`, `ibadah`, `muhasabah`),
  and duplicate pages: `/payroll` + `/hr/payroll`, `/wallet` +
  `/finance/wallet`, `/tahfidz/simaan` + `/takhosus/simaan`, three certificate
  pages.
- **The module standard is not followed.**
  22 of 93 modules have all five parts; 12 call Prisma from a route or
  controller; 23 import other modules directly (the rule is the event bus);
  1,457 bare `res.json` against 399 `ApiResponse`; 349 of 562 POST/PUT/PATCH
  routes carry no `validate()`. (`AGENTS.md` and `docs/ARCHITECTURE.md` were
  corrected on 2026-09-25; the code itself is phase 6 of the plan.)
- **Schema and migrations disagree on two points** (measured 2026-09-26 with
  `prisma migrate diff` from a database built by `migrate deploy` to
  `schema.prisma`): `admission_waves.full_by_capacity` is `Boolean?` in the
  schema but `NOT NULL DEFAULT false` in its migration, and the migrations
  create `exam_grade_duplicates_backup`, a one-off backup table the schema
  does not model. Neither came from recent work; a new migration's diff shows
  both and nothing is wrong with it. Make the field `Boolean` and decide
  whether the backup table can be dropped.
- **Scheduled jobs assume one instance.** Ten `node-cron` jobs run inside the
  API process with no lock; scaling the App Service to two instances would send
  SPP reminders twice. Add a `pg_try_advisory_lock` (or a separate worker)
  before any scale-out.

- **Ratification by the yayasan is not modelled collectively.** One Pembina
  account decides, not a meeting. And the header of an `IN_PROGRESS` plan can
  still be edited by its author: there is no per-field rule (realisation may
  change, ratified text may not).
- **Module sprawl, to consolidate by design, not by deletion.**
  `dashboard-enhancement`, `finance-enhancement` and `research` are mounted
  separately and in use (route collisions with `dashboard`, ~34 web call sites
  into `/finance-enhancement`). The six kitab models (`Kitab`, `KitabKuning`,
  `KitabAssignment`, `KitabProgress`, `KitabProgressRecord`,
  `KitabStudentProgress`) want one design, which needs a destructive migration.
  The canonical `/admissions/registrants` page was never built; the SPMB
  registrant UI lives at `/spmb` (the API already has the
  `/admissions/registrants` routes).

## Performance

- **`next/image` has never optimised anything.** Every `/_next/image` request
  returns the source file unchanged at every width: `sharp` does not resolve in
  the standalone output, and the copy in the store is the glibc build on an
  Alpine runner. Measured on the VM image in August; the App Service image is
  built from the same Dockerfile. The fix is a runtime-image change (musl
  `sharp` in the runner, or a glibc base). Until then ship images at display
  size — `galleryThumb()` in `packages/shared/src/public-site.ts` does.

## Tests

- **About a hundred e2e heading assertions are unscoped** (103 by a plain grep,
  2026-09-25). `getByRole("heading", …)` in `apps/web/e2e` without a `<main>`
  scope can match a sidebar group title
  (Ringkasan, Akademik, Keuangan, …) — one test was green for months by
  matching the "Keuangan" group instead of the page. Those using an exact name
  are safe; the regex ones are not. Sweep file by file.
- **Firefox and WebKit fail `page-state-helper.spec.ts:33`** deterministically.
  The matrix is `continue-on-error`, so it does not block; it is not a flake.

## Unverified

- **The PWA install prompt on `portal.cipansor.or.id`.** The apex ships no PWA
  on purpose (#401). On the portal, whether Chrome fires
  `beforeinstallprompt` is unproven. Next step: DevTools → Application →
  Manifest → *Installability* on a real device. Suspects, in order: Chrome's
  engagement threshold (a fresh Incognito window has none), then the manifest's
  `"id": "/"`.

## Deliberate — do not "fix"

- **Public-site translation stops at scripture, domain terms and identifiers.**
  Leaders' mottos and the donation page's hadith and verse stay Indonesian
  (generating Arabic or English would publish a reconstruction as scripture);
  so do Pesantren, SPMB, Wakaf, Infaq, Santri, Tahfidz, Musyrif and the unit
  names, the decree number, NPWP and ministry name, and the recorded values
  ("Hamba Allah", bank details). News bodies are Indonesian, marked `lang="id"`,
  with a line telling the reader. `config/i18n-coverage.test.ts` holds the
  allowlist, each exception with its reason.
- **No self-service "lupa password".** An admin starts a reset (Pengguna → ⋯ →
  *Kirim tautan reset password*), so nothing unauthenticated can make the
  system send mail or reveal which addresses have accounts.
- **The apex has no PWA.** `pwaEnabledForHost` withholds the manifest there,
  because `start_url` is the landing page and the shortcuts 404 on that host.
- **Naskah dinas are verified by uploading the PDF**, not by a token page — a
  token page lets someone substitute content.
