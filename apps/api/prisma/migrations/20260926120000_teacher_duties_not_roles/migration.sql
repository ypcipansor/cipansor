-- Wakasek and wali kelas are duties of a guru, not role codes (decided by the
-- yayasan 2026-09-26):
--
--   * A wakil kepala sekolah and a wali kelas are teachers with an added duty
--     (tugas tambahan), not a separate function. Wali kelas is already a
--     relation — `classes.homeroom_teacher_id`, the Dapodik rombel field "Guru /
--     Wali Kelas" — and nothing read the role to decide anything the relation
--     did not. Wakasek had no screen or rule of its own.
--   * So every `*_WAKASEK` and `*_WALI_KELAS` assignment becomes a `*_GURU`
--     assignment of the same unit. Nobody is deactivated: each holder is a
--     teacher and keeps their access as one.
--
-- The merge is the one written and replayed for 20260925000000_pesantren_role_catalog
-- (section 1 there), with this mapping; see that file for why each step is
-- shaped the way it is. `roles.code` is plain TEXT and no column is typed
-- "RoleCode", so the work is on rows, and every step is a no-op on a database
-- without these roles. One explicit transaction, for the reason given there.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Merge WAKASEK and WALI_KELAS into GURU, unit by unit
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "role_merge_tmp";
CREATE TEMP TABLE "role_merge_tmp" (old_code text PRIMARY KEY, new_code text NOT NULL) ON COMMIT DROP;
INSERT INTO "role_merge_tmp" (old_code, new_code) VALUES
  ('TKQ_WAKASEK', 'TKQ_GURU'),
  ('TKQ_WALI_KELAS', 'TKQ_GURU'),
  ('SDIT_WAKASEK', 'SDIT_GURU'),
  ('SDIT_WALI_KELAS', 'SDIT_GURU'),
  ('SMPIT_WAKASEK', 'SMPIT_GURU'),
  ('SMPIT_WALI_KELAS', 'SMPIT_GURU'),
  ('SMAQ_WAKASEK', 'SMAQ_GURU'),
  ('SMAQ_WALI_KELAS', 'SMAQ_GURU');

-- A database that has an old role but not its target keeps the oldest old row
-- under the target code, so its assignments still have a role to land on.
UPDATE "roles" r
SET "code" = pick.new_code, "updated_at" = now()
FROM (
  SELECT DISTINCT ON (m.new_code) m.new_code, o."id"
  FROM "role_merge_tmp" m
  JOIN "roles" o ON o."code" = m.old_code
  WHERE NOT EXISTS (SELECT 1 FROM "roles" t WHERE t."code" = m.new_code)
  ORDER BY m.new_code, o."created_at", o."id"
) pick
WHERE r."id" = pick."id";

DROP TABLE IF EXISTS "role_merge_ids_tmp";
CREATE TEMP TABLE "role_merge_ids_tmp" ON COMMIT DROP AS
SELECT o."id" AS old_id, n."id" AS new_id
FROM "role_merge_tmp" m
JOIN "roles" o ON o."code" = m.old_code
JOIN "roles" n ON n."code" = m.new_code;

-- Every assignment of a merged role or of its target, with the role it ends
-- up as. A user can hold two of them in the same unit (SMPIT_GURU and
-- SMPIT_WALI_KELAS is the usual case: the seed's presentation package gives a
-- homeroom teacher both): those fold into one row, because
-- (user_id, role_id, unit_id) is unique.
DROP TABLE IF EXISTS "role_merge_rows_tmp";
CREATE TEMP TABLE "role_merge_rows_tmp" ON COMMIT DROP AS
SELECT
  a."id",
  a."user_id",
  a."unit_id",
  COALESCE(mi.new_id, a."role_id") AS new_id,
  (mi.old_id IS NULL) AS already_target,
  a."is_active",
  a."is_primary",
  a."assigned_at"
FROM "user_role_assignments" a
LEFT JOIN "role_merge_ids_tmp" mi ON mi.old_id = a."role_id"
WHERE a."role_id" IN (SELECT old_id FROM "role_merge_ids_tmp")
   OR a."role_id" IN (SELECT new_id FROM "role_merge_ids_tmp");

