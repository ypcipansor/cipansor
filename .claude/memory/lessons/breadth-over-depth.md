# breadth-over-depth

> The system is built far wider than it is deep — hundreds of pages and menu entries for a handful of seeded santri — so most defects sit at a link nobody ever walked.

Measured 2026-08-15:

| | |
|---|---|
| `page.tsx` route files | 441 |
| navigation `href:` entries | 328 |
| API modules | 97 |
| Prisma models | 285 |
| santri | 14, all seed data |
| real users | none yet |

This is the frame for almost every defect found here: features were built
*broad* and never walked end to end, so each looks finished and fails at a hop
nobody traversed.

**The clearest case — the student ID card.** A card page, a QR, a
`verificationUrl`, a verification service: every piece existed and none worked.
The "QR" was a 7×7 pseudo-random checkerboard whose own comment said it filled
the corners "for QR-like appearance"; the URL pointed at a domain the yayasan
does not own; the verify route had never existed. Nobody had scanned a printed
card. (Rebuilt with a real HMAC-signed payload in #483.)

**The method that finds these, and the only one that does:** pick a real
journey and walk every hop — SPMB registration → santri → kelas → absensi →
penilaian → rapor → tagihan → wali membayar. Anything that breaks mid-journey
should leave the menu until it connects. A count of features is not a measure
of capability.

**A blank portal is a data question first.** The demo accounts once logged in
to empty portals because the seed created the `User` but no `Student`,
`Teacher` or `StudentParent` row — the audit called it "near-blank pages"; the
cause was data, not code.

**Recurring shapes to check first:**

- invented data behind an empty API — [teacher-dashboard-fake-stats](./teacher-dashboard-fake-stats.md);
- config that names nothing — after the two-host split, `APP_URL` had four
  different hard-coded fallbacks in four files, two on domains we do not own;
- a schedule that contradicts its own policy — `dashboard_history` kept 24
  hours by rule and was pruned monthly: 131,190 rows where the rule allows
  ~8,600;
- layout that only ever ran at desktop width — [mobile-layout-audit](./mobile-layout-audit.md).

**Not to be mistaken for bloat:** `dapodik` and `emis` are mandatory
government reporting, `wilayah` is region master data, and the pesantren
modules (`tahfidz`, `sanad-certificate`, `murojaah`, `simaan`, `muhadatsah`,
`muhadhoroh`, `muhasabah`, `kitab-progress`, `takhosus`, `ibadah`) are the core
of what this institution does. What to cut is the user's call.

**2026-09-21 — the system shrank on purpose for the first time.** #505
dissolved the higher-education unit and the Litbang module: 11 tables, one
unit and nine roles gone. That is the direction this note argues for.
