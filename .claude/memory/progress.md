# Progress — where the work stands

Updated **2026-09-25**. What a new session needs to pick up the thread, newest
first. Keep it short: finished work belongs to git history, and the ordered
backlog to [`roadmap.md`](roadmap.md).

## Environments

- **Production** — `cipansor.or.id`, Azure App Service since 2026-09-24. A
  release needs the user's explicit approval every time, and
  releases the SHA staging reports at `/healthz`, not the head of `main`.
  Migrations run when the container starts (`MIGRATE_ON_START`).
- **Staging** — `staging.cipansor.or.id`, demo data only, deploys every `main`
  on which CI and E2E (Chromium) pass. At `24068dc9` on 2026-09-25.

## Waiting on the user

- Approval for the next production release. (Which fixes production still
  lacks is for the machine-local memory, not here — see "Where things live".)
- Role catalogue items decided but not built: a *bidang* attribute for Wakasek,
  `PESANTREN_ADMIN` (needs a pesantren unit first — every pesantren role is
  scoped to SMP IT today), a Panitia SPMB assignment that expires, and the
  "Admin" → "Operator" label.
- One Bendahara role with a unit scope waits for Model A (decided 2026-09-25).
- **Who decides a learner's leave.** Since #564: unit admin, kepala sekolah,
  Pimpinan Pesantren and super admin — no yayasan organ. Open: should the
  musyrif decide leave from the asrama? (One line in
  `packages/shared/src/schemas/permits.ts`.)
- **Two facts for the ZIS and wakaf build:** the yayasan's zakat status (UPZ
  of which BAZNAS, a licensed LAZ, or none) and whether it is a registered
  nazhir. The law decides what the app may offer on each
  (`decisions/istilah-dan-penamaan.md` §7).

## In flight

- **Audit phase 1, area by area.** Perizinan done (#564). Next: Kurikulum, HR
  employees, Sertifikat, then the dead calls, `services/` and the `api-client`
  alias. Open PRs: #565 (the Prisma client omits user credentials by default)
  and #566 (plain notification text escaped in e-mail bodies — CodeQL flagged
  the sink on #564).
- **Naming, endpoint and architecture audit — done 2026-09-25**; the user
  widened it the same day to every module without exception, every API
  endpoint and web route, the repository structure, the architecture and
  `AGENTS.md`, and allowed a total restructure provided it is tidy and
  standard. Report: <https://claude.ai/artifact/CqSKU3Zh7tYtDC5LSFvQL9>.
  Measured: 213 web call sites hit API paths that do not exist (109 reachable
  from pages, in 31 areas — proven on staging: `POST /permits/:id/approve`,
  `/curriculum/curriculums`, `/hr/employees`, `/certificates` all 404);
  10 API modules and 9 web routes are misnamed, 35 + 32 more need tidying;
  22 of 93 modules meet the module standard. Plan in seven phases (roadmap §1):
  guards → reconnect the broken contract → glossary → consolidate duplicates →
  API by context under `/api/v1` with a Zod → OpenAPI contract → web → harden
  → docs. The glossary still comes before Model A's permission keys.
  **The user decided the eight naming questions the same day and said
  "laksanakan"** — recorded in `decisions/istilah-dan-penamaan.md`: murid in
  the schools, santri in Takhosus; the yayasan's spellings (Takhosus, Tahfidz);
  portal Indonesian only, public site in three languages; tables renamed with
  their models; `/api/v1`; no laboratory module; donations, ZIS and wakaf built
  to the law. Phases run in order from 0.
- **Skipped tests** — asked by the user on 2026-09-25, to take in priority
  order: make every skipped API, web and Playwright test run, or say why it
  cannot. Known so far: 92 of the 94 skipped API tests are two opt-in suites
  that need a real Postgres (`decommission-pt-session.integration`,
  `database-migrations`); the Playwright suite has data guards
  (`test.skip` when the seed lacks rows) and firefox/webkit run with
  `continue-on-error`.
- **Model A design document** — approved to draft on 2026-09-25: a permission
  per feature and action, data scope from the assignment, menus derived from
  permissions, separation-of-duty rules locked in code, and the account
  lifecycle (joiner–mover–leaver, immediate deactivation, SCIM from Microsoft
  Entra or a Google Directory API sync after SSO). For the user's review before
  any code. `docs/DEPLOYMENT.md` goes
  after 2026-10-01 (the VM is the rollback target until then, and a guard test
  reads it).

## Recently done (2026-09-24 → 25)

- **Perizinan end to end (#564, merged 2026-09-25, on staging):** one contract
  in `@cipansor/shared` (`schemas/permits.ts`: types, Zod, and the role lists
  both sides read); a status flow with conditional moves (409 otherwise); reads
  scoped by `studentScope`; Pos Gerbang at `/permits/gate` for keamanan (308
  from `/reception/gate`); wali, staff dashboard and musyrif card on the same
  hooks; e2e `permits.spec.ts` (wali files → kepala approves → keamanan out and
  back → bendahara refused). Before/after on staging:
  <https://claude.ai/artifact/HQPwoVwwzJzuAxUHZrxs4M>. **#564 merged with the
  CodeQL check red — CodeQL is not a required check**; #566 fixes what it found.
- **Web ↔ API contract guard (#563):** `utils/web-api-contract.guard.test.ts`
  asks the real router about every web call; a baseline that only shrinks.
- **Naming decisions and `AGENTS.md` conventions (#562)**; records (#561).
- **Roles reach their own pages (#559, merged 2026-09-25, verified on
  staging):** kepala sekolah open `/perencanaan` (200, was bounced to
  `/dashboard`) and drafted and deleted an RKA Unit through the API;
  pustakawan `/library`, laboran `/inventory`, manajer usaha `/unit-usaha`
  all 200; tata usaha still sent from `/library` to `/staff`. The yayasan
  organs' accounts need 2FA, so their menu was checked by the e2e spec only.
- **Four API routes that never ran (#560):** `GET /simaan/upcoming`,
  `POST /notifications/whatsapp/send`, `GET /donation/mustahik` (each
  swallowed by a `/:id` sibling) and a second `POST /inventory/depreciation/run`.
  `utils/route-shadowing.guard.test.ts` walks the real router tree.
- Agent context step 4: the domain skills `panduan-peran`,
  `tata-kelola-yayasan` and `naskah-dinas` (#558).

- Santri and staff data scoped to the caller (#546, #547, #549, #550);
  2FA required for the yayasan organs (#548); a unit admin can no longer make
  themselves Super Admin (#543); CodeQL alerts cleared (#545).
- Pesantren role catalogue (#552): no Direktur, the Kiai is Pimpinan Pesantren
  and also Pembina; Musyrifah, Wali Kamar and Murabbi merged into Musyrif,
  Muhafidzah into Muhafidz.
- The E2E helper that picked another spec's plan (#551).
- The server checks who is named *atasan penilai* on a PK: never the owner,
  and only someone who holds a supervising role (#553).
- Agent context (#554, #555, #556): `CLAUDE.md` imports `AGENTS.md` and this
  index; stale docs deleted; roadmap and known issues cut to open work;
  decisions and lessons moved here from the machine-local memory; golden rules
  10 (before/after screenshots) and 11 (menu path + state).
- **Licence decided (2026-09-25): proprietary, owned by Yayasan Pesantren
  Cipansor — not open source**, because the repository becomes private. Never
  add an open-source licence, badge, or "contributions welcome" text.

## Next

Model A (a permission per feature plus a data scope), then one adaptive
`/dashboard` and a scoped `/analytics` — see [`roadmap.md`](roadmap.md).
