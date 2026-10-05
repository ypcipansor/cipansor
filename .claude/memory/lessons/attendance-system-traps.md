# Attendance-system traps

Eight shapes that made a working-looking attendance feature wrong, found across
the 2026-09-29 audit and the Devin review that followed it. Each is generic:
look for it wherever a policy, a date, a pay rule or a retention period is read.

## A policy read as `policy?.flag` fails open

`if (policy?.requireSelfie && !photo) throw …` — when no policy row exists,
`policy` is `null`, the check is skipped, and the punch passes with no
evidence. The model's default (`requireSelfie = true`) never applies, because
no row means no default. A policy that decides whether evidence is *required*
must default to the safe side in code, not to "off". Ask of every policy read:
what happens when the row is missing? And what seeds the row? If the answer to
the second is "nobody", the feature is off in a fresh database while the code
looks like it enforces it.

The same shape turns a geofence into a no-op: no site means the distance is
unknown (`null`), and `null` never satisfies a `REJECT`.

## A Zod `datetime()` field refuses the browser's own date value

`z.string().datetime()` rejects `"2026-09-29"`, which is exactly what
`<input type="date">` produces. A create/update endpoint whose date comes from
a date picker and whose schema says `datetime()` is a 400 in production and a
green unit test, because the test sends the ISO string the schema wants. A
calendar-day field is `z.coerce.date()` or a `yyyy-MM-dd` string with a
validator; keep `datetime()` for an instant.

## Two codes for one concept

The engine excluded the basic salary by the literal code `'GAJI_POKOK'`, while
the seed created it as `'BASIC_SALARY'`. On a seeded database the basic salary
was therefore an allowance — counted in the deduction basis and again in gross.
The schema even carried the field meant to settle it (`classification`) and
nothing read it. One concept, one code, and the classification read from the
row rather than guessed from a string. A rule expressed as "everything except
X" breaks the day X is spelled differently.

## A derived counter that is initialised and never incremented

`earlyLeaveDays` and `overtimeMinutes` were set to 0, offered as triggers in
the schema and the UI, and never written — so the rules that used them did
nothing, silently. A trigger enum is a promise; if a branch cannot produce its
number, the trigger should not be offered.

## A retention setting with no job

`photoRetentionDays` and a `RetentionPolicy` table existed, the settings page
had the fields, and no job read either. A stored retention number with nothing
that acts on it is worse than none: it reads as compliance. Retention needs a
job, one source for the number, and a test that the job deletes.

## "Recorded" that no one records

Payroll refused to run while any work day had no attendance row, and nothing
in the system ever wrote an absence — so the two halves deadlocked and no
payslip could be produced. Time-and-attendance practice is the other way
round: record the exception, assume present. Before blocking on "the data is
incomplete", ask who is supposed to complete it and whether that writer
exists.

## A punch written in two statements with no transaction

`selfCheckIn` saved the day row, then created its evidence row. The two writes
were sequential, so a failure between them left a recorded punch with no
selfie — and the retry was then refused as "already checked in", stranding the
row for good. `selfCheckOut` had the same split. Worse, the "already checked
in" read sat *before* the write, so two concurrent requests could both see an
empty day and both write. The fix is one transaction around both writes plus a
per-staff advisory lock (`pg_advisory_xact_lock`, namespaced) held for the
whole unit of work, with the existence check re-read inside the lock. A state
change whose precondition is another row must make both writes and the check
one atomic step; a guard read outside the write is a race, and a partial write
is a stranded record.

## A retention sweep that loads the whole history

The selfie retention job read *every* record that had a photo on each daily
run to decide which shared uploads could still be referenced — memory and scan
time grew with the full retained history, not with the day's work. Only rows
that can have expired need reading: bound the scan by the shortest retention
window in force, and count the unexpired references that could still share a
file with one grouped query (`groupBy` on the URL) instead of loading them.
Also delete each file at most once per run when several expired rows share it.
A sweep that runs daily must cost O(what is due), not O(all history).
