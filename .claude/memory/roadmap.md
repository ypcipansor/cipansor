# Roadmap — what to do next, in order

Ordered backlog as of **2026-09-26**. Defects in detail are in
[`known-issues.md`](./known-issues.md); where the work stands (environments,
what waits on the user, what is in flight) is in [`progress.md`](./progress.md).

Ordering principle: anything that can harm people or data first, then anything
a visitor sees, then correctness, then deliverables, then tidiness. When an
item is done, delete it — git keeps the history. (The long record of closed
items before 2026-09-25 is in the history of this file and of
`docs/ROADMAP.md`.)

## 1. Now — in this order (decided 2026-09-23 → 25)

0. **Architecture audit plan** (report 2026-09-25, linked in `progress.md`;
   decisions in `decisions/istilah-dan-penamaan.md`; the user said "laksanakan"
   on 2026-09-25, so it runs first). Phases, each releasable alone:
   0. guards — done (#560, #562, #563);
   1. reconnect the broken calls area by area (Perizinan done in #564 and
      #568; Asrama in #569 and #571; next Kurikulum, HR
      employees, Sertifikat), delete the 84 dead ones, `services/` and the
      `api-client` alias;
   2. glossary from the user's eight decisions (murid vs santri may change:
      the user is weighing "santri" everywhere — `progress.md`);
   3. consolidate duplicates (tahfidz, report cards, lesson plans,
      P5 → kokurikuler, accounting, depreciation, daily logs, duplicate pages,
      dashboards);
   4. API grouped by context under `/api/v1`, Zod contracts in
      `packages/shared` → `zod-to-openapi` → `openapi-typescript` client, one
      style for actions (`POST /{id}/{verb}`), updates (`PATCH`), aggregates
      (`/summary`) and self (`/me`); Prisma models renamed; multi-file schema;
   5. web route groups, URLs that follow the API, 308s, Indonesian labels;
      the portal becomes Indonesian-only and every public page gets complete
      Indonesian, English and Arabic;
   5b. donations, zakat and wakaf rebuilt to UU 23/2011, UU 41/2004, PSAK 409
      and PSAK 412 — after the yayasan answers the two facts in `progress.md`;
   6. module boundaries enforced by lint, Zod on every mutation, one test
      location, a cron lock, dead models dropped once proven dead;
   7. `docs/ARCHITECTURE.md` rewritten from the result.

1. **Finish the role catalogue.** The pesantren part shipped in #552. Left:
   - a *bidang* attribute for Wakasek;
   - `PESANTREN_ADMIN` — needs a pesantren unit first (see known-issues,
     "Takhosus as a fifth unit");
   - a Panitia SPMB assignment that expires — needs writers of `expires_at`,
     which `decommissioned-modules.guard.test.ts` forbids today, so the guard
     changes in the same PR;
   - relabel "Admin" → "Operator": role names in the seed ("Admin TK Qur'an", …),
     `ROLE_LABELS` on the profile page, the SPMB page copy — plus a small data
     migration for the stored names.
2. **Model A — a permission per feature plus a data scope.** Replaces the legacy
   buckets (`STAFF`, `UNIT_ADMIN`, …) and the per-page `allowedRoles` lists
   with one contract. The five bendahara codes become **one Bendahara role with
   a unit scope** (decided 2026-09-25; no `PESANTREN_BENDAHARA` before then).
   Read filters keyed on `role !== SUPER_ADMIN` need a per-module judgment
   about whether the yayasan board sees across units — `emis` is per-unit on
   purpose (a Dapodik/EMIS export), `paud-report`'s check is an authorization
   gate, not a filter. Decide case by case, never by find-and-replace.
3. **One adaptive `/dashboard` and a scoped `/analytics`.** The three leadership
   dashboards were deleted in #544 because their figures were wrong; what
   remains must show only numbers a query produced, for the caller's scope.
4. **Identity and integrations** (decided 2026-09-23): accounts in Cipansor
   first, then Google Workspace, then Microsoft; SSO in stages; an account is
   removed six months after its owner leaves (the unit admin requests, the
   Super Admin approves). #441 carries the Google/Microsoft work but is not
   mergeable as it stands — it is to be split, when the user says go.

## 2. Before a real launch

The checklist lives outside the repository while it is public (it concerns
accounts and credentials). What is safe to say here: the data is demo data
until real users are onboarded, and the real SPMB dates, fees and units for an
actual intake are the yayasan's decision — the seed's values are placeholders.

