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
-- Guarded by a pre-flight dedup: a database that already holds duplicate unitless
-- (user_id, role_id) pairs (the review fixture, or rows created before this
-- constraint) would abort the CREATE with a bare 23505. Dropping the later rows —
-- keeping the lowest `id` deterministically — makes the migration replayable on
-- any database and idempotent with the service's `findFirst`
-- (`orderBy: { id: 'asc' }`).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, role_id
           ORDER BY id
         ) AS rn
  FROM "user_role_assignments"
  WHERE unit_id IS NULL
)
DELETE FROM "user_role_assignments" ura
USING ranked
WHERE ura.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX "user_role_assignments_user_id_role_id_unitless_key"
ON "user_role_assignments"("user_id", "role_id")
WHERE "unit_id" IS NULL;
