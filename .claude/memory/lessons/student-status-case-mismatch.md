# student-status-case-mismatch

> `students.status` held `'active'` while 43 queries filtered `'ACTIVE'` — Postgres compares text case-sensitively, so every one returned zero with no error, the EMIS export included. A free-text column is the cause; one vocabulary, a CHECK, and a scanner are the cure.

**Measured 2026-09-13:** the database stored `students.status = 'active'`
(lower case, as `schema.prisma`'s default says), but **43 places in 20 files**
filtered `status: 'ACTIVE'`. Every one returned **zero** — no error, no
warning, no log line. The dashboard showed 0 active students and an attendance
rate that was always 0 (it divides by active students); worse, the **EMIS
export to Kemenag** came out empty.

The proof takes one line of SQL: `select status, count(*) from students group
by status`. Measure the running artifact, not the code you read.

**The root cause is `Student.status` being free text.** Patching 43 lines
without closing the class just waits for the 44th. Fixed in #492/#493:

- one vocabulary, `STUDENT_STATUS` in `packages/shared/src/types/student-status.ts`,
  from which the Zod schemas derive (`z.enum(STUDENT_STATUS_VALUES)`);
- a CHECK constraint in the migration, so a wrong spelling cannot be stored;
- the API **rejects** other spellings (400) instead of dropping the filter;
- `apps/api/src/utils/student-status.test.ts` scans the API **and** the web
  source for the wrong spelling.

## What pulling the thread found

- **A test pinned the wrong spelling, and that is why it was green.**
  `finance.scheduler.test.ts` demanded `where: { status: 'ACTIVE' }`; the code
  was wrong the same way. A defect promoted to a contract. The scanner skips
  test files on purpose (legitimate mocks would go red); what protects that
  direction is fixing production code, which reddens the pinning test.
- **Guess, then measure.** The guess "recurring billing never issued a bill
  because the filter matched nothing" was wrong: that function
  (`generateRecurringBills`) had **zero callers**. The live path
  (`runMonthlyAutoBilling` → `generateBulkSppInvoices`) did not filter status
  at all — so a graduate would have kept being billed. (Fixed in #535.)
- **Rejecting other spellings is right only once every caller has moved.**
  The web app held seven copies of the vocabulary (fake union types in hooks,
  a dead array in `lib/constants.ts`, dropdowns, a form schema), and those
  types *told* 16 pages to write upper case. Four callers swallowed the new 400
  into a zero (`.catch(() => total: 0)`). The scanner, widened to `apps/web`,
  found them — a plain `grep` had missed two of three dashboards. API and web
  had to ship together.
- **A scheduled job needs a record, not a log line.** Whether last month's
  bills were issued could not be answered once the container logs rotated. The
  pattern that works is one `audit_logs` row per run, as the identity-document
  purge does.

## It happens again wherever a comment holds the vocabulary

**2026-10-03, `registrants.quran_ability`.** The column's comment listed
`BELUM_BISA, IQRA, LANCAR, TARTIL, TAHFIDZ`; the seeds and both lead scores
used them; the public SPMB form, the only writer a parent reaches, sent
`IQRO` and `HAFIDZ`. A registrant who declared hafalan never scored for it,
and the admin page showed the raw code. Fixed the same way: a Prisma enum
(`QuranAbility`), one list with labels in `@cipansor/shared`, `z.enum` at the
edge, and a migration that maps the two variants and keeps any other value in
the registrant's notes instead of dropping it.

A comment is not a constraint. On that day **61** free-text columns in
`schema.prisma` documented a code vocabulary in a comment
(`grep -E 'String\??\s.*//\s*[A-Z][A-Z_]+(,| \|| /)\s*[A-Z][A-Z_]+'`); each
is the same bet that every writer read the comment. `known-issues.md` holds
the sweep.

Same family as [teacher-dashboard-fake-stats](./teacher-dashboard-fake-stats.md):
a number that looks tidy and is wrong.
