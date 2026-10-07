# Module map

An always-current index of the code that exists in this monorepo: every API
module and the path it is mounted at, every web route group, the shared
contracts, and the background jobs. It complements
[`ARCHITECTURE.md`](./ARCHITECTURE.md), which explains how the pieces fit
together; this file answers "where does X live, and is it wired up?".

Counts and tables are taken from the working tree. The measured date is in the
header of each section; regenerate after a change that adds or removes a module
or a route group (the commands are at the bottom).

## API modules (`apps/api/src/modules/**`)

Each module is one directory. The API mounts a module in
`apps/api/src/app.ts` as `apiRouter.use('<prefix>', <router>)`; the table below
is the real mount, not the directory name. A module is **not reachable** unless
it appears here.

**93 modules are mounted** (measured 2026-10-07). "Standard layout" means all of
`<name>.routes.ts`, `<name>.controller.ts`, `<name>.service.ts`,
`<name>.schema.ts` and `index.ts` are present. "Prisma in route/controller"
means the layering rule is broken there (routes never call Prisma). "Cross-module
import" means a module file imports another module directly instead of going
through the event bus or the other module's `index.ts`.

| Mounted path | Directory | Standard layout | Prisma in route/controller | Cross-module import |
|---|---|---|---|---|
| `/auth` | `auth` | — | — | — |
| `/users` | `users` | — | — | yes |
| `/units` | `units` | yes | — | — |
| `/students` | `students` | — | — | — |
| `/classes` | `classes` | — | — | — |
| `/assignments` | `assignments` | — | — | — |
| `/academic-years` | `academic-years` | — | — | — |
| `/attendance` | `attendance` | — | — | yes |
| `/tahfidz` | `tahfidz` | — | — | — |
| `/dormitories` | `dormitories` | yes | — | — |
| `/permits` | `permits` | — | — | yes |
| `/violations` | `violations` | — | — | — |
| `/rewards` | `rewards` | — | — | — |
| `/finance` | `finance` | — | — | — |
| `/foundation` | `foundation` | — | — | yes |
| `/marketing` | `marketing` | — | — | — |
| `/hr` | `hr` | — | yes | — |
| `/library` | `library` | — | — | — |
| `/health` | `health` | — | — | — |
| `/inventory` | `inventory` | yes | — | — |
| `/notifications` | `notifications` | yes | yes | — |
| `/messages` | `messages` | — | — | — |
| `/curriculum` | `curriculum` | — | — | — |
| `/assessment` | `assessment` | — | yes | yes |
| `/cbt` | `cbt` | — | yes | — |
| `/alumni` | `alumni` | — | — | — |
| `/analytics` | `analytics` | — | — | yes |
| `/parent` | `parent` | — | — | yes |
| `/reports` | `reporting` | — | — | — |
| `/roles` | `roles` | — | yes | yes |
| `/takhosus` | `takhosus` | yes | — | — |
| `/muhasabah` | `muhasabah` | yes | — | — |
| `/donation` | `donation` | yes | — | — |
| `/admissions` | `admissions` | yes | — | — |
| `/wilayah` | `wilayah` | — | — | — |
| `/environment` | `environment` | — | — | — |
| `/kurikulum-merdeka` | `kurikulum-merdeka` | yes | — | — |
| `/facilities` | `facilities` | yes | — | — |
| `/student-compliance` | `student-compliance` | — | yes | yes |
| `/teacher-compliance` | `teacher-compliance` | — | — | — |
| `/finance-enhancement` | `finance-enhancement` | yes | yes | — |
| `/wallet` | `wallet` | yes | — | — |
| `/canteen` | `canteen` | yes | — | — |
| `/laundry` | `laundry` | yes | — | — |
| `/payroll` | `payroll` | yes | — | — |
| `/portfolio` | `portfolio` | — | — | — |
| `/ibadah` | `ibadah` | — | — | — |
| `/rapor-pesantren` | `rapor-pesantren` | — | — | — |
| `/procurement` | `procurement` | — | — | — |
| `/suppliers` | `suppliers` | — | — | — |
| `/upload` | `upload` | — | — | — |
| `/extracurricular` | `extracurricular` | — | — | — |
| `/counseling` | `counseling` | — | — | — |
| `/duty-roster` | `duty-roster` | — | — | — |
| `/meals` | `meals` | — | — | — |
| `/calendar` | `calendar` | — | — | — |
| `/homeroom` | `homeroom` | — | — | — |
| `/kitab-progress` | `kitab-progress` | — | — | — |
| `/muhadhoroh` | `muhadhoroh` | — | — | — |
| `/muhadatsah` | `muhadatsah` | — | — | — |
| `/emis` | `emis` | — | — | yes |
| `/dapodik` | `dapodik` | — | — | yes |
| `/quality` | `quality` | — | — | — |
| `/correspondence` | `correspondence` | — | — | — |
| `/esign` | `esign` | — | — | — |
| `/risk` | `risk` | — | — | — |
| `/complaints` | `complaints` | — | yes | — |
| `/practicum` | `practicum` | — | yes | — |
| `/student-org` | `student-org` | — | yes | — |
| `/research` | `research` | — | yes | — |
| `/non-formal` | `non-formal` | — | — | — |
| `/social-service` | `social-service` | — | — | — |
| `/performance-agreements` | `performance-management` | — | — | — |
| `/paud-assessment` | `paud-assessment` | yes | — | — |
| `/paud-report` | `paud-report` | yes | — | — |
| `/daily-report` | `daily-report` | yes | — | — |
| `/murojaah` | `murojaah` | yes | — | — |
| `/simaan` | `simaan` | yes | — | — |
| `/dashboard-enhancement` | `dashboard-enhancement` | yes | — | — |
| `/sanad` | `sanad-certificate` | yes | — | — |
| `/dashboard` | `dashboard` | yes | — | yes |
| `/reception` | `reception` | — | — | — |
| `/announcements` | `announcements` | yes | — | yes |
| `/chatbot` | `chatbot` | yes | yes | yes |
| `/projects` | `project` | — | — | — |
| `/perencanaan` | `perencanaan` | — | — | — |
| `/pengawasan` | `pengawasan` | — | — | — |
| `/syariah` | `syariah` | — | — | — |
| `/lingkungan` | `lingkungan` | — | — | — |
| `/talenta` | `talenta` | — | — | — |
| `/organisasi` | `organisasi` | — | — | — |
| `/tata-laksana` | `tatalaksana` | — | — | — |
| `/business-units` | `business-unit` | — | — | — |

