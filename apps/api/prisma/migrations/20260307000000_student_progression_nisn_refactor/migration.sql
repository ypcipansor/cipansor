-- Drop nis indexes and column from students table if it exists
DROP INDEX IF EXISTS "students_nis_key";
DROP INDEX IF EXISTS "students_nis_idx";

ALTER TABLE "students" DROP COLUMN IF EXISTS "nis";

-- Create unique indexes on students(nisn) and students(nik)
CREATE UNIQUE INDEX IF NOT EXISTS "students_nisn_key" ON "students"("nisn");
CREATE UNIQUE INDEX IF NOT EXISTS "students_nik_key" ON "students"("nik");

-- Add parent/guardian detail fields and internal alumni re-enrollment flags to registrants table
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
