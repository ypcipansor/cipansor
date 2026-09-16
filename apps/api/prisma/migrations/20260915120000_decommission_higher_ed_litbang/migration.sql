-- Decommission higher-education (Perguruan Tinggi) and Litbang/R&D. The
-- application code and the Prisma schema were removed first; this migration
-- reconciles databases that were deployed before the purge, without touching
-- the 0_init baseline.
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
-- 3. Unit purge + enum drift
-- ---------------------------------------------------------------------------
-- The PT unit is deleted outright (owner decision), not re-typed. A plain
-- `DELETE FROM units` is not enough: 86 of the FKs pointing at `units` are
-- `NO ACTION`/`RESTRICT`, and deleting a unit therefore requires deleting every
-- row that depends on it first. The block below walks the live FK catalog to
-- find that closure and delete it leaf-first, so it stays correct as the schema
-- grows instead of hard-coding a table list that silently rots.
--
-- Edges followed: `NO ACTION`, `RESTRICT` and `CASCADE` -- a row that cannot
-- outlive the unit. Edges *not* followed: `SET NULL` / `SET DEFAULT` (there are
-- 20 from `units`), which the database resolves by itself; those rows are meant
-- to survive the unit, `users.unit_id` above all. A PT-only login therefore
-- keeps its account with `unit_id = NULL`; section 4 below then ends its
-- session.
--
-- Blast radius: everything the unit owns -- its classes, students, teachers,
-- staff, departments, budgets, letters, assets, attendance, invoices, etc.
-- (130 tables are transitively reachable, depth <= 5). This is why the deploy
-- runbook requires a verified backup BEFORE `prisma migrate deploy`.
DO $decommission_units$
DECLARE
  edge     record;
  inserted integer;
  total    integer;
