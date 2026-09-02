-- Migration Strategy: Data Retention & Archiving
-- Replaces outright table deletion with renaming to `archived_pkg_*` tables.
-- Preserves all historical teacher evaluation records (scores, evidence, uploaded documents) for auditing and compliance.
--
-- Rollback Strategy:
-- Execute the following SQL to restore the active PKG table names and re-add foreign keys if needed:
--   ALTER TABLE IF EXISTS "archived_pkg_documents" RENAME TO "pkg_documents";
--   ALTER TABLE IF EXISTS "archived_pkg_details" RENAME TO "pkg_details";
--   ALTER TABLE IF EXISTS "archived_pkg_evaluations" RENAME TO "pkg_evaluations";
--   ALTER TABLE IF EXISTS "archived_pkg_periods" RENAME TO "pkg_periods";

-- Drop Foreign Keys to decouple historical PKG data from active schema constraints
ALTER TABLE "pkg_periods" DROP CONSTRAINT IF EXISTS "pkg_periods_unit_id_fkey";
ALTER TABLE "pkg_periods" DROP CONSTRAINT IF EXISTS "pkg_periods_academic_year_id_fkey";
ALTER TABLE "pkg_evaluations" DROP CONSTRAINT IF EXISTS "pkg_evaluations_period_id_fkey";
ALTER TABLE "pkg_evaluations" DROP CONSTRAINT IF EXISTS "pkg_evaluations_teacher_id_fkey";
ALTER TABLE "pkg_evaluations" DROP CONSTRAINT IF EXISTS "pkg_evaluations_assessor_id_fkey";
ALTER TABLE "pkg_details" DROP CONSTRAINT IF EXISTS "pkg_details_evaluation_id_fkey";
ALTER TABLE "pkg_documents" DROP CONSTRAINT IF EXISTS "pkg_documents_evaluation_id_fkey";

-- Archive Historical Tables (Rename instead of DROP)
ALTER TABLE IF EXISTS "pkg_documents" RENAME TO "archived_pkg_documents";
ALTER TABLE IF EXISTS "pkg_details" RENAME TO "archived_pkg_details";
ALTER TABLE IF EXISTS "pkg_evaluations" RENAME TO "archived_pkg_evaluations";
ALTER TABLE IF EXISTS "pkg_periods" RENAME TO "archived_pkg_periods";
