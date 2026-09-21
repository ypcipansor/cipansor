-- One effective Plh/Plt delegation per (delegate, role) — the NULL-unit hole.
--
-- `user_role_assignments` carries `@@unique([user_id, role_id, unit_id])`, but the
-- Plh/Plt delegation is always foundation-wide, so `unit_id` is NULL. In
-- PostgreSQL a UNIQUE index treats NULLs as distinct, so that index does not
-- constrain the rows this module actually creates: two parallel suspensions of
-- different officers, naming the same delegate for the same role, can each run
-- `findFirst` (both see no assignment) and each `INSERT` a unitless row. Both
-- writers then hold a "delegation", and a lift that releases one leaves the other
-- standing — the duplicate this index removes. A fixture proving it exists on the
-- un-patched schema is in the accompanying integration test.
--
-- Partial, not a full `(user_id, role_id)` unique: a user may legitimately hold
-- the same role in several units (that is what the existing
-- `user_role_assignments_user_id_role_id_unit_id_key` expresses), and only the
-- unitless row is the shared Plh delegation. `WHERE unit_id IS NULL` therefore
-- pins exactly the rows the suspension service writes — it creates the delegate
-- assignment without a `unitId` — while leaving multi-unit assignments alone.
-- Same shape as `board_member_suspensions_one_active_per_user`.
--
-- The three-argument unique is kept: it is a different constraint (per-unit
-- assignment) and dropping it is out of scope.
--
-- ---------------------------------------------------------------------------
-- SURVIVOR SELECTION — NOT "lowest UUID".
--
-- The first draft kept the lowest `id`. That is arbitrary: the row it keeps may
-- be an inactive or expired assignment while discarding the effective one, and
-- because `board_suspension_plh_assignments.assignment_id` cascades on delete,
-- removing a loser could also take live audit dependency rows with it. The
-- survivor is now the *most useful* row by a total order, and every reference
-- is repointed before anything is deleted:
--
--   1. effective first — `is_active` and not past `expires_at`;
--   2. then `is_primary`;
--   3. then the delegation that lasts longest (an unbounded one before a
--      time-boxed one, then the latest expiry);
--   4. then a stable tie-break (`created_at`, then `id`) so a replay on two
--      replicas makes the same choice.
--
-- Data migration and constraint live in one transaction: a database that
-- already holds duplicate unitless (user_id, role_id) pairs — the review fixture,
-- or rows created before this constraint — would otherwise abort the CREATE with
-- a bare 23505.
--
-- The mapping is a plain TEMP table without `ON COMMIT DROP`: even though it is
-- referenced by four later statements, PostgreSQL drops it at COMMIT if the
-- statements are not part of one transaction — and `prisma migrate deploy` runs
-- the file statement by statement in autocommit mode. That made the table
-- vanish before the first UPDATE ("relation _plh_dedup_map does not exist").
-- The integration test did not catch it because `pg.query()` sends the whole
-- file as one simple query, which PostgreSQL wraps in a single implicit
-- transaction — so the bug only appeared under the real migrator. The table is
-- session-scoped and dropped explicitly once the repointing is done.
CREATE TEMP TABLE _plh_dedup_map AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY user_id, role_id
      ORDER BY
        (is_active AND (expires_at IS NULL OR expires_at > now())) DESC,
        is_primary DESC,
        expires_at DESC NULLS FIRST,
        created_at ASC,
        id ASC
    ) AS survivor_id,
    row_number() OVER (
      PARTITION BY user_id, role_id
      ORDER BY
        (is_active AND (expires_at IS NULL OR expires_at > now())) DESC,
        is_primary DESC,
        expires_at DESC NULLS FIRST,
        created_at ASC,
        id ASC
    ) AS rn
  FROM "user_role_assignments"
  WHERE unit_id IS NULL
)
SELECT id AS loser_id, survivor_id
FROM ranked
WHERE rn > 1;

-- 1. Dependency rows that would collide with the (suspension_id, assignment_id)
--    unique after repointing: fold their provenance into the row already
--    pointing at the survivor, so `created` / `restore` are not lost.
UPDATE "board_suspension_plh_assignments" surv
SET
  "created" = surv."created" OR agg.created,
  "restore" = COALESCE(surv."restore", agg.restore)
FROM (
  SELECT
    loser."suspension_id" AS suspension_id,
    m.survivor_id AS survivor_id,
    bool_or(loser."created") AS created,
    (array_agg(loser."restore") FILTER (WHERE loser."restore" IS NOT NULL))[1] AS restore
  FROM "board_suspension_plh_assignments" loser
  JOIN _plh_dedup_map m ON m.loser_id = loser."assignment_id"
  GROUP BY loser."suspension_id", m.survivor_id
) agg
WHERE surv."suspension_id" = agg.suspension_id
  AND surv."assignment_id" = agg.survivor_id;

-- 2. Drop those now-redundant dependency rows (their provenance was merged).
DELETE FROM "board_suspension_plh_assignments" loser
USING _plh_dedup_map m
WHERE loser."assignment_id" = m.loser_id
  AND EXISTS (
    SELECT 1
    FROM "board_suspension_plh_assignments" surv
    WHERE surv."suspension_id" = loser."suspension_id"
      AND surv."assignment_id" = m.survivor_id
  );

-- 3. Repoint every remaining reference to the survivor.
UPDATE "board_suspension_plh_assignments" dep
SET "assignment_id" = m.survivor_id
FROM _plh_dedup_map m
WHERE dep."assignment_id" = m.loser_id;

-- 4. Only now are the duplicate assignments safe to delete.
DELETE FROM "user_role_assignments" ura
USING _plh_dedup_map m
WHERE ura.id = m.loser_id;

-- 5. The mapping is session-scoped and no longer needed.
DROP TABLE _plh_dedup_map;

CREATE UNIQUE INDEX "user_role_assignments_user_id_role_id_unitless_key"
ON "user_role_assignments"("user_id", "role_id")
WHERE "unit_id" IS NULL;
