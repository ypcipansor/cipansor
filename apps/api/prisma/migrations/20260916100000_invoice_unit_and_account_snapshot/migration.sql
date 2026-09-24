-- Invoice unit of record + board-suspension account snapshot.
--
-- Two independent correctness bugs, each caused by deriving a fact at read
-- time that was only true at write time.

-- 1. `Invoice.unit_id` — the unit that issued the bill.
--
-- Arrears oversight filtered and grouped by `students.unit_id`, which is the
-- pupil's CURRENT unit. When a student transferred, the overdue invoices their
-- old unit had raised disappeared from that unit's books and reappeared on the
-- new unit's, which had never issued them. The invoice now carries the issuing
-- unit, frozen at creation. Nullable because rows that predate this column have
-- no honest value; the arrears query falls back to the student's unit for
-- exactly those rows.
ALTER TABLE "invoices" ADD COLUMN "unit_id" TEXT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "invoices_unit_id_idx" ON "invoices"("unit_id");

-- 2. `BoardMemberSuspension.account_state_snapshot`.
--
-- Lifting a suspension wrote `users.is_active = true` unconditionally, so an
-- independent admin deactivation during the suspension was silently undone.
-- The snapshot records the `isActive` the suspension replaced and the
-- `updatedAt` its own write produced, letting the lift restore the prior value
-- only when nothing else has touched the account since.
ALTER TABLE "board_member_suspensions" ADD COLUMN "account_state_snapshot" JSONB;
