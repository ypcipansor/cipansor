-- Step 1: Backfill missing nisn or nik from legacy nis column before dropping it
UPDATE "students"
SET "nisn" = "nis"
WHERE "nisn" IS NULL AND "nis" IS NOT NULL AND "nis" != '';

UPDATE "students"
SET "nik" = "nis"
WHERE "nik" IS NULL AND "nisn" IS NULL AND "nis" IS NOT NULL AND "nis" != '';

-- Step 2: Handle duplicate nisn/nik values if any exist by setting duplicate entries to NULL
WITH nisn_duplicates AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "nisn" ORDER BY "created_at" ASC) as rn
  FROM "students"
  WHERE "nisn" IS NOT NULL
)
UPDATE "students"
SET "nisn" = NULL
WHERE "id" IN (SELECT "id" FROM nisn_duplicates WHERE rn > 1);

WITH nik_duplicates AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "nik" ORDER BY "created_at" ASC) as rn
  FROM "students"
  WHERE "nik" IS NOT NULL
)
UPDATE "students"
SET "nik" = NULL
WHERE "id" IN (SELECT "id" FROM nik_duplicates WHERE rn > 1);

-- Step 3: Drop nis indexes and column from students table
DROP INDEX IF EXISTS "students_nis_key";
DROP INDEX IF EXISTS "students_nis_idx";

ALTER TABLE "students" DROP COLUMN IF EXISTS "nis";

-- Step 4: Create unique indexes on students(nisn) and students(nik)
CREATE UNIQUE INDEX IF NOT EXISTS "students_nisn_key" ON "students"("nisn");
CREATE UNIQUE INDEX IF NOT EXISTS "students_nik_key" ON "students"("nik");

-- Step 5: Add parent/guardian detail fields and internal alumni re-enrollment flags to registrants table
ALTER TABLE "registrants"
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
