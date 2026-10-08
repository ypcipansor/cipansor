# Module map

Where every module, route, job and shared contract lives, derived from the code
itself. This is the "map" the task asked to keep current; the prose overview and
the conventions live in [`ARCHITECTURE.md`](ARCHITECTURE.md) and the `AGENTS.md`
files.

Because a hand-written map drifts, the tables below are **generated from the
tree**, not typed from memory. Each figure is tied to the command that produces
it, so anyone can re-measure and correct it. Figures measured **2026-10-08** on
`main` at commit `ab922df`.

Nothing here is a contract change: this file is documentation only. Every
`apps/api/**` module named below exists as a directory under
`apps/api/src/modules/`; every path is a real `apiRouter.use(...)` mount in
`apps/api/src/app.ts`; every web route is a real directory under
`apps/web/src/app/`.

## How the figures were measured

```bash
# API module directories and their mount paths
ls -d apps/api/src/modules/*/
grep -n "apiRouter.use(" apps/api/src/app.ts

# Layout completeness: a module is `full` when all four files exist
for d in apps/api/src/modules/*/; do
  n=$(basename "$d")
  ls "$d" | grep -qE "^${n}\.routes\.ts$"     && \
  ls "$d" | grep -qE "\.controller\.ts$"      && \
  ls "$d" | grep -qE "\.service\.ts$"         && \
  ls "$d" | grep -qE "\.schema\.ts$" && echo "$n full" || echo "$n partial"
done

# Web routes and public-host prefixes
find apps/web/src/app -name page.tsx | wc -l
find apps/web/src/app -maxdepth 1 -mindepth 1 -type d | wc -l
grep -n "publicPrefixes" -A 20 apps/web/middleware.ts
grep -n "PUBLIC_PATH_PREFIXES" -A 40 apps/web/src/lib/host-split.ts

# Jobs, hooks and shared contracts
ls apps/api/src/jobs/*.job.ts
ls apps/web/src/hooks/*.ts
ls packages/shared/src/types/*.ts packages/shared/src/schemas/*.ts
```

## API (`apps/api/src/modules`)

**94 module directories**, of which **93 are mounted** in `app.ts` under the
global `/api` prefix (`app.use('/api', apiRouter)`, `app.ts:473`). One module
ships without a router mount:

- `scholarship` — `scoring.service.ts` only (a cross-module scoring helper
  consumed by other modules), no `*.routes.ts`; deliberately not an endpoint.

### Layout completeness (measured 2026-10-08)

The required layout is `<name>.routes.ts` + `<name>.controller.ts` +
`<name>.service.ts` + `<name>.schema.ts` (`apps/api/AGENTS.md`).

| Layout | Modules |
|---|---|
| All four files present (`full`) | **67** |
| Missing at least one of the four (`partial`) | **27** |

The 27 `partial` modules are: `cbt`, `dapodik`, `environment`, `lingkungan`,
`messages`, `non-formal`, `organisasi`, `parent`, `pengawasan`, `perencanaan`,
`performance-management`, `practicum`, `procurement`, `reporting`, `research`,
`risk`, `scholarship`, `social-service`, `student-compliance`, `student-org`,
`suppliers`, `syariah`, `talenta`, `tatalaksana`, `teacher-compliance`,
`upload`, `wilayah`. Several are complete in spirit but route through a
differently-named file (e.g. `performance-management` names its files
`pk.routes.ts` / `evaluation.controller.ts`); others genuinely lack a layer.
This is the same "rule, not yet state" the root `AGENTS.md` records — the map
states the current count so the next fix has a baseline to shrink.

### Cross-module coupling

- **12 route/controller files reference the Prisma client directly**:
  `assessment`, `cbt`, `chatbot`, `complaints`, `finance-enhancement`, `hr`,
  `notifications`, `practicum`, `research`, `roles`, `student-compliance`,
  `student-org` — the layering rule says only the service layer may touch
  Prisma, so these are the places to move it behind a service.
- **20 modules reach into another module's `*.service.ts` file** rather than
  its `index.ts`: `admissions`, `analytics`, `assessment`, `canteen`, `chatbot`,
  `counseling`, `finance`, `health`, `inventory`, `laundry`, `parent`, `payroll`,
  `pengawasan`, `permits`, `procurement`, `project`, `rapor-pesantren`,
  `syariah`, `users`, `wallet`. `AGENTS.md` requires cross-module calls to go
  through the typed `eventBus` or a module's `index.ts`; `finance` and
  `notifications` are the most common targets. (A naive import scan finds more
  modules importing *something* from another module's directory — most are
  type-only or `index.ts` imports and are fine; only the `*.service` imports
  break the rule. A grep for `@/modules/*/[a-z.-]*.service` alone misses the
  relative-path form, which is the majority.)

## API module inventory

`mount` is the path passed to `apiRouter.use` (all under `/api`); `layout` is
`full` when all four standard files exist, `partial` otherwise.