### Not mounted

| Directory | State |
|---|---|
| `apps/api/src/modules/scholarship` | **Orphan.** `scoring.service.ts` + its test exist, but there is no `.routes.ts` and nothing in `app.ts` references it. Scholarship data is served by `finance-enhancement` (which owns the `Scholarship`/`ScholarshipRecipient` Prisma models). Either mount it or fold it into `finance-enhancement`. |

## Web route groups (`apps/web/src/app/**`)

Next.js App Router. A route group is a directory under `src/app`. "Own
`layout.tsx`" marks the four subtrees that supply their own shell
(`/parent`, `/marketing`, `/e-office`, `/reception`) — their pages do not
self-wrap in `MainLayout`.

**97 route groups** (measured 2026-10-07).

| Route | `page.tsx` files | Own `layout.tsx` |
|---|---|---|
| `/academic-years` | 4 | — |
| `/activities` | 1 | — |
| `/admin` | 1 | — |
| `/admissions` | 2 | — |
| `/alumni` | 6 | — |
| `/analytics` | 8 | — |
| `/announcements` | 1 | — |
| `/api` | 0 | — |
| `/assessment` | 16 | — |
| `/assignments` | 3 | — |
| `/attendance` | 6 | — |
| `/berita` | 2 | — |
| `/calendar` | 3 | — |
| `/campus` | 1 | — |
| `/canteen` | 1 | — |
| `/cbt` | 8 | — |
| `/certificates` | 5 | — |
| `/classes` | 4 | — |
| `/counseling` | 4 | — |
| `/curriculum` | 10 | — |
| `/daily-report` | 6 | — |
| `/dashboard` | 1 | — |
| `/donation` | 4 | — |
| `/dormitories` | 5 | — |
| `/duty-roster` | 3 | — |
| `/e-office` | 6 | yes |
| `/emis` | 1 | — |
| `/extracurricular` | 4 | — |
| `/facilities` | 1 | — |
| `/finance` | 24 | — |
| `/foundation` | 8 | — |
| `/galeri` | 1 | — |
| `/grc-dashboard` | 1 | — |
| `/health` | 5 | — |
| `/homeroom` | 5 | — |
| `/hr` | 17 | — |
| `/ibadah` | 5 | — |
| `/inventory` | 8 | — |
| `/kinerja` | 6 | — |
| `/kitab-progress` | 3 | — |
| `/kontak` | 1 | — |
| `/laundry` | 1 | — |
| `/library` | 6 | — |
| `/lingkungan` | 1 | — |
| `/login` | 1 | — |
| `/marketing` | 4 | yes |
| `/meals` | 5 | — |
| `/muhadatsah` | 4 | — |
| `/muhadhoroh` | 4 | — |
| `/muhasabah` | 3 | — |
| `/musyrif` | 2 | — |
| `/notifications` | 3 | — |
| `/organisasi` | 3 | — |
| `/parent` | 15 | yes |
| `/payroll` | 1 | — |
| `/pengawasan` | 2 | — |
| `/perencanaan` | 3 | — |
| `/permits` | 5 | — |
| `/portfolio` | 1 | — |
| `/practicum` | 3 | — |
| `/procurement` | 6 | — |
| `/profil` | 3 | — |
| `/profile` | 1 | — |
| `/program-unggulan` | 1 | — |
| `/project` | 2 | — |
| `/public` | 5 | — |
| `/quality` | 7 | — |
| `/rapor-pesantren` | 8 | — |
| `/reception` | 4 | yes |
| `/reports` | 2 | — |
| `/research` | 3 | — |
| `/reset-password` | 1 | — |
| `/rewards` | 6 | — |
| `/risk-management` | 3 | — |
| `/schedule` | 1 | — |
| `/settings` | 7 | — |
| `/spmb` | 7 | — |
| `/staff` | 1 | — |
| `/student` | 4 | — |
| `/student-org` | 2 | — |
| `/students` | 11 | — |
| `/syariah` | 2 | — |
| `/tahfidz` | 20 | — |
| `/takhosus` | 11 | — |
| `/talenta` | 5 | — |
| `/tata-laksana` | 2 | — |
| `/teacher` | 1 | — |
| `/tk` | 12 | — |
| `/unauthorized` | 1 | — |
| `/unit` | 2 | — |
| `/unit-usaha` | 2 | — |
| `/units` | 5 | — |
| `/users` | 5 | — |
| `/violations` | 6 | — |
| `/wakaf-infaq` | 1 | — |
| `/wallet` | 2 | — |
| `/wilayah` | 1 | — |

