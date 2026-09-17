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
-- `DELETE FROM units` is not enough: 84 of the FK constraints pointing at
-- `units` are `RESTRICT` at this point in the migration (0 `NO ACTION`, 0
-- `CASCADE`), and deleting a unit therefore requires deleting every row that
-- depends on it first. The block below walks the live FK catalog to find that
-- closure and delete it leaf-first, so it stays correct as the schema grows
-- instead of hard-coding a table list that silently rots.
--
-- Edges followed: `NO ACTION`, `RESTRICT` and `CASCADE` -- a row that cannot
-- outlive the unit. Edges *not* followed: `SET NULL` / `SET DEFAULT` (there are
-- 20 `SET NULL` constraints from `units`, 0 `SET DEFAULT`), because the database
-- resolves those by itself and `users.unit_id` above all must survive: a
-- PT-only login keeps its account with `unit_id = NULL`, and section 4 below
-- then ends its session.
--
-- `SET NULL` is not always "safe to keep", though. A `SET NULL` row from the PT
-- unit either survives *detached* (unit-scoped data now claiming no unit) or is
-- read as *global* -- visible to every unit -- so letting the FK null it out
-- would widen its audience or orphan it instead of retiring it. The migration
-- therefore deletes two classes of `SET NULL` child by row, before the unit is
-- gone (afterwards the link is NULL and the rows are indistinguishable from
-- genuinely global ones):
--
--   (i)  the children whose `(unit_id, ...)` is UNIQUE. The table models a
--        per-unit uniqueness -- one row of the kind per unit -- so a row whose
--        unit is being deleted is unit-owned, not a foundation-wide one.
--        Whether a table carries such a unique index is read from
--        `pg_index`/`pg_attribute` in the loop below (its first key column is
--        the same column as the FK). Today that matches
--        `dashboard_metric_snapshots` and `report_templates`, plus one table
--        owned by another change that must not be named here.
--
--   (ii) the seven `SET NULL` children whose read paths treat `unit_id IS NULL`
--        as "all units" / "foundation-wide". That is a property of the *reader*,
--        not of the catalog, so it is a pinned list, audited against the read
--        paths (file:line in the loop below) and guarded by
--        `apps/api/src/utils/decommissioned-modules.guard.test.ts`.
--
-- `donation_campaigns` is pinned for the same reason a public-facing read path
-- makes it dangerous: the FK would turn a PT campaign's `unit_id` into NULL, and
-- the *public* campaign list does not filter on unit at all --
-- `campaignService.findPublic` (donation.service.ts:75-89) selects on
-- `status`/dates only. A campaign the owner retired with the unit would keep
-- collecting donations from the public site. It is not caught by the catalog
-- rule either: `donation_campaigns` has no `(unit_id, ...)` UNIQUE (only a
-- unique `slug`, 0_init:6553) and is unreachable from `units` over the followed
-- edges -- `donation_campaigns.unit_id` is the `SET NULL` edge itself, and its
-- own children (`donations.campaign_id`, 0_init:8599) are `SET NULL` too, so
-- nothing pulls it into the closure. Pinning it by row is what deletes the PT
-- campaigns, whatever their status (ACTIVE / DRAFT / CLOSED).
--
-- Blast radius: the purge deletes 229 dependent tables (230 including `units`
-- itself), at a maximum depth of 3. That set is the closure over the edges
-- followed below, seeded with `units` plus every `SET NULL` child captured by
-- row first -- the pinned NULL-means-global tables and the unique-per-unit
-- tables matched by the catalog rule. Those seeds are not merely decorative:
-- the pinned seeds alone drag in 14 tables that `units` cannot reach over the
-- followed edges (213 -> 227), and the three unique-per-unit seeds add the last
-- 3 (`dashboard_metric_snapshots`, `report_templates`, and one owned by PR
-- #504) to reach 230. (`users` and `user_role_assignments` are deliberately not
-- in the deleted set; they survive detached with `unit_id = NULL` and section 4
-- ends the PT-only sessions.)
-- Reproduce against the catalog this block runs on -- i.e. after the higher-ed
-- tables of sections 1-2 are dropped. The seed set mirrors the loop below: the
-- seven pinned tables plus every `SET NULL` child whose `(unit_id, ...)` is
-- UNIQUE (the `EXISTS` subquery):
--
--   WITH seeds(tbl) AS (
--     SELECT unnest(ARRAY[
--       'units', 'announcements', 'calendar_events', 'dashboard_history',
--       'islamic_events', 'paud_development_indicators', 'strategic_plans',
--       'donation_campaigns'
--     ])
--     UNION
--     SELECT format('public.%I', cc.relname)
--     FROM pg_constraint c
--     JOIN pg_class cc ON cc.oid = c.conrelid
--     JOIN pg_class pc ON pc.oid = c.confrelid
--     JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = 'public'
--     WHERE c.contype = 'f' AND c.confdeltype = 'n' AND pc.relname = 'units'
--       AND EXISTS (SELECT 1 FROM pg_index i
--                   JOIN pg_attribute ia ON ia.attrelid = i.indrelid
--                    AND ia.attnum = i.indkey[0]
--                   WHERE i.indrelid = c.conrelid AND i.indisunique
--                     AND ia.attname = 'unit_id')
--   ),
--   RECURSIVE reach(tbl, depth) AS (
--     SELECT tbl, 0 FROM seeds
--     UNION
--     SELECT format('%I.%I', cn.nspname, cc.relname) COLLATE "C", r.depth + 1
--     FROM reach r
--     JOIN pg_class pc ON pc.oid = r.tbl::regclass
--     JOIN pg_constraint c ON c.confrelid = pc.oid AND c.contype = 'f'
--                          AND c.confdeltype IN ('a','r','c')
--     JOIN pg_class cc ON cc.oid = c.conrelid
--     JOIN pg_namespace cn ON cn.oid = cc.relnamespace)
--   SELECT count(*) FROM (SELECT DISTINCT tbl FROM reach) t;  -- 230
--
-- (Depth distribution over the distinct tables, min depth: 11 at 0, 86 at 1,
-- 107 at 2, 26 at 3 -- the eleven seeds at depth 0, of which `units` is one.)
-- This is why the deploy runbook requires a verified backup BEFORE
-- `prisma migrate deploy`.

