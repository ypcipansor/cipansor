# E2E Coverage Matrix — route × {nav, CRUD, buttons, fields, RBAC}

_Headline count + spec-inventory table re-audited 2026-07-20 from source; the route×dimension matrix cells are upgraded manually only when a spec **proves** the dimension against the real seeded stack (loginAs + no `page.route` interception). The regeneration script the earlier audit cited (`scripts/e2e-coverage.mjs`) does **not** exist in the repo — the table is maintained by hand, so compare it against `ls apps/web/e2e/*.spec.ts` before trusting a count. Reconciled 2026-09-12: five rows named specs that had been deleted, and ten specs had no row at all._

## Summary

- **Routes (App Router pages):** 430
- **Routes visited by ≥1 spec:** 76 (17%)
- **Spec files:** 80 — 79 at `e2e/` plus `cbt/cbt.spec.ts`; every one has a row
  in the inventory below. Active specs authenticate for real (`loginAs` /
  `apiLogin` + `injectSession`) and assert real seeded/API data. Six specs still
  call `page.route` (re-checked 2026-09-12): `grc-live` and `integration-grc`
  (deliberate failure injection to prove an error state), `auth`,
  `chatbot-widget`, `e-office-verify`, and the config-**ignored**
  `verify_reception`. The dev utilities the earlier audit named here
  (`debug-*`, `generate-screenshots`, `verify-screenshots`) have since been
  deleted.

## Verified full-suite run (chromium, real seeded stack — 2026-07-16)

Stack: local Postgres 16 + Redis (`scripts/dev-stack.sh`), `db:push` +
`E2E_FIXED_2FA=1 db:seed`, API dev server + web **production** build
(`next start`; dev-mode Turbopack compile-on-demand times out Playwright's
240s webServer wait — use `pnpm build && pnpm start` locally).

**Final result: 280 passed / 0 failed (2.9m) — fully green.**

History of the stabilization (all root-caused, no suppressions):
1. First honest run: 214 passed / 94 failed — almost every failure was
   `POST /auth/2fa/login → 429`: 4 workers each re-ran login+2FA per spec,
   blowing the strict 10/15min limiter. Fixed by cross-worker session cache
   (`.auth/sessions.json`, written by global-setup, reused while tokens pass
   `/auth/me`) — **the production rate limiter was left untouched.**
2. Second run: 259 passed / 19 failed. Remaining failures traced to specs
   driving the **UI login form as superadmin** (2FA-gated → lands back on
   /login): migrated 24 spec files to `loginAs`.
3. Third run (after migration): 262 passed / 16 failed.
4. Fourth run: 279 passed / 1 failed — global-teardown was deleting the
   `.auth/` session files after every run, which forced fresh admin 2FA
   logins per run and per local iteration (the hidden re-heater of the
   limiter). Teardown now keeps them; global-setup revalidates before reuse.
5. Final run: **280 passed / 0 failed**. Last failure was the dashboard
   stats-card check timing out on the first-paint auth spinner under
   parallel load (probe confirmed 21 cards render) — replaced the 10s
   `isVisible` poll with a proper 20s `toBeVisible` expectation.

**Legend:** ✅ proven against real backend · 🟡 partially exercised (spec exists but mock-based, or dimension only touched) · ❌ not covered

## Matrix