## Shared contracts (`packages/shared/src`)

Framework-agnostic DTOs and Zod schemas consumed by both apps. DB enums and
models come from `@prisma/client`, not from here.

- **Types** (`src/types/`): admissions, analytics, assessment, assignment, attendance, auth, calendar, chatbot, class, correspondence, counseling, daily-report, dashboard, demo-accounts, enums, environment, finance, foundation-dashboard, health, inventory, letter-naskah, letter-revocation-authority, letter-template, library, marketing, messages, models, notifications, office-holders, paud, performance, practicum, procurement, quality, reception, research, schedule, session, student-id-card, student-org, student-status, supplier, tahfidz, takhosus, unit
- **Schemas** (`src/schemas/`): accreditation, admissions, announcements, assessment, attendance, board-member, correspondence, curriculum, daily-report, donation, dormitories, extracurricular, homeroom, index, musyrif-assignments, notifications, performance, permits, planning, raport-merdeka, student-compliance, student, unit

## Background jobs (`apps/api/src/jobs/`)

`node-cron` jobs that run **inside the API process with no lock** — the design
assumes one API instance. `SCHEDULER_ENABLED=false` turns them off.

- accreditation-reminder, admission-wave-status, asset-depreciation, attendance-follow-up, attendance-pattern, attendance-register-reminder, chatbot-escalation-retry, chatbot-spend, chatbot-transcript-purge, dashboard-metrics, dashboard-snapshot, finance-billing, identity-purge, permit-note-erasure, spp-reminder, web-push-dispatch

## Regenerating this map

- Mount table: parse `apps/api/src/app.ts` for
  `apiRouter.use('<prefix>', <var>)` and resolve `<var>` to its
  `@/modules/<dir>` import.
- Route groups: `find apps/web/src/app -maxdepth 1 -type d`.
- Jobs: `ls apps/api/src/jobs/*.job.ts`.
- Shared: `ls packages/shared/src/{types,schemas}`.
