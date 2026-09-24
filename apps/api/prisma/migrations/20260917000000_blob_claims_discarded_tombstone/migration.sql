-- Terminal tombstone on `blob_claims`.
--
-- The previous protocol released the discard's claim right after the Azure
-- delete. That left a window: a create whose claim insert was already waiting
-- on the unique row took the row the instant it was deleted, then saved a
-- record referencing a blob that had just been destroyed. Delay/re-probe
-- narrowed it but never closed it, because the probe and the delete are not
-- one atomic step.
--
-- `discarded_at` makes the discard step terminal: the discard flips this column
-- atomically (a conditional UPDATE) BEFORE calling Azure, and every claim path
-- refuses a row whose tombstone is set. So either the create claimed before the
-- flip (the flip's WHERE fails and the discard aborts without deleting), or the
-- flip won (no create can ever claim the row, so the delete is safe). The row
-- is kept after a successful delete rather than released.
ALTER TABLE "blob_claims" ADD COLUMN "discarded_at" TIMESTAMP(3);

CREATE INDEX "blob_claims_discarded_at_idx" ON "blob_claims"("discarded_at");