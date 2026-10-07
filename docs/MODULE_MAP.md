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

**93 modules are mounted** (measured 2026-10-07). "Standard layout" means a
common file stem carries all four of `<stem>.routes.ts`, `<stem>.controller.ts`,
`<stem>.service.ts` and `<stem>.schema.ts`, plus an `index.ts`. The stem is
usually `<name>`, but a handful of modules use a singular or otherwise different
stem — `units` → `unit.*`, `dashboard-enhancement` → `dashboard.*`,
`classes` → `class.*`, `students` → `student.*`, `users` → `user.*`,
`academic-years` → `academic-year.*` — and still count. "Prisma in
route/controller" means the layering rule is broken there (routes never call
Prisma). "Cross-module import" means a code file (not a test) reaches into
another module directly — a deep path or the other module's `index.ts` — rather
than through the event bus; the cell names the modules it imports. The list is
still a finding, not a sentence: it says *which* modules are coupled, not
whether the coupling is legitimate (some index-barrel imports are fine).

| Mounted path | Directory | Standard layout | Prisma in route/controller | Cross-module import |
|---|---|---|---|---|
| `/auth` | `auth` | — | — | — |
| `/users` | `users` | — | — | `auth` |
| `/units` | `units` | yes | — | — |
| `/students` | `students` | — | — | `roles` |
| `/classes` | `classes` | — | — | — |
| `/assignments` | `assignments` | — | — | — |
| `/academic-years` | `academic-years` | — | — | — |
| `/attendance` | `attendance` | — | — | `dormitories`, `notifications` |
| `/tahfidz` | `tahfidz` | — | — | — |
| `/dormitories` | `dormitories` | yes | — | — |
| `/permits` | `permits` | — | — | `dormitories`, `notifications` |
| `/violations` | `violations` | — | — | — |
| `/rewards` | `rewards` | — | — | — |
| `/finance` | `finance` | — | — | `notifications` |
| `/foundation` | `foundation` | — | — | `units` |
| `/marketing` | `marketing` | — | — | — |
| `/hr` | `hr` | — | yes | — |
| `/library` | `library` | — | — | — |
| `/health` | `health` | — | — | `attendance`, `roles` |
| `/inventory` | `inventory` | yes | — | `notifications` |
| `/notifications` | `notifications` | yes | yes | — |
| `/messages` | `messages` | — | — | — |
| `/curriculum` | `curriculum` | — | — | — |
| `/assessment` | `assessment` | — | yes | `rapor-pesantren`, `units` |
| `/cbt` | `cbt` | — | yes | — |
| `/alumni` | `alumni` | — | — | — |
| `/analytics` | `analytics` | — | — | `notifications`, `pengawasan` |
| `/parent` | `parent` | — | — | `announcements`, `dormitories`, `ibadah` |
| `/reports` | `reporting` | — | — | — |
| `/roles` | `roles` | — | yes | `auth` |
| `/takhosus` | `takhosus` | yes | — | — |
| `/muhasabah` | `muhasabah` | yes | — | — |
| `/donation` | `donation` | yes | — | — |
| `/admissions` | `admissions` | yes | — | `finance`, `roles` |
| `/wilayah` | `wilayah` | — | — | — |
| `/environment` | `environment` | — | — | — |
| `/kurikulum-merdeka` | `kurikulum-merdeka` | yes | — | — |
| `/facilities` | `facilities` | yes | — | — |
| `/student-compliance` | `student-compliance` | — | yes | `students` |
| `/teacher-compliance` | `teacher-compliance` | — | — | — |
| `/finance-enhancement` | `finance-enhancement` | yes | yes | `scholarship` |
| `/wallet` | `wallet` | yes | — | `finance` |
| `/canteen` | `canteen` | yes | — | `finance`, `finance-enhancement` |
| `/laundry` | `laundry` | yes | — | `finance`, `finance-enhancement` |
| `/payroll` | `payroll` | yes | — | `finance` |
| `/portfolio` | `portfolio` | — | — | — |
| `/ibadah` | `ibadah` | — | — | — |
| `/rapor-pesantren` | `rapor-pesantren` | — | — | `notifications` |
| `/procurement` | `procurement` | — | — | `finance`, `notifications` |
| `/suppliers` | `suppliers` | — | — | — |
| `/upload` | `upload` | — | — | — |
| `/extracurricular` | `extracurricular` | — | — | — |
| `/counseling` | `counseling` | — | — | `notifications` |
| `/duty-roster` | `duty-roster` | — | — | — |
| `/meals` | `meals` | — | — | — |
| `/calendar` | `calendar` | — | — | — |
| `/homeroom` | `homeroom` | — | — | — |
| `/kitab-progress` | `kitab-progress` | — | — | — |
| `/muhadhoroh` | `muhadhoroh` | — | — | — |
| `/muhadatsah` | `muhadatsah` | — | — | — |
| `/emis` | `emis` | — | — | `units` |
| `/dapodik` | `dapodik` | — | — | `units` |
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
| `/daily-report` | `daily-report` | yes | — | `notifications` |
| `/murojaah` | `murojaah` | yes | — | — |
| `/simaan` | `simaan` | yes | — | — |
| `/dashboard-enhancement` | `dashboard-enhancement` | yes | — | — |
| `/sanad` | `sanad-certificate` | yes | — | — |
| `/dashboard` | `dashboard` | yes | — | `tahfidz` |
| `/reception` | `reception` | — | — | — |
| `/announcements` | `announcements` | yes | — | `dormitories`, `notifications` |
| `/chatbot` | `chatbot` | yes | yes | `admissions`, `notifications` |
| `/projects` | `project` | — | — | `notifications` |
| `/perencanaan` | `perencanaan` | — | — | — |
| `/pengawasan` | `pengawasan` | — | — | `perencanaan`, `risk` |
| `/syariah` | `syariah` | — | — | `pengawasan` |
| `/lingkungan` | `lingkungan` | — | — | — |
| `/talenta` | `talenta` | — | — | — |
| `/organisasi` | `organisasi` | — | — | — |
| `/tata-laksana` | `tatalaksana` | — | — | — |
| `/business-units` | `business-unit` | — | — | — |