-- Snapshot the accounts still attached to a PERGURUAN_TINGGI unit BEFORE the
-- unit is deleted. This is section 4's second marker for a PT-only account and
-- it has to be read here: `users.unit_id` is `SET NULL`, so once the unit rows
-- are gone the link is lost and a PT user whose only role assignment was
-- already removed cannot be told apart from an ordinary account. See the note
-- on shape (a) in section 4 for why that shape is reachable.
DROP TABLE IF EXISTS "pt_unit_users_tmp";
CREATE TEMP TABLE "pt_unit_users_tmp" AS
SELECT DISTINCT u."id" AS "user_id"
FROM "users" u
JOIN "units" un ON un."id" = u."unit_id"
WHERE un."type"::text = 'PERGURUAN_TINGGI';

-- Assignments whose *scope* is a PT unit but whose role is not PT. The unit
-- DELETE cannot end these: `user_role_assignments.unit_id` is `SET NULL`
-- (0_init:1212, FK conname user_role_assignments_unit_id_fkey), so the row
-- survives detached. A detached non-PT assignment is not a harmless orphan --
-- it is exactly what the token prison wants. `tokenUnitId` (resolve-unit-id.ts:
-- 187-195) returns the *assignment's* unit when set, and no foundation role is
-- involved here, so the next refresh mints a token with `unitId: null`
-- (auth.service.ts:492, `refreshUnitId = primaryAssignment.unitId`). Read scopes
-- are written as optional filters -- `...(unitId && { unitId })`, 42 sites, or
-- `unitId ? { unitId } : {}`, 74 sites -- and a null token unit therefore reads
-- as "every unit" rather than "no access". A non-PT staffer scoped to the PT
-- unit would gain the foundation's reads the moment the unit is deleted, and
-- their session would be untouched by section 4 below because they do hold an
-- active non-PT role.
--
-- They are deactivated here (see further down, after the role purge) so their
-- holder is treated as a lost-role user and swept by section 4. Deactivation,
-- not deletion: the migration keeps the record of who held what, the same way
-- `users` rows are kept and only detached.
DROP TABLE IF EXISTS "pt_scoped_assignments_tmp";
CREATE TEMP TABLE "pt_scoped_assignments_tmp" AS
SELECT a."id" AS "assignment_id", a."user_id" AS "user_id"
FROM "user_role_assignments" a
JOIN "units" un ON un."id" = a."unit_id"
WHERE un."type"::text = 'PERGURUAN_TINGGI';

