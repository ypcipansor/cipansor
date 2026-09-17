-- Board-member suspension: schema fields + single-ACTIVE invariant.
--
-- Two distinct problems, both of which let a lift reactivate an account that
-- should still be frozen.

-- 1. Partial unique index: at most one ACTIVE suspension per user.
--
-- `suspendBoardMember` used to check for an existing ACTIVE row outside its
-- transaction and then insert inside it. Two parallel requests each read "no
-- active suspension" and each INSERT one, so the database ends up with two
-- ACTIVE rows for one person and `liftBoardSuspension` may lift either. The
-- check now runs inside the transaction, but only the index is a real
-- guarantee: reading and writing in one transaction is still subject to
-- write-skew at READ COMMITTED.
--
-- A partial index rather than @@unique in schema.prisma because Prisma cannot
-- express `WHERE`, and a plain unique on (user_id) would be wrong — a person
-- accumulates many LIFTED rows over the years. Same shape as
-- `student_card_state_one_active_per_student`.
CREATE UNIQUE INDEX "board_member_suspensions_one_active_per_user"
  ON "board_member_suspensions"("user_id")
  WHERE "status" = 'ACTIVE';

-- 2. Provenance of the Plh/Plt delegation.
--
-- Suspension reuses a Plh's existing role assignment when one is already
-- present, but the lift deleted the assignment unconditionally — revoking a
-- role the suspension never granted. Boolean, defaulting to false so existing
-- rows (whose assignment provenance is unknowable) are treated as
-- "not ours", which is the safe direction: the lift leaves them alone.
ALTER TABLE "board_member_suspensions"
  ADD COLUMN "plh_assignment_created" BOOLEAN NOT NULL DEFAULT false;

-- 3. Which assignment row the suspension owns, and how to undo it.
--
-- `plh_assignment_created` alone cannot tell the lift what to do with an
-- assignment that ALREADY existed but was inactive or expired: leaving it as
-- it is gives the replacement officer no delegation at all, and deleting it
-- erases a legitimate row. These two columns record the exact assignment the
-- suspension touched and, when it reactivated one, the prior state to restore.
ALTER TABLE "board_member_suspensions"
  ADD COLUMN "plh_assignment_id" TEXT;
ALTER TABLE "board_member_suspensions"
  ADD COLUMN "plh_assignment_restore" JSONB;

-- 4. Snapshot of E-Sign lockouts taken by the suspension.
--
-- Suspension soft-locks every signing key by writing a far-future sentinel to
-- `lockedUntil`; the lift nulled the column for all of them, discarding any
-- passphrase lockout that predated the suspension. The snapshot records the
-- prior value per key id so the lift can restore it and leave alone the keys
-- it never touched.
ALTER TABLE "board_member_suspensions"
  ADD COLUMN "signing_key_locks" JSONB;