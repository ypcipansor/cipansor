# prisma-include-leaks-pii

> `include: { student: … }` returns every scalar column of `Student` — NIK, No. KK, the parents' NIK and income — while the screen reads a name and a NIS. Always `select`, and measure `Object.keys` on the real response.

`include` on a `student` relation returns **every scalar column** of `Student`:
`nik`, `noKK`, `fatherNik`, `motherNik`, `guardianNik`, `fatherIncome`,
`motherIncome`, `parentPhone`, `address` … 69 keys. The screen reads the name
and the NIS. That is OWASP API3:2023 (broken object property level
authorization — excessive data exposure) and a child's specific personal data
under UU PDP.

**Measured 2026-09-24** on `GET /finance/invoices` as a Tata Usaha account on
staging: every invoice row carried all 69 student columns. #540 replaced it
with a four-column `select` and scoped the list to the invoice's unit.

**Why it passes review:** the code `include: { student: { include: { user: {
select: … } } } }` *looks* careful — but the `select` applies to `user` only,
not to the `student` above it.

**How to apply:**

- In every query that brings in `student` (or `user`, `teacher`), look for
  `student: { include` and replace it with an explicit `select` — the pattern
  is `INVOICE_STUDENT_SELECT` in `finance.service.ts`.
- Pin the exact `select` shape in a test, and measure on staging:
  `Object.keys(data[0].student)`.
- Check the same endpoint's **unit scope** and a parent's **ownership** of the
  child at the same time — all three turned up together, twice.