| Module dir | Mount path | Layout |
|---|---|---|
| `academic-years` | /academic-years | full |
| `admissions` | /admissions | full |
| `alumni` | /alumni | full |
| `analytics` | /analytics | full |
| `announcements` | /announcements | full |
| `assessment` | /assessment | full |
| `assignments` | /assignments | full |
| `attendance` | /attendance | full |
| `auth` | /auth | full |
| `business-unit` | /business-units | full |
| `calendar` | /calendar | full |
| `canteen` | /canteen | full |
| `cbt` | /cbt | partial |
| `chatbot` | /chatbot | full |
| `classes` | /classes | full |
| `complaints` | /complaints | full |
| `correspondence` | /correspondence | full |
| `counseling` | /counseling | full |
| `curriculum` | /curriculum | full |
| `daily-report` | /daily-report | full |
| `dapodik` | /dapodik | partial |
| `dashboard` | /dashboard | full |
| `dashboard-enhancement` | /dashboard-enhancement | full |
| `donation` | /donation | full |
| `dormitories` | /dormitories | full |
| `duty-roster` | /duty-roster | full |
| `emis` | /emis | full |
| `environment` | /environment | partial |
| `esign` | /esign | full |
| `extracurricular` | /extracurricular | full |
| `facilities` | /facilities | full |
| `finance` | /finance | full |
| `finance-enhancement` | /finance-enhancement | full |
| `foundation` | /foundation | full |
| `health` | /health | full |
| `homeroom` | /homeroom | full |
| `hr` | /hr | full |
| `ibadah` | /ibadah | full |
| `inventory` | /inventory | full |
| `kitab-progress` | /kitab-progress | full |
| `kurikulum-merdeka` | /kurikulum-merdeka | full |
| `laundry` | /laundry | full |
| `library` | /library | full |
| `lingkungan` | /lingkungan | partial |
| `marketing` | /marketing | full |
| `meals` | /meals | full |
| `messages` | /messages | partial |
| `muhadatsah` | /muhadatsah | full |
| `muhadhoroh` | /muhadhoroh | full |
| `muhasabah` | /muhasabah | full |
| `murojaah` | /murojaah | full |
| `non-formal` | /non-formal | partial |
| `notifications` | /notifications | full |
| `organisasi` | /organisasi | partial |
| `parent` | /parent | partial |
| `paud-assessment` | /paud-assessment | full |
| `paud-report` | /paud-report | full |
| `payroll` | /payroll | full |
| `pengawasan` | /pengawasan | partial |
| `perencanaan` | /perencanaan | partial |
| `performance-management` | /performance-agreements | partial |
| `permits` | /permits | full |
| `portfolio` | /portfolio | full |
| `practicum` | /practicum | partial |
| `procurement` | /procurement | partial |
| `project` | /projects | full |
| `quality` | /quality | full |
| `rapor-pesantren` | /rapor-pesantren | full |
| `reception` | /reception | full |
| `reporting` | /reports | partial |
| `research` | /research | partial |
| `rewards` | /rewards | full |
| `risk` | /risk | partial |
| `roles` | /roles | full |
| `sanad-certificate` | /sanad | full |
| `scholarship` | — | partial |
| `simaan` | /simaan | full |
| `social-service` | /social-service | partial |
| `student-compliance` | /student-compliance | partial |
| `student-org` | /student-org | partial |
| `students` | /students | full |
| `suppliers` | /suppliers | partial |
| `syariah` | /syariah | partial |
| `tahfidz` | /tahfidz | full |
| `takhosus` | /takhosus | full |
| `talenta` | /talenta | partial |
| `tatalaksana` | /tata-laksana | partial |
| `teacher-compliance` | /teacher-compliance | partial |
| `units` | /units | full |
| `upload` | /upload | partial |
| `users` | /users | full |
| `violations` | /violations | full |
| `wallet` | /wallet | full |
| `wilayah` | /wilayah | partial |
## Web (`apps/web/src/app`)

**432 `page.tsx` route files** across **97 top-level route directories** (96 app
areas plus `api/`, which holds only `health/route.ts`). Lines count, not
"screens": a page under `[id]/edit` is its own `page.tsx`.

Top-level route directories, exactly as they appear in the tree:

```
academic-years activities admin admissions alumni analytics announcements api
assessment assignments attendance berita calendar campus canteen cbt certificates
classes counseling curriculum daily-report dashboard donation dormitories
duty-roster e-office emis extracurricular facilities finance foundation galeri
grc-dashboard health homeroom hr ibadah inventory kinerja kitab-progress kontak
laundry library lingkungan login marketing meals muhadatsah muhadhoroh muhasabah
musyrif notifications organisasi parent payroll pengawasan perencanaan permits
portfolio practicum procurement profil profile program-unggulan project public
quality rapor-pesantren reception reports research reset-password rewards
risk-management schedule settings spmb staff student student-org students syariah
tahfidz takhosus talenta tata-laksana teacher tk unauthorized unit unit-usaha
units users violations wakaf-infaq wallet wilayah
```

Files at the app root (not directories): `layout.tsx` (the root shell),
`page.tsx` (the landing page), `error.tsx`, `not-found.tsx`, `sitemap.ts`,
`globals.css`, `favicon.ico`.

### Layouts / shells

