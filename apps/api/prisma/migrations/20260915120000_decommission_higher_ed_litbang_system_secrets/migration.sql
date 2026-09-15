-- Decommission higher-education (Perguruan Tinggi), Litbang/R&D, and
-- system-secrets. The application code and the Prisma schema were removed
-- first; this migration reconciles databases that were deployed before the
-- purge, without touching the 0_init baseline.
--
-- NOTE: `0_init` must never be edited after it has been deployed — existing
-- databases never re-run it. Enum values, tables and columns removed from the
-- schema are handled here instead.

-- ---------------------------------------------------------------------------
-- 1. Higher-education tables (out of scope)
-- ---------------------------------------------------------------------------
-- Drop the `environment_programs.course_id` FK + column before its target
-- table (higher_ed_courses); the column was a Higher-Ed integration point.
ALTER TABLE "environment_programs" DROP CONSTRAINT IF EXISTS "environment_programs_course_id_fkey";
ALTER TABLE "environment_programs" DROP COLUMN IF EXISTS "course_id";

-- `krs_course_enrollments` -> `krs` -> `students_higher_ed` -> `study_programs`
-- -> `faculties`, and `higher_ed_course_classes` -> `higher_ed_courses` ->
-- `study_programs`. Dropping in reverse dependency order keeps FKs valid.
DROP TABLE IF EXISTS "krs_course_enrollments" CASCADE;
DROP TABLE IF EXISTS "krs" CASCADE;
DROP TABLE IF EXISTS "students_higher_ed" CASCADE;
DROP TABLE IF EXISTS "higher_ed_course_classes" CASCADE;
DROP TABLE IF EXISTS "higher_ed_courses" CASCADE;
DROP TABLE IF EXISTS "study_programs" CASCADE;
DROP TABLE IF EXISTS "faculties" CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Litbang / R&D tables (module deleted, no remaining code/seed)
-- ---------------------------------------------------------------------------
-- `research_milestones` -> `research_projects`; `innovation_proposals` is
-- standalone. `research_projects.budget_id` is removed with the table.
DROP TABLE IF EXISTS "research_milestones" CASCADE;
DROP TABLE IF EXISTS "research_projects" CASCADE;
DROP TABLE IF EXISTS "innovation_proposals" CASCADE;

-- The two enums were only used by the dropped columns above.
DROP TYPE IF EXISTS "ResearchStatus";
DROP TYPE IF EXISTS "InnovationStatus";

-- ---------------------------------------------------------------------------
-- 3. System-secrets table (API + UI removed; ciphertext no longer used)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "system_secrets" CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Enum drift
-- ---------------------------------------------------------------------------
-- Databases deployed before this change still carry the `PERGURUAN_TINGGI`
-- unit type / realm, while the regenerated Prisma client no longer accepts
-- them. Re-home any rows still pointing at the dropped values to a surviving
-- one BEFORE recreating the type, otherwise the ALTER would fail on old data.
--
--   * units.type            -> OTHER
--   * daily_student_reports.unit_type -> OTHER
--   * roles.realm           -> UNIT_USAHA (the closest remaining non-school realm)
UPDATE "units" SET "type" = 'OTHER' WHERE "type"::text = 'PERGURUAN_TINGGI';
UPDATE "daily_student_reports" SET "unit_type" = 'OTHER' WHERE "unit_type"::text = 'PERGURUAN_TINGGI';
UPDATE "roles" SET "realm" = 'UNIT_USAHA' WHERE "realm"::text = 'PERGURUAN_TINGGI';

ALTER TYPE "UnitType" RENAME TO "UnitType_old";
CREATE TYPE "UnitType" AS ENUM ('PESANTREN', 'TK_QURAN', 'SD_IT', 'SMP_IT', 'SMA_QURAN', 'UNIT_USAHA', 'OTHER');
ALTER TABLE "units" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "units" ALTER COLUMN "type" TYPE "UnitType" USING ("type"::text::"UnitType");
ALTER TABLE "daily_student_reports" ALTER COLUMN "unit_type" TYPE "UnitType" USING ("unit_type"::text::"UnitType");
DROP TYPE "UnitType_old";

