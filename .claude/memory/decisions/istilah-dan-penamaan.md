# istilah-dan-penamaan

> Glossary and naming decisions of 2026-09-25, taken by the user on the
> architecture audit: murid in the schools, santri in Takhosus; the yayasan's
> own spellings; the portal in Indonesian only and the public site in three
> languages; tables renamed with their models; `/api/v1`; no laboratory module;
> donations, ZIS and wakaf built properly. Read before naming anything.

The audit that led here (every API module, endpoint and web route, measured) is
summarised in `known-issues.md` and `progress.md`; this file keeps what was
**decided** and the reasons, so a later rename does not re-open it.

## 1. What the learner is called

| Where | On screen | In code | Why |
|---|---|---|---|
| A school unit — TK Qur'an, SD IT, SMP IT, SMA Qur'an (rapor, kelas, SPMB, presensi) | **Murid** | `student` | Kemendikdasmen replaced "peserta didik" with *murid* in 2025 (Permendikdasmen 3/2025, SPMB = Sistem Penerimaan **Murid** Baru) |
| Takhosus — the pesantren programme, `UnitType.PESANTREN`, whose learners attend none of the schools | **Santri** | `student` | UU 18/2019 Pasal 1: *santri* is a learner who studies at a pesantren |
| A screen that lists both at once (yayasan-wide data, EMIS/Dapodik export headers) | **Peserta didik** | `student` | the umbrella term of UU 20/2003 and UU 18/2019 |
| The parent | **Wali murid** / **wali santri** by the same rule; **orang tua/wali** where both | `parent` | follows the learner's term |

The label follows the **unit of the page or the record**, not the person: a
learner enrolled in a school and in Takhosus is a murid on the school's rapor
and a santri on the halaqoh sheet. The code keeps one word, `student`,
everywhere — the label is a presentation choice made from the unit type.

*Open nuance (raised, not decided):* a school pupil who boards in the asrama is
a *santri mukim* in UU 18/2019's sense; asrama pages may later want "santri".
Until the user says so, the rule above applies (murid unless enrolled in
Takhosus).

## 2. Spellings

The yayasan's own site spells **Takhosus**, **Tahfidz**, **Tahsin**, **Kitab
Kuning** — the code already does, so nothing changes. Terms the site does not
use keep the spelling the code already has (muhadhoroh, muhadatsah, halaqoh,
murojaah, simaan, muhasabah, mutabaah): consistent, widely used in pesantren
modern, and a respelling is churn with no reader who asked for it. The formal
Arabic–Latin standard (SKB Menag–Mendikbud 158/1987 & 0543b/U/1987) is for
scholarly text and is not applied to programme names.

## 3. The language of addresses, code and screens

Confirms `route-naming.md` (2026-07-21): **URL paths, API paths and code
identifiers are English** for general concepts (`/students`, `/assets`,
`/internal-audits`); **pesantren and regulatory terms are never translated**
(`/tahfidz`, `/takhosus`, `/muhadhoroh`, `/spmb`, `/emis`, `/dapodik`); **every
label a person reads is Indonesian**. The address bar is a technical name; the
screen is where the language is.

- **Portal** (`portal.cipansor.or.id`): **Indonesian only.** The partial
  English/Arabic translation of portal screens is removed.
- **Public site** (`cipansor.or.id`): **Indonesian, English and Arabic are
  mandatory**, switchable on every page, Arabic right-to-left.
  `config/i18n-coverage.test.ts` fails when a string exists in one language
  only.

## 4. Database tables follow their models

When a model is renamed, its table is renamed in the same migration
(`ALTER TABLE … RENAME`, metadata only) — no permanent `@@map` to an old name,
which would leave two names for one thing. Each migration is replayed on a
restored copy of production first, and a backup is taken before release.

## 5. API version

The API moves under **`/api/v1`**. The version is the first path segment, the
common practice for public REST APIs (Google AIP-185: the major version is the
first segment of the path) and the one CDNs and browser tools handle without
extra headers. It is added now because the only client today is this web app,
released together with the API; once the Flutter parent app
(`docs/MOBILE_API.md`) ships, old versions must keep answering, so the cheapest
moment is before it exists.

## 6. No laboratory module

