# Progress — where the work stands

Updated **2026-09-28**. What a new session needs to pick up the thread, newest
first. Keep it short: finished work belongs to git history, and the ordered
backlog to [`roadmap.md`](roadmap.md).

## Environments

- **Production** — `cipansor.or.id`, Azure App Service since 2026-09-24. A
  release needs the user's explicit approval every time, and
  releases the SHA staging reports at `/healthz`, not the head of `main`.
  Migrations run when the container starts (`MIGRATE_ON_START`).
- **Staging** — `staging.cipansor.or.id`, demo data only, deploys every `main`
  on which CI and E2E (Chromium) pass. At `4004119d` (#594) on 2026-09-28,
  which holds #588 through #598; verified read-only (the public
  accreditation list answers `[]` — no certificate recorded on staging — so
  the section stays hidden). #605 onward deploy as `main`'s E2E passes.
- **CodeQL is a required check** on `main` since 2026-09-25 (ruleset rule
  `code_scanning`, errors and high-or-higher alerts). The user's caveat: it
  may be dropped if the repository goes private and code scanning would need
  a paid licence.

## Waiting on the user

- Approval for the next production release — deferred by the user on
  2026-09-27; ask again at the end of every report. (Which fixes production
  still lacks is for the machine-local memory, not here — see "Where things
  live".)
- Role catalogue items decided but not built: wakasek per bidang as a
  timed assignment (Model A; wakasek is no longer a role code —
  `decisions/peran-dan-tugas-tambahan.md`), `PESANTREN_ADMIN` (needs a pesantren unit first — every pesantren role is
  scoped to SMP IT today), a Panitia SPMB assignment that expires, and the
  "Admin" → "Operator" label.
- One Bendahara role with a unit scope waits for Model A (decided 2026-09-25).
- **Accreditation certificates of SD IT and SMA Qur'an** — the user is
  asking the schools for them (2026-09-28); each unit appears on the public
  site once its certificate is entered. TK Qur'an has none yet — it was
  only just established — and is not mentioned.
- **Musyrif assignments in production.** Until the yayasan enters them
  (Asrama → an asrama → Musyrif, #569), a boarder has no musyrif on record:
  their leave goes to the unit head, visibly so, and their Alpa is followed
  up by the wali kelas (#588).
- **ZIS and wakaf facts** (asked 2026-09-27; the user does not know yet and
  will check): the yayasan's zakat status (UPZ of BAZNAS Kab. Tasikmalaya, a
  licensed LAZ, or none) and whether it is a registered nazhir (KUA / SIWAK /
  BWI). What the web shows, and the interim rule the user set, are in
  `decisions/istilah-dan-penamaan.md` §7.

**Answered on 2026-09-27** (recorded in the decisions; the work is in
`roadmap.md`): the three permit parameters (`pemutus-izin-santri`); who
manages asrama (`unit-vs-asrama-vs-takhosus`); *santri* on every screen
(`istilah-dan-penamaan` §1); guru wali runs at SMP IT and SMA Qur'an
(`peran-dan-tugas-tambahan`); daily attendance — one page, automatic
follow-up, no guru piket (`absensi-harian`); one TK daily-report page and the
Kurikulum list page folded away (both removals approved). The next production
release was **deferred** by the user ("tunda dulu … kumpul dulu perbaikan dan
pengembangannya"), who asked to keep being reminded.

**Answered on 2026-09-28:** the attendance pattern flag's four parameters
(`absensi-harian`, all the recommended options); the units' accreditation —
on the public site from one official record in the portal, kept by the unit's
admin or the Super Admin, a reminder 12 months before it runs out
(`akreditasi-unit`); a permit's doctor's note — kept to the end of the leave's
academic year, opened by the decider, the wali and the unit head
(`pemutus-izin-santri`); PR #508 (Pengawas, WBS, suspension of Pengurus) and #509 (organ
decisions and minutes) — both **closed** after an audit
(<https://claude.ai/artifact/Cs8yAjGuZcYJzrVi874k9d>): #508 is split and
redesigned, #509 becomes a Pembina meeting decision in the existing
ratification flow (`pengawasan-dan-rapat-pembina`); the four design questions of that rebuild —
the Ps. 43 suspension, the WBS, TPPK/Satgas and the form of the Pembina's
decision — all answered with the recommended options the same day. The
founding deed (2012) arrived too, summarised in the `tata-kelola-yayasan`
skill; whether it was amended since is still to ask.
Also on 2026-09-28, after an audit of the Dependabot majors #601–#604:
Sentry is **removed** rather than upgraded (#601–#603 closed) — no
environment ever ran it, and v11 collects cookies, bodies and local
variables by default; error monitoring is to be chosen before launch (the
release plan points at Azure Application Insights). ESLint 10 merged (#604).

## In flight

- **Audit phase 1, area by area.** Done: Perizinan (#564, then #568 moved
  the decision to the mentor), Asrama (#569, #571), mata pelajaran and guru
  pengampu (#573), laporan harian (#577), the wali kelas relation (#579),
  daily attendance (#580, one page in #585, its follow-up in #587, #588 and
  #590, and the pattern flag in #596), behaviour notes (#581), the Kurikulum
  list (#589), one daily-report page (#592), the units' accreditation record
  (#597), accreditation on the public site (#598), the permit's doctor's
  note (#606), the koordinator asrama for izin pulang and bermalam (#607).
  Then Pengawasan Internal, Manajemen Risiko and Kepatuhan Syariah for the
  yayasan's organs, salvaged from #508 (roadmap 00.8). Next: removing
  Sentry (below), then the wali's approval for staff-filed leave off the
  pondok (roadmap 00.5, third part).
  Next: the rest of the homeroom pages (below), the class and teacher
  schedules, HR employees, Sertifikat, then the dead calls, `services/` and
  the `api-client` alias.
- **Homeroom, what is left** (known-issues, "Homeroom pages that still do
  not work"): *Pesan Orang Tua*, the pupil page's figures, the kepala
  sekolah's way to a class's dashboard.
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
  `continue-on-error`. The Chromium run reports 41 skipped (2026-09-27);
  one of them, `tk-daily-report`, had been hiding a broken flow for months
  (`lessons/guard-tests-that-measure-the-wrong-thing.md`).
- **Model A design document** — approved to draft on 2026-09-25: a permission
  per feature and action, data scope from the assignment, menus derived from
  permissions, separation-of-duty rules locked in code, and the account
  lifecycle (joiner–mover–leaver, immediate deactivation, SCIM from Microsoft
  Entra or a Google Directory API sync after SSO). For the user's review before
  any code. `docs/DEPLOYMENT.md` goes
  after 2026-10-01 (the VM is the rollback target until then, and a guard test
  reads it).

## Recently done (2026-09-24 → 28)

- **A permit's doctor's note (#606, merged 2026-09-28):** the wali or staff
  attach a photo or PDF (5 MB, type read from the bytes) when filing; the
  decider, the unit head and the wali open it in the page, each opening
  audited; everyone else sees that one exists. Kept in the database, erased
  nightly once the leave's academic year has ended. Also: an upload over
  multer's limit is a 400, not a 500, on every route. Before/after:
  <https://claude.ai/artifact/8g9EKudwHe51HuhSfazT2c>.
- **Project task notice (#605, merged 2026-09-28):** a saved task is no
  longer reported as failed when telling its assignee fails.
- **Units' accreditation (#597 record, #598 public site; both on staging
  2026-09-28):** one official record per unit, kept by the unit's admin or
  the Super Admin at *Sistem → Profil Unit* with the certificate PDF, read by
  the EMIS/Dapodik exports and the SKHUN; the public site shows the one in
  force on *Profil → Legalitas* and the unit's section, in three languages,
  hidden once expired; a reminder 12 months before. Before/after:
  <https://claude.ai/artifact/3hknmFTyFDXGC21eRhSaoV>,
  <https://claude.ai/artifact/4seR52ain9pns4gimg7iz3>.

- **Absence follow-up, tier 2 (#588, merged 2026-09-28):** *Wali Kelas →
  Tindak Lanjut Absensi* (and *Pengasuhan → Tindak Lanjut Absensi* for the
  musyrif) lists the last 7 days' Alpa with no reason, whom to call (linked
  walis, then the enrolment contact; tel and WhatsApp links) and what was
  tried. *Catat hasil* logs a contact (`attendance_follow_ups`, additive
  migration): Sakit/Izin change the mark, "tanpa keterangan" closes it,
  "tidak terhubungi" keeps it open. A santri mukim's Alpa is their
  musyrif's; everyone else's — a boarder with no musyrif on record included —
  the wali kelas's. 15:00 WIB reminder, in the app and by email. Before/after:
  <https://claude.ai/artifact/Pf6E87kiXVtoWY5zVMi3Yk>.
- **Alpa/Terlambat told at once, and a personal inbox (#587, on staging):**
  the wali in the app and by email, a boarder's musyrif in the app; only a
  change, only today's register. The header bell opens *Notifikasi Saya*
  (`/notifications/me`) for every role. Before/after:
  <https://claude.ai/artifact/U8v1GvscgBToGn5JbyfY34>.
- **Open (auto-merge):** #589 the Kurikulum list removed, its addresses 308
  to Kurikulum Merdeka, the page renamed *Mata Pelajaran & Jadwal*
  (<https://claude.ai/artifact/A2DxB8CfdYucgp7Swwdeuy>); #590 the register
  reminder 30 minutes after a class's first lesson (in-app, holidays silent).

- **The donation forms offer what the yayasan offers (#584, merged
  2026-09-28):** Zakat Maal and Zakat Fitrah are off the public *Wakaf &
  Infaq* form and staff entry (*Keuangan → Donation/ZIS → Catat Donasi*), and
  the API refuses them on both create routes; one list in shared
  (`OFFERED_DONATION_TYPES`). Before/after:
  <https://claude.ai/artifact/5h545yrMwLAuvtc9HmnRcE>.
- **One register, one page (#585, merged 2026-09-28):** *Wali Kelas →
  Absensi Harian* opens `/attendance/record` on the homeroom class;
  `/homeroom/attendance` 308s and its copy is gone; the sidebar lights one
  entry (`activeNavHref`). Before/after:
  <https://claude.ai/artifact/Xpvzges8nGMSjSxCEMwHXh>.
- **Golden rule 12 (#583):** a decision that is the user's is researched
  first, then offered as a multiple-choice question.

- **Wali kelas is a relation, not a role (#579, merged and on staging
  2026-09-27):** the *Wali Kelas* menu group shows for the wali kelas of a
  class this academic year (`Class.homeroomTeacherId`); a class's homeroom
  data is read by its wali kelas and the unit's kepala sekolah and operator,
  written by the wali kelas in the current year, 404 to other teachers; notes
  are changed by their author only; responses carry five pupil columns. The TK
  wali kelas persona now holds TK A. Before/after:
  <https://claude.ai/artifact/6fki1HjBDZcqigUKE8W9cR>.
- **Daily attendance is taken by the people who teach the class (#580,
  merged 2026-09-27):** until then every teacher, wali kelas and kepala
  sekolah got 403 saving a register (**Mengajar → Absensi → Input
  Kehadiran**; **Wali Kelas → Absensi Harian** called routes that did not
  exist). Now the class's wali kelas, a teacher with a lesson in it, and the
  unit's operator; the day is a calendar day; saving again corrects it;
  `GET /attendance/me/classes` tells the page which registers the user takes.
  Before/after: <https://claude.ai/artifact/7SjEhmVqzSwxxrDvpGardr>.
- **Behaviour notes (#581):** **Wali Kelas → Catatan Perilaku** lists and
  writes the class's notes; a positive note is no longer stored as a
  violation; a note needing attention keeps its action. Before/after:
  <https://claude.ai/artifact/WxamzJEDT1AKdjpsGfwMDJ>.

- **Laporan harian end to end (#577, merged 2026-09-27):** a TK guru writes a
  child's day with a photo (**Mengajar → Mutabaah Yaumiyah → Buat Laporan**;
  the button used to open "Laporan tidak ditemukan"), the wali reads and
  acknowledges it (**Anak Saya → Laporan Harian**; it used to say "Data Siswa
  Tidak Ditemukan"), and the TK admin's form, edit page and check-in save.
  One contract in `packages/shared/src/schemas/daily-report.ts` (calendar
  day; unit and year derived from the pupil and date; photos are uploads);
  who reads and writes is set per role and per child; forms no longer fill in
  meals, health or mood nobody recorded. Before/after:
  <https://claude.ai/artifact/JwabzXL9oGAKLJ8iXhxkEk>.
- **An empty Select shows its placeholder (#576):** the wrapper's `""`
  sentinel only applies when an "All" item exists
  (`lessons/select-empty-value-sentinel.md`). Before/after:
  <https://claude.ai/artifact/7aRTpH1sy1WKiHTyaFhTkJ>.
- **Wakasek and wali kelas are duties of a guru, not role codes (#575):**
  every `*_WAKASEK` and `*_WALI_KELAS` assignment moved to `*_GURU` of the
  same unit (migration replayed on a copy of production first); 53 role codes.
  Decision: `decisions/peran-dan-tugas-tambahan.md`. Before/after:
  <https://claude.ai/artifact/3p6XhHyASGZYNH4uWSxuYs>.
- **Confidential counselling sessions (#574, on staging, verified):** read in
  full by their counsellor and the unit's guru BK; the kepala sekolah sees
  that they exist and their referrals; nobody else receives them.
  Before/after: <https://claude.ai/artifact/Q6hbYf2fEzfo9W51h2E3p4>.
- **Mata pelajaran and guru pengampu work end to end, within the unit
  (#573).** Before/after: <https://claude.ai/artifact/HpkA1erLZGkdZb47QJBJVd>.

- **Asrama end to end (#571, merged 2026-09-26):** adding and editing an
  asrama, adding, changing and deleting a kamar, and placing a santri all
  failed before (wrong field, PATCH to a PUT route, the facilities module's
  rooms); "Terisi" was always 0. One contract in
  `packages/shared/src/schemas/dormitories.ts`; the API keeps kamar capacity,
  occupied kamar/asrama cannot be deleted, placements move in one
  transaction, placement reads carry four student fields instead of the row.
  Who writes is unchanged (question above). Before/after:
  <https://claude.ai/artifact/BeJwFwWPbtFdo4NhJAicT1>.
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