-- Rows whose `unit_id` points at a PT unit but which would be *globalised* or
-- *orphaned*, not retired, when `ON DELETE SET NULL` fires. They are capturable
-- here only -- after the unit is deleted the link is already NULL and the rows
-- are indistinguishable from genuinely global ones. Two sources feed the temp
-- table below:
--   (i)  every child whose `(unit_id, ...)` is UNIQUE (read from the catalog);
--   (ii) the pinned NULL-means-global tables (read paths in the loop below),
--        audited and guarded by
--        `apps/api/src/utils/decommissioned-modules.guard.test.ts`.
DROP TABLE IF EXISTS "pt_setnull_doomed_tmp";
CREATE TEMP TABLE "pt_setnull_doomed_tmp" (
  tbl text NOT NULL,
  id  text NOT NULL,
  PRIMARY KEY (tbl, id)
) ON COMMIT DROP;

DO $decommission_setnull$
DECLARE
  t record;
  n integer;
BEGIN
  FOR t IN
    SELECT format('%I.%I', cn.nspname, cc.relname) AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_class cc     ON cc.oid = c.conrelid
    JOIN pg_namespace cn ON cn.oid = cc.relnamespace
    JOIN pg_attribute a  ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confdeltype = 'n'
      AND c.confrelid = 'units'::regclass
      AND cn.nspname = 'public'
      AND array_length(c.conkey, 1) = 1
      AND (
        -- (i) Generic: `(unit_id, ...)` is UNIQUE, so the row is one-per-unit
        -- and belongs to the PT unit rather than to the foundation. The first
        -- key column of the unique index is the same column as the FK.
        --   dashboard_metric_snapshots, report_templates
        EXISTS (
          SELECT 1
          FROM pg_index i
          JOIN pg_attribute ia
            ON ia.attrelid = i.indrelid AND ia.attnum = i.indkey[0]
          WHERE i.indrelid = c.conrelid
            AND i.indisunique
            AND ia.attname = a.attname
        )
        OR
        -- (ii) Pinned: `unitId IS NULL` is read as "every unit" / foundation-wide:
        format('%I.%I', cn.nspname, cc.relname) IN (
          'public.announcements',               -- announcements.service.ts:44-49
          'public.calendar_events',             -- calendar.service.ts:105,319
          'public.dashboard_history',           -- dashboard.service.ts:593-594
          'public.islamic_events',              -- ibadah.schema.ts:219 ("null = semua unit")
          'public.paud_development_indicators', -- paud-assessment.schema.ts:46
          'public.strategic_plans',             -- perencanaan.service.ts:150-154
          -- The public campaign list filters on status/date only, never on
          -- unit (donation.service.ts:75-89), so a PT campaign the FK
          -- detached to `unit_id IS NULL` would keep accepting donations
          -- from the public site. Delete it instead -- any status.
          'public.donation_campaigns'           -- donation.service.ts:75-89
        )
      )
  LOOP
    EXECUTE format(
      'INSERT INTO "pt_setnull_doomed_tmp" (tbl, id) '
      'SELECT %L, x."id" FROM %s x '
      'WHERE x.%I IS NOT NULL '
      '  AND x.%I IN (SELECT u."id" FROM "units" u '
      '               WHERE u."type"::text = ''PERGURUAN_TINGGI'') '
      'ON CONFLICT (tbl, id) DO NOTHING',
      t.tbl, t.tbl, t.col, t.col
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE
        'decommission: % row(s) in % are owned by the PT unit and must not outlive it (UNIQUE-per-unit or NULL-means-global); deleting them',
        n, t.tbl;
    END IF;
  END LOOP;
END
$decommission_setnull$;

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
  WHERE u.type::text = 'PERGURUAN_TINGGI'
  UNION ALL
  -- PT rows captured before the unit delete: the `SET NULL` children that are
  -- either unique-per-unit or NULL-means-global, so the FK would leave them
  -- globalised/orphaned instead of retiring them.
  SELECT tbl, id FROM "pt_setnull_doomed_tmp";

  IF NOT EXISTS (SELECT 1 FROM _decommission_doomed) THEN
    RAISE NOTICE 'decommission: no PERGURUAN_TINGGI units to delete';
    RETURN;
  END IF;

  -- Structural closure of the tables reachable from `units` over the edges the
  -- row walk below follows, plus every table captured in `pt_setnull_doomed_tmp`
  -- whose own dependents must be deleted before those rows. Computed from the
  -- catalog alone (the explicit UNION adds the captured tables, whose own edge
  -- to `units` is `SET NULL` and so is not followed by the recursion), so the
  -- checks that follow run even when every table involved is empty.
  CREATE TEMPORARY TABLE _decommission_tables (tbl text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _decommission_tables (tbl)
  SELECT format('%I.%I', n.nspname, c.relname)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = 'units'::regclass
  UNION
  SELECT DISTINCT tbl FROM "pt_setnull_doomed_tmp";

  LOOP
    INSERT INTO _decommission_tables (tbl)
    SELECT DISTINCT format('%I.%I', cn.nspname, cc.relname)
    FROM pg_constraint c
    JOIN pg_class cc     ON cc.oid = c.conrelid
    JOIN pg_namespace cn ON cn.oid = cc.relnamespace
    JOIN pg_class pc     ON pc.oid = c.confrelid
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    WHERE c.contype = 'f'
      AND c.confdeltype IN ('a', 'r', 'c')
      AND format('%I.%I', pn.nspname, pc.relname) IN (SELECT tbl FROM _decommission_tables)
    ON CONFLICT (tbl) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    EXIT WHEN inserted = 0;
  END LOOP;

  -- Every followed edge must be single-column, must target the parent's `id`,
  -- and its child must expose an `id` -- the row deletes below address rows by
  -- `id`. A future relation that breaks one of these would otherwise delete the
  -- wrong rows or fail mid-deploy with an opaque SQL error; fail loudly instead.
  -- Verified 2026-09-16: 0 composite FKs, 0 FKs targeting a non-`id` column,
  -- 0 public tables without an `id`.
  FOR edge IN
    SELECT format('%I.%I', cn.nspname, cc.relname) AS child,
           a.attname                               AS col,
           format('%I.%I', pn.nspname, pc.relname) AS parent,
           array_length(c.conkey, 1)               AS conkey_len,
           pa.attname                              AS parent_col,
           ca.attname                              AS child_id_col
    FROM pg_constraint c
    JOIN pg_class cc     ON cc.oid = c.conrelid
    JOIN pg_namespace cn ON cn.oid = cc.relnamespace
    JOIN pg_class pc     ON pc.oid = c.confrelid
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    JOIN pg_attribute a  ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
    LEFT JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attname = 'id'
                                 AND ca.attnum > 0 AND NOT ca.attisdropped
    WHERE c.contype = 'f'
      AND c.confdeltype IN ('a', 'r', 'c')
      AND format('%I.%I', pn.nspname, pc.relname) IN (SELECT tbl FROM _decommission_tables)
  LOOP
    IF edge.conkey_len <> 1 THEN
      RAISE EXCEPTION
        'decommission: FK % -> % is composite; the purge block assumes single-column FKs',
        edge.child, edge.parent;
    END IF;
    IF edge.parent_col <> 'id' THEN
      RAISE EXCEPTION
        'decommission: FK %.% -> %.% does not target `id`; the purge block assumes it does',
        edge.child, edge.col, edge.parent, edge.parent_col;
    END IF;
    IF edge.child_id_col IS NULL THEN
      RAISE EXCEPTION
        'decommission: table % has no `id` column; the purge block assumes one',
        edge.child;
    END IF;
  END LOOP;

  -- Grow the doomed row set until it reaches a fixpoint.
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
--
-- Capture the PT roles *before* the re-home: `roles.code` is plain TEXT (0_init
-- `CREATE TABLE "roles" ... "code" TEXT NOT NULL`) and `createRoleSchema`
-- (roles.schema.ts, `code: z.string().regex(/^[A-Z0-9_]+$/)`) plus
-- `rolesService.createRole` accept any uppercase code, so a role with a
-- non-standard code (e.g. `PT_CUSTOM_X`) can have been created with
-- `realm = 'PERGURUAN_TINGGI'` through `POST /roles`. After the UPDATE below it
-- would be indistinguishable from an ordinary `UNIT_USAHA` role and would
-- survive, keeping its assignments, refresh tokens and legacy `users.role`
-- alive. Selecting by realm+code here catches those too.
DROP TABLE IF EXISTS "pt_roles_tmp";
CREATE TEMP TABLE "pt_roles_tmp" (id text PRIMARY KEY, code text) ON COMMIT DROP;
INSERT INTO "pt_roles_tmp" (id, code)
SELECT "id", "code" FROM "roles"
WHERE "realm"::text = 'PERGURUAN_TINGGI'
   OR "code" IN (
     'PT_REKTOR', 'PT_WAKIL_REKTOR', 'PT_DEKAN', 'PT_KAPRODI', 'PT_DOSEN',
     'PT_MAHASISWA', 'PT_STAF_AKADEMIK', 'PT_TATA_USAHA', 'PT_ALUMNI'
   );
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
--
-- A third class is not about a PT *role* at all but about a PT *scope*: a
-- non-PT assignment whose `unit_id` pointed at the PT unit. The unit delete
-- cannot end it (`SET NULL`), and on its own it widens the holder's reads to
-- every unit after refresh, because a null token unit is read as "no limit"
-- (see the marker-3 note below). Those assignments were deactivated just above
-- and their holders are unioned in as marker 3, so the same sweep ends them.
--
-- Two residual shapes matter here. One is closed by the union below; the other
-- is investigated and deliberately left alone:
--
-- (a) A user with NO `user_role_assignments` row at all. This shape IS
--     reachable, through offboarding rather than account creation. Every
--     account-creation path does write an assignment (the seed loop
--     prisma/seed.ts, `authService.register` auth.service.ts:388,
--     `userService.create` user.service.ts:224, onboarding:341,
--     parent-scope.ts:130), and `login()` refuses a user without an active
--     assignment — so the shape does not arise at creation time. It arises
--     after the fact: `rolesService.removeRoleAssignment` (roles.service.ts:243,
--     route `DELETE /roles/assignments/:id`) deletes a `user_role_assignments`
--     row but does NOT revoke the affected user's refresh tokens. If an admin
--     offboards a PT user that way, the user keeps a live refresh token and a
--     legacy `users.role` value — exactly the rotatable shape section 4 exists
--     to close, but with no PT assignment left for the snapshot query to find.
--     The `pt_unit_users_tmp` snapshot taken before the unit delete is the
--     surviving marker: a PT user with an assignment lived on a PT unit
--     (`demoUnitIdFor` in the seed maps every `PT_*` code to the PT unit), so
--     `users.unit_id` points at that unit. The selection below therefore unions
--     the assignment-based and unit-based snapshots.
--
--     Residual sub-shape, handed to the owner rather than patched: an admin who
--     granted a `PT_*` role to an account whose `unit_id` is a *non-PT* unit
--     (register accepts any unitId for a non-super-admin role) and then removed
--     that assignment leaves a user with neither marker — no PT assignment and
--     no PT unit. That is indistinguishable from any other offboarded user, so
--     it cannot be identified without guessing. It is the pre-existing
--     system-wide offboarding gap, not something this migration introduces.
--
-- (b) A "mixed" user whose non-PT assignment is active now but expires later.
--     Not reachable: `user_role_assignments.expires_at` is never written by any
--     code path. Every assignment writer was checked (2026-09-16):
--       auth.service.ts:388  userRoleAssignment.create
--       roles.service.ts:223 userRoleAssignment.create
--       roles.service.ts:217/273/321 updateMany (isPrimary/isActive only)
--       roles.service.ts:279/326 update (isPrimary only)
--       users/user.service.ts:224 nested userRoles.create (no expiresAt)
--       utils/parent-scope.ts:130 userRoleAssignment.create
--       student-onboarding.orchestrator.ts:341 userRoleAssignment.create
--       prisma/seed.ts userRoleAssignment.create (×many, none with expiresAt)
--     None sets `expiresAt`; `assignRoleSchema` has no `expiresAt` either. The
--     only reads are `activeRoleWhere()` and `rolesService.switchRole`'s guard.
--     A mixed user's surviving assignment therefore never expires, so the
--     legacy fallback is never reached via expiry. It could only be reached by
--     an admin deleting the assignment (`removeRoleAssignment`), which is the
--     system-wide offboarding behaviour that predates this migration, not a
--     PT-specific hole. `apps/api/src/utils/decommissioned-modules.guard.test.ts`
--     pins that no writer sets `expires_at`, so this reasoning fails loudly if
--     that changes.
-- Scope-neutralise every assignment that pointed at the PT unit. Their identity
-- was captured into `pt_scoped_assignments_tmp` above, *before* the unit was
-- deleted -- necessary, because the unit DELETE has already fired the `SET NULL`
-- and cleared these rows' `unit_id` by now (verified: the surviving row reads
-- `unit_id = NULL`). A detached-but-active non-PT assignment is exactly the hole:
-- on the next refresh it mints a null-unit token that every optional unit filter
-- reads as "all units". Deactivate it (the row stays, the scope does not), which
-- also lines these users up with marker 3 of the candidate set below.
UPDATE "user_role_assignments"
SET "is_active" = false
WHERE "id" IN (SELECT "assignment_id" FROM "pt_scoped_assignments_tmp");

DROP TABLE IF EXISTS "pt_only_users_tmp";
CREATE TEMP TABLE "pt_only_users_tmp" AS
WITH pt_candidates AS (
  -- Marker 1: the user still holds an assignment to a PT role at migration
  -- time. The role set is `pt_roles_tmp`, captured by realm AND by the
  -- hard-coded codes before the realm rewrite -- so a non-standard code created
  -- through `POST /roles` is caught as well.
  SELECT a."user_id" AS "user_id"
  FROM "user_role_assignments" a
  JOIN "pt_roles_tmp" pr ON pr."id" = a."role_id"
  UNION
  -- Marker 2: the user was attached to a PERGURUAN_TINGGI unit before it was
  -- deleted (PT-prefixed accounts were seeded onto that unit). This catches a
  -- PT user whose only assignment was removed by offboarding.
  SELECT "user_id" FROM "pt_unit_users_tmp"
  UNION
  -- Marker 3: the user held an assignment *scoped* to the PT unit. It may be a
  -- non-PT role, so markers 1 and 2 both miss it -- yet the scope it carries is
  -- gone, and on its own it would widen the holder's reads to every unit after
  -- refresh. The assignment was just deactivated above, so the NOT EXISTS below
  -- sees it as gone and the holder is swept like any other lost-role user.
  SELECT "user_id" FROM "pt_scoped_assignments_tmp"
)
SELECT DISTINCT c."user_id"
FROM pt_candidates c
WHERE NOT EXISTS (
    SELECT 1
    FROM "user_role_assignments" b
    WHERE b."user_id" = c."user_id"
      AND b."role_id" NOT IN (SELECT "id" FROM "pt_roles_tmp")
      AND b."is_active"
      AND (b."expires_at" IS NULL OR b."expires_at" > now())
  );

-- Remove higher-education role rows from `roles` (code is TEXT, not the
-- RoleCode enum) so no role survives with a code the schema no longer lists.
-- Both the assignments and the roles come from `pt_roles_tmp`, so a PT role
-- with a non-standard code is removed too.
DELETE FROM "user_role_assignments"
WHERE "role_id" IN (SELECT "id" FROM "pt_roles_tmp");
DELETE FROM "roles" WHERE "id" IN (SELECT "id" FROM "pt_roles_tmp");

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
DROP TABLE IF EXISTS "pt_unit_users_tmp";
DROP TABLE IF EXISTS "pt_scoped_assignments_tmp";
DROP TABLE IF EXISTS "pt_roles_tmp";
DROP TABLE IF EXISTS "pt_setnull_doomed_tmp";

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
