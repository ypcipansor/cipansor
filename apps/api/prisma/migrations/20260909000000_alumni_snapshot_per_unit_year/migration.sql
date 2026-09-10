-- ISSUE #3: A student progresses across units (TK -> SD IT -> SMP IT -> SMA
-- Qur'an) and may graduate from each. The Alumni table used to hold exactly one
-- mutable row per student (unique on student_id), so graduating from unit B
-- overwrote the snapshot created when they graduated from unit A — unit A lost
-- its alumnus record and its per-unit alumni lists/analytics were wrong.
--
-- This migration makes each graduation its own immutable snapshot: drop the
-- unique index on student_id and replace it with a composite unique on
-- (student_id, unit_id, graduation_year). Existing data has one row per student,
-- so the composite unique is not violated by backfilling.
--
-- Step 1: Drop the one-row-per-student unique constraint.
DROP INDEX IF EXISTS "alumni_student_id_key";

-- Step 2: Enforce at most one graduation snapshot per (student, unit, year).
CREATE UNIQUE INDEX IF NOT EXISTS "alumni_student_id_unit_id_graduation_year_key"
ON "alumni"("student_id", "unit_id", "graduation_year");