### Not mounted

| Directory | State |
|---|---|
| `apps/api/src/modules/scholarship` | **No router, but live.** `scoring.service.ts` + its test exist, but there is no `.routes.ts` and nothing in `app.ts` mounts it. It is **not an orphan**: `finance-enhancement` reaches it directly — `finance-enhancement.controller.ts` dynamically imports `scholarshipScoringService` for `POST /finance-enhancement/scholarship-recipients/:id/assess` — and `finance-enhancement` (which owns the `Scholarship`/`ScholarshipRecipient` Prisma models) serves the rest of the scholarship data. So the scoring is reachable through that endpoint; what is missing is a module of its own. Either mount its router or fold the file into `finance-enhancement`. |

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
assumes one API instance.

`SCHEDULER_ENABLED=false` turns off the **scheduler-managed** jobs. It does
**not** turn off everything: `web-push-dispatch` is started separately in
`apps/api/src/main.ts:44-55`, outside the `config.scheduler.enabled` branch, and
is gated only on the VAPID key pair (`config.webPush`) — with none configured
it never starts. The design is deliberate (see the header of
`web-push-dispatch.job.ts`): the switch exists to keep a staging copy from
billing and reminding as if it were live, while push dispatch only relays
notifications that environment's own users already received, to devices
registered on that environment. A staging operator switching the scheduler off
still gets the push dispatcher.

- scheduler-managed (16, the `*.job.ts` files):
  accreditation-reminder, admission-wave-status, asset-depreciation,
  attendance-follow-up, attendance-pattern, attendance-register-reminder,
  chatbot-escalation-retry, chatbot-spend, chatbot-transcript-purge,
  dashboard-metrics, dashboard-snapshot, finance-billing, identity-purge,
  permit-note-erasure, spp-reminder, web-push-dispatch

## Regenerating this map

- Mount table: parse `apps/api/src/app.ts` for
  `apiRouter.use('<prefix>', <var>)` and resolve `<var>` to its
  `@/modules/<dir>` import (a plain default import, or a named/aliased one).
- Standard layout: a module counts when one file stem carries all four of
  `<stem>.routes.ts`, `<stem>.controller.ts`, `<stem>.service.ts`,
  `<stem>.schema.ts` and `index.ts` is present — compare the stems, do not
  assume the stem equals the directory name (`units` → `unit.*`,
  `dashboard-enhancement` → `dashboard.*`, …).
- Prisma in route/controller: `grep -n 'prisma\.' <module>/*.controller.ts
  <module>/*.routes.ts` (test files excluded).
- Cross-module import: for each module's **code** files (not `*.test.ts`, not
  `tests/`), match both `from '../<dir>/…'` and `from '@/modules/<dir>/…'`,
  including `import(…)` and `@/modules/<dir>/<file>` deep paths — a bare
  `@/modules/<dir>` (the module's `index.ts`) counts too. The cell lists the
  modules imported, not just a yes/no.
- Route groups: `find apps/web/src/app -maxdepth 1 -type d`.
- Jobs: `ls apps/api/src/jobs/*.job.ts`.
- Shared: `ls packages/shared/src/{types,schemas}`.

The corrections above were applied after a review (2026-10-07) that caught the
generator's first pass missing several cross-module imports and mis-reading the
layout key; re-run the whole table, not a single cell.
