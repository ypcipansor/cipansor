-- Step 1: Add unit_id snapshot column to invoices so historical finance stays in
-- the unit that originally billed it even when the student is later re-enrolled
-- into a different unit (which changes students.unit_id).
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "unit_id" TEXT;

-- Step 2: Backfill existing invoices with the unit the student belonged to at that
-- time. We cannot know the true original unit for rows created before this snapshot
-- existed; the student's current unit is the closest available source.
UPDATE "invoices" i
SET "unit_id" = s."unit_id"
FROM "students" s
WHERE i."student_id" = s."id"
  AND i."unit_id" IS NULL;

-- Step 3: Add FK constraint and index for the new snapshot column.
ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "units"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "invoices_unit_id_idx" ON "invoices"("unit_id");