## 3. Agreed feature queue (in the order approved)

1. **Validation and rejection rules** across forms and flows.
2. **Complete parent and student data** — occupation, income and family members
   (needed for scholarships and fee relief), CRUD for guardian data, and SPMB →
   active santri only once the registration fee is settled (transfers excepted).
   Jenjang progression TK → SD → SMP → SMA shipped in the #489 split
   (2026-09-14 … 20). Check the rest against `main` before starting.
3. **Fill the empty tables.** 45 of 285 were empty on 2026-09-02 (a real
   `count(*)` per table — `reltuples` reports every never-analysed table as
   empty). Since then 11 tables were dropped and the presentation pack
   (`db:seed:presentasi`) filled many: recount first.
4. **Module audit** — every backend module reachable from the frontend and vice
   versa, and by at least one role. Resolve a module by the API endpoints its
   pages call, not by a route name in a planning document: the PAUD module
   looked missing because it ships under `/tk`, where the old plan wrote
   `/paud`. Three pages that plan named are genuinely absent — `/tk/settings`,
   `/dashboard/performance`, `/dashboard/unit/[id]` — confirm they are wanted
   before building them.

## 4. Deliverables

- **User guide per role, and technical docs** — to be produced through a skill
  (step 4 of the agent-context restructure, see `progress.md`). Decisions that
  still hold: the guide is role-first (each role's chapter covers every module
  it touches); the README becomes lean (overview, tech, install, links) and its
  screenshot gallery moves into the guide; screenshots are regenerated into
  `docs/images`, checking and fixing each page — which doubles as the role/menu
  audit.

## 5. Customer-service chatbot — four gaps

