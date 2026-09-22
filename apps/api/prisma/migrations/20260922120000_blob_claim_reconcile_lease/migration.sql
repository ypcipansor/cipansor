-- Reconciliation worker lease on `blob_claims`.
--
-- The scheduler is started by every API replica, so two replicas can select the
-- same `PENDING` row in the same run. Without coordination both would delete the
-- blob, double-bump the retry counter and write duplicate audit entries — and a
-- delete that "fails" on one replica after succeeding on the other could push a
-- row toward quarantine for no reason. Idempotent delete alone is not enough
-- because the retry/audit state is not idempotent.
--
-- A worker takes a short-lived lease with one conditional UPDATE
-- (`reconcile_lease_owner` / `reconcile_lease_expires_at`); a replica that
-- cannot take it skips the row. The lease is never renewed, so a crashed
-- worker's rows become eligible again on the next run. Additive and nullable,
-- so it can be left in place on rollback.
ALTER TABLE "blob_claims"
  ADD COLUMN "reconcile_lease_owner" TEXT,
  ADD COLUMN "reconcile_lease_expires_at" TIMESTAMP(3);
