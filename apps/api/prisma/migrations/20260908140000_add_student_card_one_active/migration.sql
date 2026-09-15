-- Partial unique index: at most one ACTIVE StudentCardState per student.
--
-- A student accumulates many REVOKED/EXPIRED audit rows over time, but must
-- never hold two live (ACTIVE) cards at once. Without this, two concurrent
-- regenerations can both REVOKE the same predecessor (an updateMany matches
-- whatever ACTIVE row exists at scan time) and each INSERT an ACTIVE row, so
-- two cards pass verification. The partial index is the database-level
-- invariant; Prisma cannot express a partial unique index in the schema, so it
-- is applied here via raw migration SQL.
CREATE UNIQUE INDEX "student_card_state_one_active_per_student"
  ON "student_card_state"("student_id")
  WHERE "status" = 'ACTIVE';