### `/`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/` | landing, perencanaan-finance | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/academic-years`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/academic-years` | academic-years | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/academic-years/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/academic-years/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/academic-years/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/admin`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/admin/marketing` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/admissions`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/admissions` | admissions-funnel | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/admissions/analytics` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/admissions/waves` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/alumni`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/alumni` | alumni, alumni-outcome | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/alumni/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/alumni/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/alumni/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/alumni/placement` | pesantren-features-294-smoke | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/alumni/sanad` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/analytics`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/analytics` | analytics | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/analytics/academic` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/analytics/benchmark` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/analytics/education` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/analytics/export` | analytics | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/analytics/forecast` | analytics | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/analytics/grc` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/analytics/parent-engagement` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/announcements`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/announcements` | announcements | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/assessment`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/assessment` | assessment | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/assessment/[id]` | assessment-analytics | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/assessment/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assessment/[id]/grades` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assessment/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assessment/raport-merdeka` | assessment | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/assessment/raport-merdeka/[studentId]/[academicYearId]/[semester]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assessment/report-cards` | assessment | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/assessment/report-cards/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assessment/report-cards/[id]/print` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assessment/report-cards/[id]/print-merdeka` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assessment/report-cards/generate` | assessment | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/assessment/skhun/[studentId]/[academicYearId]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assessment/transcript/[studentId]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assessment/unified-raport` | rapor-ganda | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/assessment/unified-raport/[studentId]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/assignments`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/assignments` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assignments/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/assignments/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/attendance`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/attendance` | attendance, attendance-module | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/attendance/calendar` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/attendance/heatmap` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/attendance/record` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/calendar`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/calendar` | calendar | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/calendar/events` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/calendar/events/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/canteen`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/canteen` | business-unit-flow, canteen | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/cbt`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/cbt` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/cbt/attempts/[id]/grading` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/cbt/banks` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/cbt/banks/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/cbt/banks/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/cbt/exams` | cbt | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/cbt/exams/[id]/monitoring` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/cbt/exams/new` | cbt | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/certificates`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/certificates` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/certificates/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/certificates/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/certificates/verify` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/certificates/verify/[code]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/classes`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/classes` | classes | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/classes/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/classes/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/classes/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/counseling`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/counseling` | counseling | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/counseling/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/counseling/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/counseling/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/curriculum`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/curriculum` | curriculum | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/curriculum/curriculums/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/curriculums/[id]/add-subject` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/curriculums/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/curriculums/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/merdeka` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/merdeka/p5/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/projects` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/schedules/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/schedules/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/schedules/timetable` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/subjects/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/subjects/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/curriculum/subjects/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/daily-report`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/daily-report` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/daily-report/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/daily-report/bulk` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/daily-report/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/dashboard`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/dashboard` | auth, authenticated-smoke, dashboard-realtime | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| `/dashboard/comparison` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/dashboard/executive` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/dashboard/settings/system-secrets` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/donation`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/donation` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/donation/campaigns/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/donation/campaigns/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/donation/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/dormitories`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/dormitories` | dormitories | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/dormitories/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/dormitories/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/dormitories/[id]/rooms/[roomId]/assign` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/dormitories/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/duty-roster`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/duty-roster` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/duty-roster/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/duty-roster/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/e-office`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/e-office` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/e-office/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/e-office/inbox` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/e-office/letter/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/e-office/outbox` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/emis`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/emis` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/extracurricular`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/extracurricular` | extracurricular | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/extracurricular/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/extracurricular/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/facilities`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/facilities` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/finance`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/finance` | finance-integration | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/finance/accounting` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/accounting/coa` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/accounting/journals/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/billing` | finance-integration | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/finance/bills/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/bills/bulk` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/bills/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/bos` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/budgeting` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/payment-components` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/payments` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/payments/[id]/receipt` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/reports` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/reports/balance-sheet` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/reports/cash-flow` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/reports/cash-flow-forecast` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/reports/general-ledger` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/reports/income-statement` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/reports/trial-balance` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/scholarships` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/spp-matrix` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/verification` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/finance/wallet` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/foundation`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/foundation` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/foundation/accreditation` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/foundation/accreditation/readiness` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/foundation/board/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/foundation/board/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/foundation/dashboard` | business-unit-flow | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/foundation/documents/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/foundation/documents/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/foundation/finance/consolidation` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/grc-dashboard`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/grc-dashboard` | grc-integrated, grc-integration-new, grc-live, integration-grc | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/health`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/health` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/health/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/health/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/health/growth` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/health/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/homeroom`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/homeroom` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/homeroom/attendance` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/homeroom/behavior` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/homeroom/daily-report` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/homeroom/messages` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/homeroom/performance` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/homeroom/students/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/hr`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/hr` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/attendance` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/departments` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/employees` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/employees/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/employees/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/employees/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/leaves` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/leaves/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/leaves/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/payroll` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/payroll/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/payroll/components` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/payroll/periods` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/payroll/periods/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/payroll/staff-salary` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/hr/teachers/compliance` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/ibadah`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/ibadah` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/ibadah/check-in` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/ibadah/leaderboard` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/ibadah/statistics` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/ibadah/targets` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/inventory`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/inventory` | inventory | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/inventory/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/inventory/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/inventory/assignments` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/inventory/audits` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/inventory/audits/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/inventory/maintenance` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/inventory/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/kitab-progress`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/kitab-progress` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/kitab-progress/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/kitab-progress/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/laundry`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/laundry` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/library`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/library` | library | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/library/books/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/library/books/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/library/books/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/library/borrow` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/library/digital` | pesantren-features-294-smoke | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/lingkungan`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/lingkungan` | lingkungan | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/litbang`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/litbang` | litbang | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/litbang/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/login`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/login` | academic-years, alumni, announcements, assessment, attendance, auth, calendar, canteen, classes, counseling, curriculum, dashboard, dormitories, extracurricular, integration-grc, inventory, library, lingkungan, litbang, muhadatsah, organisasi, paud-main, pengawasan, perencanaan, ppdb, pwa, schedule, syariah, tahfidz-transcript, tata-laksana | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/marketing`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/marketing` | student-lifecycle-enhanced | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/marketing/campaigns` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/marketing/leads` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/marketing/leads/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/meals`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/meals` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/meals/menus` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/meals/menus/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/meals/menus/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/meals/menus/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/muhadatsah`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/muhadatsah` | muhadatsah | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/muhadatsah/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/muhadatsah/[id]/evaluate` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/muhadatsah/new` | muhadatsah | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/muhadhoroh`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/muhadhoroh` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/muhadhoroh/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/muhadhoroh/[id]/evaluate` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/muhadhoroh/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/muhasabah`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/muhasabah` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/muhasabah/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/muhasabah/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/musyrif`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/musyrif` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/musyrif/boarding-center` | integrated-boarding-marketing | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/notifications`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/notifications` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/notifications/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/notifications/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/notifications/quick-send` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/notifications/settings` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/notifications/templates` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/notifications/templates/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/notifications/templates/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/notifications/whatsapp` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/organisasi`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/organisasi` | organisasi | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/organisasi/posisi/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/organisasi/struktur` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/parent`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/parent` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/announcements` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/buku-penghubung` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/children` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/counseling` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/daily-report` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/finance` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/health` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/ibadah` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/ibadah/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/messages` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/notifications/preferences` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/permits` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/report-cards` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/report-cards/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/rewards` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/parent/violations` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/payroll`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/payroll` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/pengawasan`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/pengawasan` | grc-integration-new, pengawasan | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/pengawasan/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/perencanaan`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/perencanaan` | perencanaan | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/perencanaan/[id]` | grc-integrated, perencanaan-pengesahan, perencanaan-risk | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/perencanaan/strategy-map` | business-unit-flow | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/permits`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/permits` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/permits/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/permits/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/permits/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/pkg`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/pkg` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/portfolio`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/portfolio` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/ppdb`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/ppdb` | ppdb | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/ppdb/registrations` | admission-to-class-to-finance | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/ppdb/registrations/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/practicum`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/practicum` | new-modular-features-smoke | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/practicum/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/practicum/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/procurement`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/procurement` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/procurement/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/procurement/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/procurement/suppliers` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/procurement/suppliers/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/procurement/suppliers/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/profile`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/profile` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/project`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/project` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/project/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/psb`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/psb` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/public`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/public/donation` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/public/ppdb` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/public/ppdb/track` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/public/verify-sanad` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/quality`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/quality` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/quality/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/quality/audits` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/quality/audits/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/quality/complaints` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/quality/complaints/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/quality/complaints/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/rapor-pesantren`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/rapor-pesantren` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rapor-pesantren/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rapor-pesantren/config` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rapor-pesantren/generate` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rapor-pesantren/leger` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rapor-pesantren/preview` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rapor-pesantren/print/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rapor-pesantren/unified/[id]` | integration-pesantren | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/reception`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/reception` | verify_reception | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/reception/gate` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/reception/guest-books` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/reception/packages` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/reception/visits` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/reports`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/reports` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/reports/builder` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/research`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/research` | new-modular-features-smoke | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/research/submissions/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/research/themes/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/rewards`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/rewards` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rewards/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rewards/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rewards/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rewards/types/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/rewards/types/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/risk-management`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/risk-management` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/risk-management/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/risk-management/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/schedule`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/schedule` | schedule | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/settings`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/settings` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/settings/roles` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/settings/roles/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/settings/roles/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/staff`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/staff` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/student`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/student` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/student/achievements` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/student/exams` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/student/exams/[id]/take` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/student-org`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/student-org` | new-modular-features-smoke | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/student-org/members/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/students`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/students` | _diag, finance-integration, student-management | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| `/students/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/students/[id]/360` | student-lifecycle-enhanced | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/students/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/students/certificates` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/students/compliance` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/students/compliance/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/students/documents` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/students/id-card` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/students/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/students/transcript` | tahfidz-transcript | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/syariah`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/syariah` | grc-integration-new, syariah | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/syariah/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/tahfidz`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/tahfidz` | dashboard | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/tahfidz/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/certificate` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/dashboard` | dashboard-realtime | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/tahfidz/e-simaan` | pesantren-features-294-smoke | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/tahfidz/murojaah` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/murojaah/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/murojaah/analytics` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/murojaah/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/murojaah/schedule` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/quran-map` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/sanad` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/sanad/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/simaan` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/simaan/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/simaan/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/simaan/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tahfidz/simaan/schedule` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/takhosus`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/takhosus` | academic-integrated | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/takhosus/enrollment/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/takhosus/enrollment/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/takhosus/halaqoh` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/takhosus/halaqoh/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/takhosus/halaqoh/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/takhosus/milestones` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/takhosus/simaan` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/takhosus/simaan/[id]/grade` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/takhosus/simaan/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/takhosus/targets` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/talenta`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/talenta` | talenta | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| `/talenta/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/talenta/analytics` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/talenta/matrix` | talent-matrix-new, integration-flow | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/talenta/succession` | academic-integrated | 🟡 | ❌ | 🟡 | 🟡 | ❌ |