BEGIN
  CREATE TEMPORARY TABLE _decommission_doomed (
    tbl text NOT NULL,
    id  text NOT NULL,
    PRIMARY KEY (tbl, id)
  ) ON COMMIT DROP;

  INSERT INTO _decommission_doomed (tbl, id)
  SELECT q.tbl, u.id
  FROM (
    SELECT format('%I.%I', n.nspname, c.relname) AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = 'units'::regclass
  ) q, units u
  WHERE u.type::text = 'PERGURUAN_TINGGI';

  IF NOT EXISTS (SELECT 1 FROM _decommission_doomed) THEN
    RAISE NOTICE 'decommission: no PERGURUAN_TINGGI units to delete';
    RETURN;
  END IF;

  -- Grow the doomed set until it reaches a fixpoint.
  LOOP
    total := 0;
    FOR edge IN
      SELECT format('%I.%I', cn.nspname, cc.relname) AS child,
             a.attname                               AS col,
             format('%I.%I', pn.nspname, pc.relname) AS parent
      FROM pg_constraint c
      JOIN pg_class cc     ON cc.oid = c.conrelid
      JOIN pg_namespace cn ON cn.oid = cc.relnamespace
      JOIN pg_class pc     ON pc.oid = c.confrelid
      JOIN pg_namespace pn ON pn.oid = pc.relnamespace
      JOIN pg_attribute a  ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND c.confdeltype IN ('a', 'r', 'c')
        AND format('%I.%I', pn.nspname, pc.relname) IN (SELECT tbl FROM _decommission_doomed)
    LOOP
      EXECUTE format(
        'INSERT INTO _decommission_doomed (tbl, id) '
        'SELECT %L, ch.id FROM %s ch '
        'WHERE ch.%I IN (SELECT id FROM _decommission_doomed WHERE tbl = %L) '
        'ON CONFLICT (tbl, id) DO NOTHING',
        edge.child, edge.child, edge.col, edge.parent
      );
      GET DIAGNOSTICS inserted = ROW_COUNT;
      total := total + inserted;
    END LOOP;
    EXIT WHEN total = 0;
  END LOOP;

  CREATE TEMPORARY TABLE _decommission_edges (
    child text NOT NULL, col text NOT NULL, parent text NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _decommission_edges (child, col, parent)
  SELECT DISTINCT format('%I.%I', cn.nspname, cc.relname),
                  a.attname,
                  format('%I.%I', pn.nspname, pc.relname)
  FROM pg_constraint c
  JOIN pg_class cc     ON cc.oid = c.conrelid
  JOIN pg_namespace cn ON cn.oid = cc.relnamespace
  JOIN pg_class pc     ON pc.oid = c.confrelid
  JOIN pg_namespace pn ON pn.oid = pc.relnamespace
  JOIN pg_attribute a  ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'f' AND c.confdeltype IN ('a', 'r', 'c');

  CREATE TEMPORARY TABLE _decommission_todo (tbl text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _decommission_todo SELECT DISTINCT tbl FROM _decommission_doomed;

  -- Delete leaves first: the batch holds every table none of whose remaining
  -- children is still pending, so each DELETE runs before the row it points at.
  -- The batch is empty only if the FK graph has a cycle -- raise rather than
  -- spin, so a future schema change fails loudly instead of hanging the deploy.
  WHILE EXISTS (SELECT 1 FROM _decommission_todo) LOOP
    CREATE TEMPORARY TABLE _decommission_batch ON COMMIT DROP AS
      SELECT t.tbl FROM _decommission_todo t
      WHERE NOT EXISTS (
        SELECT 1 FROM _decommission_edges e
        WHERE e.parent = t.tbl AND e.child <> t.tbl
          AND e.child IN (SELECT tbl FROM _decommission_todo)
      );

    IF NOT EXISTS (SELECT 1 FROM _decommission_batch) THEN
      RAISE EXCEPTION
        'decommission: FK cycle prevents deleting PERGURUAN_TINGGI units: %',
        (SELECT string_agg(tbl, ', ' ORDER BY tbl) FROM _decommission_todo);
    END IF;

    FOR edge IN SELECT tbl FROM _decommission_batch LOOP
      EXECUTE format(
        'DELETE FROM %s WHERE id IN (SELECT id FROM _decommission_doomed WHERE tbl = %L)',
        edge.tbl, edge.tbl
      );
    END LOOP;

    DELETE FROM _decommission_todo WHERE tbl IN (SELECT tbl FROM _decommission_batch);
    DROP TABLE _decommission_batch;
  END LOOP;

  RAISE NOTICE 'decommission: deleted PERGURUAN_TINGGI units and dependent rows';
END
$decommission_units$;

-- Any surviving report still tagged PERGURUAN_TINGGI (a row whose unit_id was
-- not a PT unit, so the purge above did not reach it) is re-homed to OTHER.
-- These are inconsistent leftovers, not PT-scoped records.
UPDATE "daily_student_reports" SET "unit_type" = 'OTHER' WHERE "unit_type"::text = 'PERGURUAN_TINGGI';

-- Databases deployed before this change still carry the `PERGURUAN_TINGGI`
-- realm, while the regenerated Prisma client no longer accepts it. Re-home the
-- realm BEFORE recreating the type, otherwise the ALTER would fail on old data.
-- The PT role rows themselves are deleted in section 4, after the enum rewrite.
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

-- ---------------------------------------------------------------------------
-- 4. Users who lose their only role with the PT purge
-- ---------------------------------------------------------------------------
-- Deleting the PT_* assignments below is not enough to end a PT user's
-- session. Such a user may still hold (a) a live refresh token and (b) a
-- legacy `users.role` value: the legacy `UserRole` enum has no PT member, so a
-- PT account stores an ordinary value like TEACHER. When the refresh flow
-- finds no active role assignment it falls back to that column
-- (auth.service.ts `refreshToken`) and mints a fresh session, letting a
-- PT-only user rotate tokens indefinitely.
--
-- The affected users must therefore be identified BEFORE their assignments are
-- deleted, since afterwards the trace of "this used to be a PT user" is gone.
-- Only users who end up with no ACTIVE assignment are selected, matching the
-- runtime's `activeRoleWhere()` (is_active AND not expired); a user who also
-- holds an active non-PT role keeps their session.
DROP TABLE IF EXISTS "pt_only_users_tmp";
CREATE TEMP TABLE "pt_only_users_tmp" AS
SELECT DISTINCT a."user_id" AS "user_id"
FROM "user_role_assignments" a
JOIN "roles" r ON r."id" = a."role_id"
WHERE r."code" IN (
    'PT_REKTOR', 'PT_WAKIL_REKTOR', 'PT_DEKAN', 'PT_KAPRODI', 'PT_DOSEN',
    'PT_MAHASISWA', 'PT_STAF_AKADEMIK', 'PT_TATA_USAHA', 'PT_ALUMNI'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "user_role_assignments" b
    JOIN "roles" rb ON rb."id" = b."role_id"
    WHERE b."user_id" = a."user_id"
      AND rb."code" NOT IN (
        'PT_REKTOR', 'PT_WAKIL_REKTOR', 'PT_DEKAN', 'PT_KAPRODI', 'PT_DOSEN',
        'PT_MAHASISWA', 'PT_STAF_AKADEMIK', 'PT_TATA_USAHA', 'PT_ALUMNI'
      )
      AND b."is_active"
      AND (b."expires_at" IS NULL OR b."expires_at" > now())
  );

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

-- Revoke every refresh token of those users so nothing can be rotated.
DELETE FROM "refresh_tokens"
WHERE "user_id" IN (SELECT "user_id" FROM "pt_only_users_tmp");

-- Null out the legacy fallback for exactly those users. Once `users.role` is
-- NULL the `else if (storedToken.user.role)` branch no longer matches and the
-- refresh flow rejects with `Errors.forbidden('No active role assignment
-- found')`. Scoped to the temp set so identity-only rows and users with an
-- active role keep their value.
UPDATE "users"
SET "role" = NULL
WHERE "id" IN (SELECT "user_id" FROM "pt_only_users_tmp");

DROP TABLE IF EXISTS "pt_only_users_tmp";

-- What this section does and does not guarantee. Revoking the refresh tokens
-- and clearing `users.role` removes the only renewable credential, so a PT-only
-- user cannot obtain a new session from this point on. An access token already
-- issued before the deploy stays valid until it expires, which is at most the
-- access-token TTL (config.jwt.expiresIn -- 15 minutes by default). That is by
-- design, not an oversight: `authenticate` is stateless and deliberately does
-- not query the database per request (see the comment on `config.jwt.expiresIn`
-- in src/config/index.ts). Instant revocation would mean adding per-request
-- state to every route, a cross-cutting change that would also alter how every
-- other offboarding and role change behaves. The 15-minute ceiling is the
-- accepted window, consistent with how the rest of the system offboards users.
