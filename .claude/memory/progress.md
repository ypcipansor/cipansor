# Progress — where the work stands

Updated **2026-09-26**. What a new session needs to pick up the thread, newest
first. Keep it short: finished work belongs to git history, and the ordered
backlog to [`roadmap.md`](roadmap.md).

## Environments

- **Production** — `cipansor.or.id`, Azure App Service since 2026-09-24. A
  release needs the user's explicit approval every time, and
  releases the SHA staging reports at `/healthz`, not the head of `main`.
  Migrations run when the container starts (`MIGRATE_ON_START`).
- **Staging** — `staging.cipansor.or.id`, demo data only, deploys every `main`
  on which CI and E2E (Chromium) pass. At `140633b0` on 2026-09-26
  (#565, #566); #568 and #569 deploy when `main`'s CI and E2E finish.
- **CodeQL is a required check** on `main` since 2026-09-25 (ruleset rule
  `code_scanning`, errors and high-or-higher alerts). The user's caveat: it
  may be dropped if the repository goes private and code scanning would need
  a paid licence.

## Waiting on the user

- Approval for the next production release. (Which fixes production still
  lacks is for the machine-local memory, not here — see "Where things live".)
- Role catalogue items decided but not built: a *bidang* attribute for Wakasek,
  `PESANTREN_ADMIN` (needs a pesantren unit first — every pesantren role is
  scoped to SMP IT today), a Panitia SPMB assignment that expires, and the
  "Admin" → "Operator" label.
- One Bendahara role with a unit scope waits for Model A (decided 2026-09-25).
- **Three parameters of the permit rule** (`decisions/pemutus-izin-santri.md`,
  built in #568): the 7-day threshold; whether a boarder going home or
  staying overnight goes to the koordinator asrama or the Pimpinan Pesantren;
  whether a staff-filed request needs the wali's "setuju" (a schema change).
- **Who manages asrama** — adds asrama and kamar, places santri. Today: the
  super admin, every school's admin and the yayasan organs (unchanged by the
  asrama PR, which made those pages work). Recommended: the Pimpinan
  Pesantren and TU Pesantren (pengasuhan), plus the super admin; not the
  organs, not TK. One list in `packages/shared/src/schemas/dormitories.ts`.
- **Musyrif assignments in production.** Until the yayasan enters them
  (Asrama → an asrama → Musyrif, #569), a boarder has no musyrif on record and
  their leave goes to the unit head, visibly so.
- **"Santri" on every screen?** On 2026-09-25 the user said they were
  considering calling every learner santri. Researched the same day and
  recommended: *santri* in everything the app writes itself (the yayasan's own
  site already does, and so does the TK Al-Qur'an tradition; UU 18/2019 knows
  santri who do not board), and the state's word only inside a name or format
  copied from the state (SPMB = *Sistem Penerimaan Murid Baru*, Dapodik's
  *peserta didik*, ministry templates). Not decided yet;
  `decisions/istilah-dan-penamaan.md` still says murid in the schools and
  changes only when the user agrees.
- **Two facts for the ZIS and wakaf build:** the yayasan's zakat status (UPZ
  of which BAZNAS, a licensed LAZ, or none) and whether it is a registered
  nazhir. The law decides what the app may offer on each
  (`decisions/istilah-dan-penamaan.md` §7).

## In flight

- **Audit phase 1, area by area.** Perizinan done (#564, then #568 moved the
  decision to the mentor); Asrama's kamar list and labels fixed in #569.
  Next: Kurikulum, HR employees, Sertifikat, then the dead calls, `services/`
  and the `api-client` alias.
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

## Recently done (2026-09-24 → 26)

- **A santri's leave is decided by their own mentor (#568, merged
  2026-09-26):** the musyrif of their kamar or asrama for a boarder, the wali
  kelas otherwise; the unit head for more than seven days, for a santri with
  no mentor on record, or as a recorded takeover. Admins no longer decide.
  Every permit carries `decision`; **Perizinan → Perlu keputusan saya**; the
  wali kelas menu gained Perizinan; migration `20260926000000_permit_decider`
  (additive). The demo wali kelas and musyrif personas now have classes and
  kamar. Rule and sources: `decisions/pemutus-izin-santri.md`.
- **Musyrif assigned from the asrama page (#569, merged 2026-09-26):** nothing
  could write `musyrif_assignments` before; **Asrama → an asrama → Musyrif →
  Tugaskan musyrif** (Pimpinan Pesantren and super admin). Same PR: the kamar
  list called a path the API never served, and every asrama read "Putri" and
  "Tidak Aktif". #568 and #569 were gated together (rule 9) before merging.
  Before/after for both: <https://claude.ai/artifact/HRLjvCfZu1c9Z9hHM9ftQp>.
- **User credentials leave the database only when a query names them (#565)**
  and **plain notification text is escaped in e-mail bodies (#566)**, both
  merged 2026-09-25.

- **Perizinan end to end (#564, merged 2026-09-25, on staging):** one contract
  in `@cipansor/shared` (`schemas/permits.ts`: types, Zod, and the role lists
  both sides read); a status flow with conditional moves (409 otherwise); reads
  scoped by `studentScope`; Pos Gerbang at `/permits/gate` for keamanan (308
  from `/reception/gate`); wali, staff dashboard and musyrif card on the same
  hooks; e2e `permits.spec.ts` (wali files → kepala approves → keamanan out and
  back → bendahara refused). Before/after on staging:
  <https://claude.ai/artifact/HQPwoVwwzJzuAxUHZrxs4M>. #564 merged with the
  CodeQL check red, which is why CodeQL became required; #566 fixed the sink.
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
