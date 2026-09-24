-- Backfill `invoices.unit_id` and enforce it (NOT NULL).
--
-- `20260916100000_invoice_unit_and_account_snapshot` added `unit_id` nullable and
-- deliberately left pre-existing rows with no value. The arrears query then fell
-- back to `students.unit_id` — the pupil's CURRENT unit — for exactly those rows,
-- so a transfer still relocated historical arrears onto the new unit's books, and
-- the value changed as the pupil moved. The fallback is the bug.
--
-- The issuing unit is recoverable deterministically. `payment_types.unit_id` is
-- NOT NULL (`0_init`) and `invoices.payment_type_id` is a NOT NULL FK, so every
-- invoice resolves the unit that owns its payment type. There is no ambiguity to
-- invent a policy for: a unit-owned bill belongs to that unit's books.
--
-- Historical caveat, recorded rather than hidden: a payment type's unit is
-- mutable in principle. Today `updatePaymentTypeSchema` omits `unitId`, so the
-- value cannot change through the API, and this backfill is exact at the moment
-- it runs; every invoice is then frozen on its own row.
--
-- Only NULL rows are touched, so the statement is idempotent — re-running it, or
-- upgrading a database that already carries values, is a no-op.
UPDATE "invoices" i
   SET "unit_id" = pt."unit_id"
  FROM "payment_types" pt
 WHERE i."payment_type_id" = pt."id"
   AND i."unit_id" IS NULL;

-- Anything still NULL means an invoice whose payment type vanished, which the
-- RESTRICT FK on `invoices.payment_type_id` forbids. Abort with that sentence
-- rather than let a later NOT NULL fail with a generic constraint error or, far
-- worse, leave the read-time fallback silently in play.
DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining FROM "invoices" WHERE "unit_id" IS NULL;
  IF remaining > 0 THEN
    RAISE EXCEPTION
      'invoice unit_id backfill left % row(s) unresolved; issuing unit could not be determined',
      remaining;
  END IF;
END $$;

-- The FK arrived as ON DELETE SET NULL, which is now incompatible with NOT NULL:
-- deleting a unit would try to null a required column. A unit that has issued
-- invoices must not be hard-deleted (units are soft-deleted everywhere else), so
-- switch to RESTRICT and let the database say so.
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_unit_id_fkey";
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ALTER COLUMN "unit_id" SET NOT NULL;
