-- Step 1: Add legacy_nis column to students to preserve historic NIS values
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "legacy_nis" TEXT;

-- Guard the nis backfill: the 0_init baseline still creates the legacy `nis`
-- column (it is left untouched so the baseline checksum stays stable), so both
-- a fresh DB (0_init -> this migration) and an old DB that shipped before the
-- NISN/NIK refactor carry `nis`. The IF EXISTS guard only runs the backfill
-- when the column is in fact present, so the migration is identical for both
-- paths.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'nis'
  ) THEN
    UPDATE "students"
    SET "legacy_nis" = "nis"
    WHERE "nis" IS NOT NULL AND "nis" != '';
  END IF;
END $$;

-- Step 2: Backfill nisn if legacy nis is exactly 10 digits and nisn is currently null
UPDATE "students"
SET "nisn" = "legacy_nis"
WHERE "nisn" IS NULL AND "legacy_nis" ~ '^[0-9]{10}$';

-- Backfill nik if legacy nis is exactly 16 digits and nik is currently null
UPDATE "students"
SET "nik" = "legacy_nis"
WHERE "nik" IS NULL AND "legacy_nis" ~ '^[0-9]{16}$';

-- Step 3: Create audit table for recording any duplicate identifiers before nullifying
CREATE TABLE IF NOT EXISTS "legacy_identifier_audit" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" TEXT NOT NULL,
  "identifier_type" TEXT NOT NULL,
  "original_value" TEXT NOT NULL,
  "action_taken" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Log duplicate nisn
INSERT INTO "legacy_identifier_audit" ("student_id", "identifier_type", "original_value", "action_taken")
SELECT "id", 'NISN', "nisn", 'NULLIFIED_DUPLICATE'
FROM (
  SELECT "id", "nisn", ROW_NUMBER() OVER (PARTITION BY "nisn" ORDER BY "created_at" ASC) as rn
  FROM "students"
  WHERE "nisn" IS NOT NULL
) dupes
WHERE rn > 1;

-- Nullify duplicate nisn
WITH nisn_duplicates AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "nisn" ORDER BY "created_at" ASC) as rn
  FROM "students"
  WHERE "nisn" IS NOT NULL
)
UPDATE "students"
SET "nisn" = NULL
WHERE "id" IN (SELECT "id" FROM nisn_duplicates WHERE rn > 1);

-- Log duplicate nik
INSERT INTO "legacy_identifier_audit" ("student_id", "identifier_type", "original_value", "action_taken")
SELECT "id", 'NIK', "nik", 'NULLIFIED_DUPLICATE'
FROM (
  SELECT "id", "nik", ROW_NUMBER() OVER (PARTITION BY "nik" ORDER BY "created_at" ASC) as rn
  FROM "students"
  WHERE "nik" IS NOT NULL
) dupes
WHERE rn > 1;

-- Nullify duplicate nik
WITH nik_duplicates AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "nik" ORDER BY "created_at" ASC) as rn
  FROM "students"
  WHERE "nik" IS NOT NULL
)
UPDATE "students"
SET "nik" = NULL
WHERE "id" IN (SELECT "id" FROM nik_duplicates WHERE rn > 1);

-- Step 4: Drop old nis indexes and column
DROP INDEX IF EXISTS "students_nis_key";
DROP INDEX IF EXISTS "students_nis_idx";

ALTER TABLE "students" DROP COLUMN IF EXISTS "nis";

-- Step 5: Create unique indexes on students(nisn) and students(nik)
CREATE UNIQUE INDEX IF NOT EXISTS "students_nisn_key" ON "students"("nisn");
CREATE UNIQUE INDEX IF NOT EXISTS "students_nik_key" ON "students"("nik");

-- Step 6: Drop unique index on registrants(student_id) to support re-enrollment across multiple units
DROP INDEX IF EXISTS "registrants_student_id_key";
CREATE INDEX IF NOT EXISTS "registrants_student_id_idx" ON "registrants"("student_id");

-- Step 7: Add parent/guardian detail fields and internal alumni re-enrollment flags to registrants table
-- Step 7: Add nisn, nik, parent/guardian detail fields and internal alumni re-enrollment flags to registrants table
ALTER TABLE "registrants"
ADD COLUMN IF NOT EXISTS "nisn" TEXT,
ADD COLUMN IF NOT EXISTS "nik" TEXT,
ADD COLUMN IF NOT EXISTS "father_nik" TEXT,
ADD COLUMN IF NOT EXISTS "father_occupation" TEXT,
ADD COLUMN IF NOT EXISTS "father_income_range" TEXT,
ADD COLUMN IF NOT EXISTS "mother_nik" TEXT,
ADD COLUMN IF NOT EXISTS "mother_occupation" TEXT,
ADD COLUMN IF NOT EXISTS "mother_income_range" TEXT,
ADD COLUMN IF NOT EXISTS "guardian_name" TEXT,
ADD COLUMN IF NOT EXISTS "guardian_nik" TEXT,
ADD COLUMN IF NOT EXISTS "guardian_occupation" TEXT,
ADD COLUMN IF NOT EXISTS "guardian_phone" TEXT,
ADD COLUMN IF NOT EXISTS "is_internal_alumni" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "previous_student_id" TEXT,
ADD COLUMN IF NOT EXISTS "internal_nisn" TEXT,
ADD COLUMN IF NOT EXISTS "internal_nik" TEXT;