Design and rationale: [`chatbot-design.md`](../../docs/planning/chatbot-design.md).
Retrieval is settled — the whole corpus goes into every prompt (§1 "REVISED
AGAIN" has the numbers and the trigger for revisiting). **Do not reopen it from
taste.**

1. **The eval suite is not in CI.** 36 golden and 23 red-team cases,
   `pnpm --filter api chatbot:eval`, run only when someone remembers. Each run
   costs money, so nightly or pre-release fits better than per-PR.
2. **No persona version history and no eval gate on save.** A Super Admin can
   change the pesantren's public voice with no revision trail.
3. **The golden set is 36 cases against the 50–100 the design asked for.** Grow
   it from `/settings/chatbot/percakapan`, filtered to unanswered questions.
4. **Escalation to the team inbox is unproven end to end** — route, queue,
   scheduler and transport exist; no forwarded question has been seen to
   arrive. `delivered` is not `success`.

Phase 2 (an agent for signed-in users) stays parked. It must call the existing
authorized endpoints as the user, with their **active** role — never a vector
index over the database — and it waits on §3's data quality: an agent restates
whatever the API hands it, fluently, with authority the number has not earned.

## 6. E-Office and electronic signature

Plan and findings: [`EOFFICE_ESIGN_PLAN.md`](../../docs/EOFFICE_ESIGN_PLAN.md).
The signing crypto is good and should not be rebuilt (scrypt-sealed Ed25519
keys, a passphrase never stored, a lifecycle guard). Next, in value order:

1. **PR-5 — PAdES B-B plus RFC 3161 timestamps.** Without a timestamp there is
   no answer to "was the key valid when it signed", which revocation needs.
2. **The rest of the DOCX authoring track** — sign the uploaded bytes (with the
   TTE visualisation stamped on) instead of ignoring them, and a pre-filled
   DOCX template.
3. **PR-6 — a.n. / u.b. / Plt. / Plh.** Blocked on a governance decision.
4. **PR-7 — Arabic** (an embedded Unicode font and a shaping engine).
5. KTP OCR, deliberately last.

Signed naskah are served from their archived bytes (`LetterSignedDocument`),
and `generate-letter-pdf.test.ts` pins the hash of a plain letter: a layout
change that alters it would report every signed letter as altered.

## 7. Smaller open threads

- **SPMB naming, backend half.** The pages moved to `/spmb` in #439 with
  permanent redirects from `/ppdb/*` and `/psb/*`. Left: rename
  `modules/admissions/ppdb-wave.*` → `spmb-wave.*` with its exports and
  `/api/ppdb-waves` paths, retire the `getPSBStats`/`PsbSummary` aliases and
  `/analytics/psb`, keep every old path alive with a permanent redirect, and
  sweep the comments. No data migration — the database holds no `ppdb`/`psb`
  names.
- **Unit history for reports.** `student_unit_enrollments` and
  `utils/student-unit-history.ts` exist and `dashboard` + `dashboard-enhancement`
  already use them, but other reports still filter on `students.unit_id` (the
  unit *now*) — 44 literal `student: { unitId` filters on 2026-09-25 — so a
  santri's TK history moves to SD IT the day they move up. Swap one module per
  PR: analytics/reporting/export next, then assessment analytics, health,
  accreditation, then the rest. Tests that mock the Prisma client must learn
  the new models too; if that bites again, write one shared mock factory. Treat `unitAt()` returning `current` as *unknown* in
  historical reports. Still undecided: a mid-year transfer yields two rows in
  one year — pick "state on a cut-off date" or "both" for annual per-unit
  reports, and write it here.
- **E-mail.** No spend or volume alarm (Google's daily cap is the only limit).
  BIMI is self-asserted, so Gmail will never show the logo; nobody has yet sent
  a test to a Yahoo mailbox. The SPF record's Outlook include is vestigial —
  removing it is the user's call.
- **Turnstile.** A real sign-in from an ordinary (residential) browser has not
  been confirmed; a datacenter probe cannot prove it. Cloudflare's dashboard
  warning that the site "never calls siteverify" is wrong, and the site key is
  baked in at **build** time.
- **Regulation-driven additions:** UU PDP 27/2022 (parental-consent records, a
  privacy policy, data-subject access and erasure, a data-access audit); ISAK
  35 non-profit statements and the UU Yayasan annual-report package; a zakat
  *collection* (muzakki) model beside the existing distribution side.
- **Tidiness:** ~200 racy `isVisible({ timeout })` probes in the e2e specs
  (206 on 2026-09-25); `no-explicit-any` in the API, fixed opportunistically
  per module.

## Operating notes that keep costing time when forgotten

- **A merge is not a deploy.** Before saying a fix is live, read the `commit`
  that `/healthz` reports. To prove a build carries a change, pick a marker the
  change *deleted* — a string the change added may already exist in the old
  build.
- **After switching branches, regenerate before trusting a failure:**
  `pnpm --filter @cipansor/shared build` and `pnpm --filter api db:generate`.
  A stale client imports enums as `undefined`; a stale `shared` makes `tsc`
  report exports that plainly exist. `vitest` can pass while `tsc` fails.
- **CI installs with `--frozen-lockfile`.** A local install is not frozen, so
  lockfile drift passes locally and fails several CI jobs within seconds.
- **The Security job can go red on a PR that changed no code.** `audit:deps`
  asks npm's live advisory endpoint, so a new advisory reds every open PR at
  once. The fix is almost always a pin in the root `package.json`
  `pnpm.overrides`. And green is not "checked": an unreachable endpoint passes
  with a `::warning` annotation — read it, and set `AUDIT_FAIL_ON_UNREACHABLE=1`
  when a release must not ship on an unverified tree.
- **`prisma migrate diff` cannot see triggers, functions or views.**
  `assert_yayasan_organ_exclusive` nearly vanished from the baseline with an
  empty diff. Write such changes by hand and check the database directly.
- **`migrate deploy` runs a script without `DO $…$` statement by statement.**
  A data migration that relies on temporary tables or all-or-nothing must be
  wrapped in `BEGIN;` … `COMMIT;`. Recover a failed replay with
  `prisma migrate resolve --rolled-back <name>`.
- **`tsx` is not in the production image**, so the `.ts` scripts cannot run
  inside the container. Anything scheduled belongs in the API's in-process
  `node-cron` jobs, which also write an `audit_logs` row per run.
- **A smaller backup is not by itself data loss.** `dashboard_history` is pruned
  to the last 24 hours; compare per-table row counts between dumps.
- **Check `/public/spmb` in a browser, not with `curl`.** The server renders the
  pre-hydration state ("Belum Dibuka"); the period arrives on the client.
  `isActive` on a period is administrative intent — whether registration is
  open is always derived from the dates.
- **Never use Playwright's unquoted `text=` for short strings.** It matches a
  case-insensitive substring and the sidebar comes first in the DOM
  (`text=UA` matched "Konsolidasi Keuangan"). `rbac.test.ts` guards it.
- **Never push to `main`** (a ruleset also requires PRs), and never `Write`
  `schema.prisma` wholesale — edit it surgically.