ALTER TYPE "Realm" RENAME TO "Realm_old";
CREATE TYPE "Realm" AS ENUM ('GLOBAL', 'YAYASAN', 'TK_QURAN', 'SD_IT', 'SMP_IT', 'SMA_QURAN', 'PESANTREN', 'UNIT_USAHA');
ALTER TABLE "roles" ALTER COLUMN "realm" TYPE "Realm" USING ("realm"::text::"Realm");
DROP TYPE "Realm_old";

-- The `RoleCode` enum carries the PT_* role values. Nothing declares a column
-- of this type today (`roles.code` and all `*_role_code` columns are TEXT), so
-- dropping the values only requires recreating the type. This block is
-- defensive: it is valid whether or not a column exists.
ALTER TYPE "RoleCode" RENAME TO "RoleCode_old";
CREATE TYPE "RoleCode" AS ENUM (
  'SUPER_ADMIN',
  'YAYASAN_PEMBINA', 'YAYASAN_KETUA', 'YAYASAN_SEKRETARIS', 'YAYASAN_BENDAHARA', 'YAYASAN_ANGGOTA', 'YAYASAN_PENGAWAS',
  'TKQ_ADMIN', 'TKQ_KEPALA_SEKOLAH', 'TKQ_WAKASEK', 'TKQ_GURU', 'TKQ_WALI_KELAS', 'TKQ_TATA_USAHA', 'TKQ_BENDAHARA', 'TKQ_KOMITE', 'TKQ_ORANG_TUA',
  'SDIT_ADMIN', 'SDIT_KEPALA_SEKOLAH', 'SDIT_WAKASEK', 'SDIT_GURU', 'SDIT_WALI_KELAS', 'SDIT_TATA_USAHA', 'SDIT_BENDAHARA', 'SDIT_KOMITE', 'SDIT_ORANG_TUA', 'SDIT_SISWA',
  'SMPIT_ADMIN', 'SMPIT_KEPALA_SEKOLAH', 'SMPIT_WAKASEK', 'SMPIT_GURU', 'SMPIT_WALI_KELAS', 'SMPIT_GURU_BK', 'SMPIT_TATA_USAHA', 'SMPIT_BENDAHARA', 'SMPIT_KOMITE', 'SMPIT_ORANG_TUA', 'SMPIT_SISWA', 'SMPIT_ALUMNI',
  'SMAQ_ADMIN', 'SMAQ_KEPALA_SEKOLAH', 'SMAQ_WAKASEK', 'SMAQ_GURU', 'SMAQ_WALI_KELAS', 'SMAQ_GURU_BK', 'SMAQ_TATA_USAHA', 'SMAQ_BENDAHARA', 'SMAQ_KOMITE', 'SMAQ_ORANG_TUA', 'SMAQ_SISWA', 'SMAQ_ALUMNI',
  'PESANTREN_PENGASUH', 'PESANTREN_DIREKTUR', 'PESANTREN_TATA_USAHA',
  'USTADZ', 'MUSYRIF', 'MUSYRIFAH', 'MUHAFIDZ', 'MUHAFIDZAH', 'MURABBI', 'WALI_KAMAR',
  'PUSTAKAWAN', 'PERAWAT', 'KEAMANAN', 'LABORAN',
  'BUSINESS_MANAGER', 'BUSINESS_STAFF'
);
DROP TYPE "RoleCode_old";

-- Remove higher-education role rows from `roles` (code is TEXT, not the
-- RoleCode enum) so no role survives with a code the schema no longer lists.
DELETE FROM "user_role_assignments"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "code" IN (
  'PT_REKTOR', 'PT_WAKIL_REKTOR', 'PT_DEKAN', 'PT_KAPRODI', 'PT_DOSEN',
  'PT_MAHASISWA', 'PT_STAF_AKADEMIK', 'PT_TATA_USAHA', 'PT_ALUMNI'
));
DELETE FROM "roles" WHERE "code" IN (
  'PT_REKTOR', 'PT_WAKIL_REKTOR', 'PT_DEKAN', 'PT_KAPRODI', 'PT_DOSEN',
  'PT_MAHASISWA', 'PT_STAF_AKADEMIK', 'PT_TATA_USAHA', 'PT_ALUMNI'
);
