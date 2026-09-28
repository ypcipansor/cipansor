-- Pesantren role catalogue (decided by the yayasan 2026-09-24/25):
--
--   * PESANTREN_DIREKTUR is removed. Cipansor has no operational director; the
--     Kiai is Pimpinan Pesantren (UU 18/2019 Ps. 9 ayat 2) and keeps the
--     PESANTREN_PENGASUH code, relabelled "Pimpinan Pesantren (Kiai)".
--   * One role per duty, not per gender: MUSYRIFAH -> MUSYRIF and
--     MUHAFIDZAH -> MUHAFIDZ (putra/putri follows the asrama or halaqah).
--   * Wali kamar and murabbi are musyrif duties: WALI_KAMAR, MURABBI -> MUSYRIF.
--
-- `roles.code` is plain TEXT and no column is typed "RoleCode" (see
-- 20260915120000_decommission_higher_ed_litbang), so the work is on rows:
-- assignments move to the surviving role, then the old role rows go. Every
-- step is written to be a no-op on a database without these roles (a fresh
-- `db push` with no seed).
--
-- One explicit transaction. Measured on a replay (2026-09-25): without it
-- `prisma migrate deploy` ran these statements one by one, so each
-- `ON COMMIT DROP` temp table vanished before the next statement read it —
-- and a failure halfway would have left the roles half merged. (The PT
-- decommission uses the same temp-table pattern without one and applied
-- cleanly on that same replay; the visible difference is its DO $…$ blocks.)
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Merge the variants into MUSYRIF / MUHAFIDZ
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "role_merge_tmp";
CREATE TEMP TABLE "role_merge_tmp" (old_code text PRIMARY KEY, new_code text NOT NULL) ON COMMIT DROP;
INSERT INTO "role_merge_tmp" (old_code, new_code) VALUES
  ('MUSYRIFAH', 'MUSYRIF'),
  ('WALI_KAMAR', 'MUSYRIF'),
  ('MURABBI', 'MUSYRIF'),
  ('MUHAFIDZAH', 'MUHAFIDZ');

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
-- up as. A user can hold two of them in the same scope (MUSYRIF and
-- WALI_KAMAR, or WALI_KAMAR and MURABBI): those fold into one row, because
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

UPDATE "roles"
SET "name" = 'Musyrif / Musyrifah',
    "description" = 'Pembina asrama, wali kamar dan pembina akhlak (murabbi), putra atau putri',
    "updated_at" = now()
WHERE "code" = 'MUSYRIF';

UPDATE "roles"
SET "name" = 'Muhafidz / Muhafidzah',
    "description" = 'Pengampu tahfidz, putra atau putri',
    "updated_at" = now()
WHERE "code" = 'MUHAFIDZ';

-- ---------------------------------------------------------------------------
-- 2. Remove PESANTREN_DIREKTUR
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "direktur_roles_tmp";
CREATE TEMP TABLE "direktur_roles_tmp" ON COMMIT DROP AS
SELECT "id" FROM "roles" WHERE "code" = 'PESANTREN_DIREKTUR';

-- Holders left with no other active role are deactivated, not deleted: the
-- account and everything it authored stay. Captured before the assignments
-- go, since afterwards nothing marks them as former direktur. The same
-- definition of "active" as the runtime's activeRoleWhere().
DROP TABLE IF EXISTS "direktur_only_users_tmp";
CREATE TEMP TABLE "direktur_only_users_tmp" ON COMMIT DROP AS
SELECT DISTINCT a."user_id"
FROM "user_role_assignments" a
WHERE a."role_id" IN (SELECT "id" FROM "direktur_roles_tmp")
  AND NOT EXISTS (
    SELECT 1
    FROM "user_role_assignments" b
    WHERE b."user_id" = a."user_id"
      AND b."role_id" NOT IN (SELECT "id" FROM "direktur_roles_tmp")
      AND b."is_active"
      AND (b."expires_at" IS NULL OR b."expires_at" > now())
  );