Every authenticated page renders its own `<MainLayout>` shell **except** under
the four subtrees that own a `layout.tsx` (`apps/web/AGENTS.md`):

| Layout file | Subtree |
|---|---|
| `app/layout.tsx` | the whole app (root providers) |
| `app/e-office/layout.tsx` | `/e-office/*` |
| `app/marketing/layout.tsx` | `/marketing/*` |
| `app/parent/layout.tsx` | `/parent/*` |
| `app/reception/layout.tsx` | `/reception/*` |

### Public host vs portal host

Two lists decide what an anonymous visitor may reach, and a sync test
(`src/lib/host-split.test.ts`) fails when they diverge. Both are, verbatim:

`apps/web/middleware.ts` → `publicPrefixes`, and
`apps/web/src/lib/host-split.ts` → `PUBLIC_PATH_PREFIXES`:

```
/profil  /program-unggulan  /unit  /campus  /activities  /berita  /galeri
/wakaf-infaq  /kontak  /verifikasi  /public/verify-card
```

(`/verifikasi` is a permanent 308 to `/public/verify-letter` — the printed QR
path. `/public/verify-card` is a `/public/*` page the middleware matcher already
exempts; it is listed so the two canonical lists agree.)

### Web data layer and support code

- Axios client `src/lib/api.ts` (`baseURL` already ends in `/api`), errors via
  `src/lib/api-error.ts`. `src/lib/api-client.ts` is a back-compat re-export.
- **123 hook modules** — 120 under `src/hooks/*.ts` plus 3 under its three
  subdirectories (`research/`, `practicum/`, `student-org/`); 9 further
  `*.test.*` files sit beside them (126 `.ts` in total). This is the only place
  pages call the API.
- Legacy `src/services/*` (`attendance`, `auth`, `dashboard`, `finance`,
  `notifications`, `students`, `tahfidz`, `types`, `index`) is being removed
  (`apps/web/AGENTS.md`); do not add to it.
- `src/components/*` holds the UI: grouped by domain (e.g. `students`,
  `finance`, `tahfidz`, `dashboard`, `e-office`), with shared primitives under
  `components/ui` and charts under `components/charts`.
- Guard tests live beside the code in `src/lib/*.test.ts` (`rbac`, `host-split`,
  `security-headers`, `session-token.guard`, `dead-links`, …).

## Shared (`packages/shared/src`)

Single source of truth for API/DTO contracts (the root `AGENTS.md` rule 8).
**No Prisma enum or model lives here** — those come from `@prisma/client`.

| Kind | Files | Contents |
|---|---|---|
| `types/*.ts` | **45** | domain DTO interfaces |
| `schemas/*.ts` | **23** | 22 domain Zod schemas (+ `z.infer` types) plus the `index.ts` barrel |

The 45 type modules: `admissions`, `analytics`, `assessment`, `assignment`,
`attendance`, `auth`, `calendar`, `chatbot`, `class`, `correspondence`,
`counseling`, `daily-report`, `dashboard`, `demo-accounts`, `enums`,
`environment`, `finance`, `foundation-dashboard`, `health`, `inventory`,
`letter-naskah`, `letter-revocation-authority`, `letter-template`, `library`,
`marketing`, `messages`, `models`, `notifications`, `office-holders`, `paud`,
`performance`, `practicum`, `procurement`, `quality`, `reception`, `research`,
`schedule`, `session`, `student-id-card`, `student-org`, `student-status`,
`supplier`, `tahfidz`, `takhosus`, `unit`.

The 22 domain Zod schema modules (the 23rd `.ts` file is the `index.ts`
barrel): `accreditation`, `admissions`, `announcements`,
`assessment`, `attendance`, `board-member`, `correspondence`, `curriculum`,
`daily-report`, `donation`, `dormitories`, `extracurricular`, `homeroom`,
`musyrif-assignments`, `notifications`, `performance`, `permits`,
`planning`, `raport-merdeka`, `student-compliance`, `student`, `unit`.

Every public type/schema is re-exported through `src/index.ts`.

## Scheduled jobs (`apps/api/src/jobs`)

**16 `*.job.ts` files**, all scheduled from `jobs/scheduler.ts` via node-cron,
inside the API process. There is **no lock**: the design assumes one API
instance, and a second would run each job twice. `SCHEDULER_ENABLED=false`
switches them off (staging). The 16 jobs:

```
accreditation-reminder   admission-wave-status     asset-depreciation
attendance-follow-up     attendance-pattern        attendance-register-reminder
chatbot-escalation-retry chatbot-spend             chatbot-transcript-purge
dashboard-metrics        dashboard-snapshot        finance-billing
identity-purge           permit-note-erasure       spp-reminder
web-push-dispatch
```

## How this map stays honest

- It is **documentation only**, so a change here is classified non-code by
  `.github/scripts/change-scope.sh` and skips CI, tests and the staging rebuild.
- It is **not read by any test**, so it does not have to be added to the first
  branch of `is_code()` (the `change-scope.guard.test.ts` rule applies only to
  markdown a test reads).
- Regenerate a section by re-running the matching command above and comparing;
  when a figure moves, update it **and the date/commit stamp at the top**.
