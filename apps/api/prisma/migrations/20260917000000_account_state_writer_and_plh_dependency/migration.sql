-- Account-state ownership marker + Plh delegation dependency model.
--
-- Three correctness problems, all of which let a lift turn back on an account
-- or revoke a role it should not have touched.

-- 1. `users.account_state_writer` — who owns the current `is_active` value.
--
-- `account_state_snapshot.isActiveBefore` records what the account looked like
-- when a suspension began, but it cannot tell the lift whether the *current*
-- `is_active = false` is still the suspension's own write or a later admin
-- deactivation. Lifting unconditionally would resurrect the account an admin
-- switched off during the suspension.
--
-- A monotonic ownership stamp written by every guarded `is_active` change fixes
-- that: the suspension records the token it wrote, and a lift reactivates only
-- while that same token is stored. Comparing `updated_at` was rejected because
-- an unrelated profile edit moves it, so a lift refused to restore an account
-- the suspension itself had switched off.
--
-- Nullable and unbackfilled: rows that predate the column have no honest owner,
-- and NULL is read as "not owned by this suspension" — the safe direction.
ALTER TABLE "users" ADD COLUMN "account_state_writer" TEXT;

-- 2. `board_member_suspensions.account_state_writer`.
--
-- The token the suspension itself stamped, so the lift can compare.
ALTER TABLE "board_member_suspensions" ADD COLUMN "account_state_writer" TEXT;

-- 3. `board_suspension_plh_assignments` — explicit dependency rows.
--
-- Two suspensions can share one Plh delegate+role assignment. The lift used to
-- delete the assignment unconditionally, revoking a delegation another ACTIVE
-- suspension still needed. Each suspension now records the assignment it
-- depends on; the lift deletes it only when no other ACTIVE suspension does.
CREATE TABLE "board_suspension_plh_assignments" (
    "id" TEXT NOT NULL,
    "suspension_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "role_code" TEXT NOT NULL,
    "created" BOOLEAN NOT NULL DEFAULT false,
    "restore" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_suspension_plh_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "board_suspension_plh_assignments_suspension_id_assignment_id_key"
  ON "board_suspension_plh_assignments"("suspension_id", "assignment_id");

CREATE INDEX "board_suspension_plh_assignments_assignment_id_idx"
  ON "board_suspension_plh_assignments"("assignment_id");

ALTER TABLE "board_suspension_plh_assignments"
  ADD CONSTRAINT "board_suspension_plh_assignments_suspension_id_fkey"
  FOREIGN KEY ("suspension_id") REFERENCES "board_member_suspensions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "board_suspension_plh_assignments"
  ADD CONSTRAINT "board_suspension_plh_assignments_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "user_role_assignments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