-- One row survives per (user, role, scope): the existing target-role row if
-- there is one, else the active, earliest-assigned one. It inherits the
-- group's flags, so nobody loses an active role or their primary flag.
-- `expires_at` stays the survivor's own: nothing writes that column (pinned
-- by decommissioned-modules.guard.test.ts), so it is NULL throughout.
DROP TABLE IF EXISTS "role_merge_groups_tmp";
CREATE TEMP TABLE "role_merge_groups_tmp" ON COMMIT DROP AS
SELECT
  keep."id" AS keep_id,
  keep.new_id,
  agg.any_active,
  agg.any_primary
FROM (
  SELECT DISTINCT ON ("user_id", new_id, "unit_id") "id", "user_id", new_id, "unit_id"
  FROM "role_merge_rows_tmp"
  ORDER BY "user_id", new_id, "unit_id", already_target DESC, "is_active" DESC, "assigned_at", "id"
) keep
JOIN (
  SELECT
    "user_id",
    new_id,
    "unit_id",
    bool_or("is_active") AS any_active,
    bool_or("is_primary") AS any_primary
  FROM "role_merge_rows_tmp"
  GROUP BY "user_id", new_id, "unit_id"
) agg
  ON agg."user_id" = keep."user_id"
 AND agg.new_id = keep.new_id
 AND agg."unit_id" IS NOT DISTINCT FROM keep."unit_id";

DELETE FROM "user_role_assignments"
WHERE "id" IN (SELECT "id" FROM "role_merge_rows_tmp")
  AND "id" NOT IN (SELECT keep_id FROM "role_merge_groups_tmp");

UPDATE "user_role_assignments" a
SET "role_id" = g.new_id,
    "is_active" = g.any_active,
    "is_primary" = g.any_primary,
    "updated_at" = now()
FROM "role_merge_groups_tmp" g
WHERE a."id" = g.keep_id;

DELETE FROM "roles" WHERE "id" IN (SELECT old_id FROM "role_merge_ids_tmp");

-- ---------------------------------------------------------------------------
-- 2. The RoleCode enum
-- ---------------------------------------------------------------------------
-- No column is of this type, so dropping values only means recreating it.
ALTER TYPE "RoleCode" RENAME TO "RoleCode_old";
CREATE TYPE "RoleCode" AS ENUM (
  'SUPER_ADMIN',
  'YAYASAN_PEMBINA', 'YAYASAN_KETUA', 'YAYASAN_SEKRETARIS', 'YAYASAN_BENDAHARA', 'YAYASAN_ANGGOTA', 'YAYASAN_PENGAWAS',
  'TKQ_ADMIN', 'TKQ_KEPALA_SEKOLAH', 'TKQ_GURU', 'TKQ_TATA_USAHA', 'TKQ_BENDAHARA', 'TKQ_KOMITE', 'TKQ_ORANG_TUA',
  'SDIT_ADMIN', 'SDIT_KEPALA_SEKOLAH', 'SDIT_GURU', 'SDIT_TATA_USAHA', 'SDIT_BENDAHARA', 'SDIT_KOMITE', 'SDIT_ORANG_TUA', 'SDIT_SISWA',
  'SMPIT_ADMIN', 'SMPIT_KEPALA_SEKOLAH', 'SMPIT_GURU', 'SMPIT_GURU_BK', 'SMPIT_TATA_USAHA', 'SMPIT_BENDAHARA', 'SMPIT_KOMITE', 'SMPIT_ORANG_TUA', 'SMPIT_SISWA', 'SMPIT_ALUMNI',
  'SMAQ_ADMIN', 'SMAQ_KEPALA_SEKOLAH', 'SMAQ_GURU', 'SMAQ_GURU_BK', 'SMAQ_TATA_USAHA', 'SMAQ_BENDAHARA', 'SMAQ_KOMITE', 'SMAQ_ORANG_TUA', 'SMAQ_SISWA', 'SMAQ_ALUMNI',
  'PESANTREN_PENGASUH', 'PESANTREN_TATA_USAHA',
  'USTADZ', 'MUSYRIF', 'MUHAFIDZ',
  'PUSTAKAWAN', 'PERAWAT', 'KEAMANAN', 'LABORAN',
  'BUSINESS_MANAGER', 'BUSINESS_STAFF'
);
DROP TYPE "RoleCode_old";

COMMIT;