A laboratory is a **room** (prasarana: land, buildings, rooms —
Permendikbudristek 22/2023), its equipment is **assets** (sarana) located in
that room, a *praktikum* is a lesson in the timetable held in that room, and its
result is assessed in **assessment** (practical-skill grades). A virtual lab
(PhET, Rumah Belajar's Laboratorium Maya) is an external simulation linked from
a teaching module; the app does not build its own. `/practicum` is Amaliyah
Tadris and is renamed (below), which removes the confusion that started this.

## 7. Donations, ZIS and wakaf are built properly

The user asked for the real thing, not a relabel. What the law requires, and so
what the design must respect (researched 2026-09-25 — do not repeat):

- **Zakat** may be collected only by BAZNAS, a licensed LAZ, or a **UPZ** that
  BAZNAS forms at a mosque, pesantren or yayasan (UU 23/2011 Pasal 16–18, 38,
  41; PP 14/2014; Peraturan BAZNAS 2/2016). Since MK 86/PUU-X/2012, a
  traditional amil is lawful only where BAZNAS/LAZ do not reach **and** after
  notifying the authorities. So the app records the yayasan's legal basis (UPZ
  decree, or notification) and does not offer "Zakat" without one. A UPZ
  reports to BAZNAS monthly, per semester and yearly.
- Zakat goes only to the **eight asnaf**; zakat, infak/sedekah, wakaf and
  other religious social funds are **separate funds**, with the amil share
  accounted for — **PSAK 409** (zakat, infak/sedekah) and **ISAK 335**
  (non-profit statements), numbering in force since 2024-01-01.
- **Wakaf** (UU 41/2004, PP 42/2006 as amended by PP 25/2018, Peraturan BWI):
  a registered **nazhir** manages it; *wakaf uang* is received through an
  **LKS-PWU**, which issues the *Sertifikat Wakaf Uang*, and its principal must
  be preserved — only the returns are spent; *wakaf melalui uang* buys or builds
  an asset, which then becomes a wakaf asset under an **Akta Ikrar Wakaf** made
  before a PPAIW. Accounting: **PSAK 412**. Wakaf assets belong in the asset
  register, flagged as wakaf.
- Donor data is personal data (UU 27/2022).

Before any code, the design needs two facts from the yayasan: its zakat status
(UPZ of which BAZNAS, a LAZ, or none) and whether it is a registered nazhir.

## 8. Module names

Target names from the audit (current → target), applied in phase 4 together with
`/api/v1`. Unchanged modules are not listed.

| Current | Target | Why |
|---|---|---|
| `practicum` | `amaliyah-tadris` | it is Amaliyah Tadris (i'dad, naqd, teaching practice), not a lab |
| `research` | `fathul-kutub` | it is Fathul Kutub; today shown as "Research Portal" and "Turats Lab" |
| `inventory` | `assets` (`…/stocktakes`) | fixed assets; "inventory" is stock (PSAK 202), "audits" clashes with internal audit |
| `student-compliance`, `teacher-compliance` | `students/data-completeness`, `employees/data-completeness` | data completeness, not compliance |
| `finance-enhancement` | `accounting`, `budgets`, `scholarships` | names its history, not its content |
| `dashboard-enhancement` | merged into `dashboard` | same |
| `non-formal` | `courses` | the content is courses |
| `pengawasan` | `internal-audits` | reads as the Pengawas organ |
| `curriculum` | `subjects`, `timetable`, `lesson-plans` | it holds subjects, timetable and lesson plans |
| `kurikulum-merdeka` | `curriculum` (+ `co-curricular` for P5) | the real curriculum; P5 became *kokurikuler* (Permendikdasmen 13/2025) |
| `assessment` report cards, `rapor-pesantren`, `paud-report` | `report-cards` (by type) | five places for one concept; "raport" is not standard Indonesian (KBBI: *rapor*) |
| `murojaah`, `simaan`, `sanad`, parts of `takhosus` | `tahfidz/*`; `takhosus` keeps enrolment | five modules over the same tables |
| `perencanaan`, `talenta`, `organisasi`, `tata-laksana`, `lingkungan`, `wilayah` | `planning`, `talent`, `org-structure`, `sops`, `green-campus`, `regions` | general concepts, so English by rule 3 |
| `performance-agreements` (folder `performance-management`) | `performance` | folder and mount disagree |
| `reception` | `front-desk` | "Reception" collides with *Penerimaan* (SPMB) |
| `donation` | `donations` (+ `zakat`, `wakaf` per section 7) | plural; the three funds are separate |
| web `/tk`, `/e-office`, `/kinerja`, `/unit-usaha`, `/admissions`, `/payroll`, `/wallet` | `/paud`, `/correspondence`, `/performance`, `/business-units`, into `/spmb`, into `/hr/payroll`, into `/finance/wallets` | one name per concept, matching the API |

Web paths that change get a permanent 308; paths printed on paper
(`/public/verify-card`, `/verifikasi`) never change.
