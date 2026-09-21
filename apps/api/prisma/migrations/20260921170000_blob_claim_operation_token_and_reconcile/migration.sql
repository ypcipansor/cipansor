-- Blob-claim hardening: per-operation token + reconciliation lifecycle.
--
-- 1. `operation_token`. The claim used to be identified by `holder_id` alone,
--    so a RECORD and a DISCARD from the SAME user could take each other over
--    (and a release keyed on URL+user could delete an unrelated operation's
--    claim). Every claim now carries a cryptographically random token minted
--    per operation; refresh/release/tombstone/commit checks match
--    (id, operation_token, kind), never the user id. Existing rows get a
--    random token so no row has a guessable identity.
--
-- `gen_random_bytes` needs the pgcrypto extension and NO migration creates it,
-- so `migrate deploy` on an empty database failed here (migrations must replay
-- from empty; that is the whole point of the 0_init squash). `gen_random_uuid`
-- is core since PG13 and needs no extension. Two UUIDv4s concatenated without
-- the dashes give 64 hex characters — the exact shape
-- `randomBytes(32).toString('hex')` mints in the application.
ALTER TABLE "blob_claims" ADD COLUMN "operation_token" TEXT NOT NULL
  DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- 2. Reconciliation lifecycle. `reconcile_status` is terminal for DONE /
--    QUARANTINED, `reconcile_attempts` + `next_reconcile_at` bound retries so a
--    poison row cannot starve the bounded batch.
CREATE TYPE "BlobReconcileStatus" AS ENUM ('PENDING', 'DONE', 'QUARANTINED');

ALTER TABLE "blob_claims"
  ADD COLUMN "reconciled_at" TIMESTAMP(3),
  ADD COLUMN "reconcile_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_reconcile_at" TIMESTAMP(3),
  ADD COLUMN "next_reconcile_at" TIMESTAMP(3),
  ADD COLUMN "reconcile_status" "BlobReconcileStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX "blob_claims_reconcile_status_next_reconcile_at_idx"
  ON "blob_claims"("reconcile_status", "next_reconcile_at");