DELETE FROM "user_role_assignments"
WHERE "role_id" IN (SELECT "id" FROM "direktur_roles_tmp");
DELETE FROM "roles" WHERE "id" IN (SELECT "id" FROM "direktur_roles_tmp");

-- Login refuses an inactive user; revoking the refresh tokens and clearing the
-- legacy `users.role` fallback stops an open session from renewing itself (the
-- same three steps as the PT decommission). An access token already issued
-- lives out its TTL (15 minutes).
DELETE FROM "refresh_tokens"
WHERE "user_id" IN (SELECT "user_id" FROM "direktur_only_users_tmp");
UPDATE "users"
SET "is_active" = false, "role" = NULL, "updated_at" = now()
WHERE "id" IN (SELECT "user_id" FROM "direktur_only_users_tmp");

-- ---------------------------------------------------------------------------
-- 3. The Kiai's label
-- ---------------------------------------------------------------------------
UPDATE "roles"
SET "name" = 'Pimpinan Pesantren (Kiai)',
    "description" = 'Kiai — pengasuh dan pemimpin tertinggi pesantren (UU 18/2019 Ps. 9 ayat 2)',
    "updated_at" = now()
WHERE "code" = 'PESANTREN_PENGASUH';

-- ---------------------------------------------------------------------------
-- 4. The RoleCode enum
-- ---------------------------------------------------------------------------
-- No column is of this type, so dropping values only means recreating it.
ALTER TYPE "RoleCode" RENAME TO "RoleCode_old";
CREATE TYPE "RoleCode" AS ENUM (
  'SUPER_ADMIN',
  'YAYASAN_PEMBINA', 'YAYASAN_KETUA', 'YAYASAN_SEKRETARIS', 'YAYASAN_BENDAHARA', 'YAYASAN_ANGGOTA', 'YAYASAN_PENGAWAS',
  'TKQ_ADMIN', 'TKQ_KEPALA_SEKOLAH', 'TKQ_WAKASEK', 'TKQ_GURU', 'TKQ_WALI_KELAS', 'TKQ_TATA_USAHA', 'TKQ_BENDAHARA', 'TKQ_KOMITE', 'TKQ_ORANG_TUA',
  'SDIT_ADMIN', 'SDIT_KEPALA_SEKOLAH', 'SDIT_WAKASEK', 'SDIT_GURU', 'SDIT_WALI_KELAS', 'SDIT_TATA_USAHA', 'SDIT_BENDAHARA', 'SDIT_KOMITE', 'SDIT_ORANG_TUA', 'SDIT_SISWA',
  'SMPIT_ADMIN', 'SMPIT_KEPALA_SEKOLAH', 'SMPIT_WAKASEK', 'SMPIT_GURU', 'SMPIT_WALI_KELAS', 'SMPIT_GURU_BK', 'SMPIT_TATA_USAHA', 'SMPIT_BENDAHARA', 'SMPIT_KOMITE', 'SMPIT_ORANG_TUA', 'SMPIT_SISWA', 'SMPIT_ALUMNI',
  'SMAQ_ADMIN', 'SMAQ_KEPALA_SEKOLAH', 'SMAQ_WAKASEK', 'SMAQ_GURU', 'SMAQ_WALI_KELAS', 'SMAQ_GURU_BK', 'SMAQ_TATA_USAHA', 'SMAQ_BENDAHARA', 'SMAQ_KOMITE', 'SMAQ_ORANG_TUA', 'SMAQ_SISWA', 'SMAQ_ALUMNI',
  'PESANTREN_PENGASUH', 'PESANTREN_TATA_USAHA',
  'USTADZ', 'MUSYRIF', 'MUHAFIDZ',
  'PUSTAKAWAN', 'PERAWAT', 'KEAMANAN', 'LABORAN',
  'BUSINESS_MANAGER', 'BUSINESS_STAFF'
);
DROP TYPE "RoleCode_old";

COMMIT;
