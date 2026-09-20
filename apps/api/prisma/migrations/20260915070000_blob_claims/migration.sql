-- BlobClaim: the durable handshake between "upload a blob" and "discard an
-- orphan blob" (BUG 4). One live claim per blob URL, which is what lets the
-- discard path and the create-record path serialize on the same row instead of
-- racing between a reference probe and an Azure delete.
--
-- No foreign keys: a claim outlives nothing, and an orphan blob by definition
-- has no row to reference.

-- CreateEnum
CREATE TYPE "BlobClaimKind" AS ENUM ('RECORD', 'DISCARD');

-- CreateTable
CREATE TABLE "blob_claims" (
    "id" TEXT NOT NULL,
    "blob_url" TEXT NOT NULL,
    "kind" "BlobClaimKind" NOT NULL,
    "holder_id" TEXT NOT NULL,
    "record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blob_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blob_claims_blob_url_key" ON "blob_claims"("blob_url");

-- CreateIndex
CREATE INDEX "blob_claims_expires_at_idx" ON "blob_claims"("expires_at");
