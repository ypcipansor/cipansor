# teacher-dashboard-fake-stats

> Figures that lie, in four varieties: a dashboard reading keys the API never sent, a chart filled from a hard-coded array when the API was empty, a score that ignored its input, and an invented legal number on every official letter. How to find each.

## 1. The teacher dashboard read what the API never sent (#383, 2026-08-02)

Every number on `/teacher` was wrong, plausibly: it read `meta.total` where the
API sends `meta.pagination.total` (so always 0); the class count fell back to
a literal `|| 4`; it asked `/tahfidz/stats` for five keys that endpoint does
not return; it passed a `teacherId` that none of the endpoints filter on (so
it showed other teachers' students); it sent `user.id` where `Teacher.id` was
needed, and fell through to a hard-coded timetable; and it read
`student.name` where the name lives on `student.user.name` ("Unknown
Student" on every row).

Now one session-scoped `GET /api/dashboard/teacher` resolves the teacher from
the session and takes **no** `teacherId`, so one teacher cannot read
another's figures by guessing an id; an account with no `Teacher` row gets 403,
not a row of zeros.

- **`null` is not `0`.** With no hafalan target set there is nothing to measure
  against, so the achievement is `null` and renders "—", not `0%` — a `0%`
  claims the teacher achieved nothing.
- **A failed request is not a zero.** "Recorded nothing today" and "we don't
  know" must look different.
- **An honest zero is not a regression.** A demo teacher with no homeroom, no
  schedule and no subject correctly shows zeros; an empty timetable on a
  weekend is right. Check the data before calling it broken.

## 2. The executive dashboard drew a chart from a constant (#401)

When the API returned empty, `/dashboard/executive` rendered two hard-coded
arrays: enrolment climbing to ~800 santri and 88–95% attendance, while the
database held 14 students. On the screen titled "real-time monitoring of every
unit", the board saw about fifty times the santri the yayasan had. **An empty
dataset is information** — render an empty state. (The page was later deleted
in #544, with two others whose figures were wrong.)

**Find the rest of this family:** grep `fallback`, `mock`, `dummy`,
`Placeholder` in `apps/web/src`. Not every hit is a defect, but every chart or
KPI fed by such a constant is.

## 3. A score that did not depend on its input (#410)

A succession screen showed "80% MATCH SCORE" under "AI Powered
Recommendations". The arithmetic genuinely ran, and meant nothing: "Kepala
Sekolah", "Bendahara", "Tukang Kebun" and `"zzzz nonsense"` all returned the
same candidate at 80. Every term but a base score was structurally zero on the
real data. **Grep cannot find this one.** The test is behavioural: feed the
feature an absurd input and see whether the output moves. Rules now in
`talenta.service.ts`: not-assessed renders as *belum dinilai*, never `0%`; when
only the base contributed, withhold the headline number and list the missing
inputs. And a weighted sum is not "AI".

## 4. An invented legal number on every official letter (2026-09-03)

`generate-letter-pdf.ts` hard-coded a Kemenkumham registration number with a
placeholder `0012345` and the wrong year — so every naskah dinas the system had
issued carried a legal-entity number that does not exist. It survived because
**one fact lived in three places that never meet**: invented in the
generator, copied from a real letter in `packages/shared` (`LETTERHEAD`), and
the genuine one on the public legal page (`apps/web/src/config/content.ts`).
The generator had `LETTERHEAD` imported and did not read it.

**The reusable check:** when an identity fact about the institution — legal
number, NPWP, address, phone, bank account — appears in more than one place,
at least one copy is invented. Grep it across `apps/api/src`,
`packages/shared` and `apps/web/src/config`, and reconcile against a document,
not against each other.

## Diagnosing an account that lands on the wrong dashboard

A demo account named *kepala* but assigned a *guru* role routed to `/teacher`
and, with no `Teacher` row, got 403. That is a seed inconsistency — fix the
assignment, never weaken the 403. The query that finds such accounts:

```sql
SELECT u.email, r.code FROM users u
JOIN user_role_assignments ur ON ur.user_id = u.id AND ur.is_primary
JOIN roles r ON r.id = ur.role_id
WHERE NOT EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = u.id);
-- then keep the rows whose r.code routes to /teacher (the TEACHER bucket)
```

See [breadth-over-depth](./breadth-over-depth.md) and
[student-status-case-mismatch](./student-status-case-mismatch.md).
