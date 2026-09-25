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

Same family as [teacher-dashboard-fake-stats](./teacher-dashboard-fake-stats.md):
a number that looks tidy and is wrong.
