-- Track whether an AdmissionWave reached FULL because registeredCount reached
-- quota (auto-filled) or because an operator closed it manually. deleteRegistrant
-- uses this to avoid silently reopening a deliberately hand-closed wave when a
-- registrant is removed.

-- Add the column idempotently.
ALTER TABLE "admission_waves" ADD COLUMN IF NOT EXISTS "full_by_capacity" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: waves that are currently FULL with a registered count at/above
-- quota are, by definition, full because of capacity — preserve the previous
-- auto-reopen behaviour for them. Waves that are FULL below quota were closed
-- manually and their status is left at the (safe) default false.
UPDATE "admission_waves"
SET "full_by_capacity" = true
WHERE "status" = 'FULL' AND "registered_count" >= "quota";