### `/tata-laksana`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/tata-laksana` | tata-laksana | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/tata-laksana/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/teacher`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/teacher` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/tk`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/tk` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/assessment` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/assessment/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/assessment/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/assessment/create` | tk-module | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/tk/assessment/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/assessment/progress` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/assessment/student/[studentId]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/daily-reports` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/daily-reports/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/daily-reports/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/daily-reports/check-in` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/daily-reports/class` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/daily-reports/create` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/daily-reports/new` | tk-daily-report | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/tk/daily-reports/parent` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/reports` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/reports/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/reports/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/tk/reports/generate` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/unauthorized`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/unauthorized` | unauthorized | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |

### `/unit-usaha`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/unit-usaha` | business-unit-flow | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| `/unit-usaha/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/units`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/units` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/units/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/units/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/units/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/users`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/users` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/users/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/users/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/users/[id]/roles` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/users/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/violations`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/violations` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/violations/[id]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/violations/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/violations/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/violations/types/[id]/edit` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/violations/types/new` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/wallet`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/wallet` | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/wallet/[studentId]` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

### `/wilayah`

| Route | Specs | Nav | CRUD | Buttons | Fields | RBAC |
|---|---|---|---|---|---|---|
| `/wilayah` | — | ❌ | ❌ | ❌ | ❌ | ❌ |

## Spec inventory (quality classification)

| Spec | Auth | Style | Notes |
|---|---|---|---|
| `academic-integrated.spec.ts` | loginAs | real backend | 2 route(s) visited |
| `academic-years.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `admission-to-class-to-finance.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `admissions-funnel.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `alumni-outcome.spec.ts` | — | public/unauthenticated | 1 route(s) visited |
| `alumni.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `analytics.spec.ts` | — | public/unauthenticated | 3 route(s) visited |
| `announcements.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `assessment-analytics.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `assessment.spec.ts` | loginAs | real backend | 4 route(s) visited |
| `attendance-module.spec.ts` | — | skipped | 1 route(s) visited |
| `attendance.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `auth.spec.ts` | — | skipped | 2 route(s) visited |
| `authenticated-smoke.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `business-unit-flow.spec.ts` | loginAs | real backend | 4 route(s) visited |
| `calendar.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `canteen.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `cbt/cbt.spec.ts` | loginAs | real backend | 4 route(s) visited |
| `chatbot-widget.spec.ts` | — | `page.route` mocks | 2 route(s) visited |
| `class-management.spec.ts` | — | skipped | 0 route(s) visited |
| `classes.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `counseling.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `curriculum.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `dashboard-realtime.spec.ts` | — | public/unauthenticated | 2 route(s) visited |
| `dashboard.spec.ts` | loginAs | real backend | 2 route(s) visited |
| `dormitories.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `e-office-verify.spec.ts` | loginAs | `page.route` mocks | 2 route(s) visited |
| `email-notifications.spec.ts` | loginAs | real backend | 4 route(s) visited |
| `extracurricular.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `finance-forecast.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `finance-integration.spec.ts` | — | public/unauthenticated | 3 route(s) visited |
| `finance-management.spec.ts` | — | skipped | 0 route(s) visited |
| `finance-reports.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `grc-integrated.spec.ts` | loginAs | real backend | 2 route(s) visited |
| `grc-integration-new.spec.ts` | loginAs | real backend | 3 route(s) visited |
| `grc-live.spec.ts` | loginAs | loginAs + injected route | 1 route(s) visited |
| `integrated-boarding-marketing.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `integration-flow.spec.ts` | loginAs | real backend | 2 route(s) visited |
| `integration-flows.spec.ts` | — | skipped | 0 route(s) visited |
| `integration-grc.spec.ts` | loginAs | loginAs + injected route | 1 route(s) visited |
| `integration-pesantren.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `inventory.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `landing.spec.ts` | — | public/unauthenticated | 1 route(s) visited |
| `library.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `lingkungan.spec.ts` | — | public/unauthenticated | 2 route(s) visited |
| `litbang.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `muhadatsah.spec.ts` | loginAs | real backend | 2 route(s) visited |
| `nav-breakpoint.spec.ts` | storageState | real backend | sidebar breakpoints, no goto |
| `new-modular-features-smoke.spec.ts` | — | public/unauthenticated | 3 route(s) visited |
| `organisasi.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `page-state-helper.spec.ts` | — | real backend | pins `settledContent`; no route coverage |
| `paud-main.spec.ts` | loginAs | real backend | 0 route(s) visited |
| `pengawasan.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `perencanaan-finance.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `perencanaan-pengesahan.spec.ts` | apiLogin | real backend | 1 route(s) visited — the yayasan ratification panel per organ and the RKA Unit approval button; the route's other actions stay 🟡 |
| `perencanaan-risk.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `perencanaan.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `performance.spec.ts` | — | real backend | 1 route(s) visited |
| `pesantren-features-294-smoke.spec.ts` | — | public/unauthenticated | 3 route(s) visited |
| `ppdb.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `public-i18n.spec.ts` | — | real backend | 1 route(s) visited |
| `public-photography.spec.ts` | — | real backend | 1 route(s) visited |
| `public-verification.spec.ts` | loginAs | real backend | 2 route(s) visited |
| `pwa.spec.ts` | — | public/unauthenticated | 1 route(s) visited |
| `rapor-ganda.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `risk-audit-link.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `schedule.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `student-lifecycle-enhanced.spec.ts` | loginAs | real backend | 2 route(s) visited |
| `student-management.spec.ts` | — | skipped | 1 route(s) visited |
| `syariah.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `tahfidz-dashboard.spec.ts` | — | skipped | 0 route(s) visited |
| `tahfidz-transcript.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `talent-matrix-new.spec.ts` | loginAs | real backend | 2 route(s) visited |
| `talenta.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `tata-laksana.spec.ts` | loginAs | real backend | 1 route(s) visited |
| `teacher-management.spec.ts` | — | skipped | 0 route(s) visited |
| `tk-daily-report.spec.ts` | — | skipped | 1 route(s) visited |
| `tk-module.spec.ts` | — | skipped | 1 route(s) visited |
| `unauthorized.spec.ts` | — | public/unauthenticated | 1 route(s) visited |
| `verify_reception.spec.ts` | — | `page.route` mocks | 1 route(s) visited |

## How to move a cell to ✅

1. Bring up the real stack: `scripts/dev-stack.sh` then seed with `E2E_FIXED_2FA=1 pnpm --filter api db:seed`.
2. Authenticate via `await loginAs(page, role)` (`e2e/helpers/auth-api.ts`) — never `page.route` interception.
3. Cover the dimension: **Nav** (route renders w/o crash for an allowed role), **CRUD** (create→read→update→delete persisted via UI/API), **Buttons** (every visible action), **Fields** (valid + invalid submit w/ validation assertions), **RBAC** (allowed role sees it; forbidden role is blocked).
4. Flip the cell in this file in the same PR as the spec.
