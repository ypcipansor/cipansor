-- A doctor's note attached to a permit (decided 2026-09-28,
-- decisions/pemutus-izin-santri.md): at most one per permit, the file in the
-- row until the academic year of the leave ends, then erased (`content` set to
-- NULL, `erased_at` stamped) — the facts of it stay.
--
-- Additive: one table.
BEGIN;

CREATE TABLE "permit_attachments" (
    "id" TEXT NOT NULL,
    "permit_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA,
    "retain_until" DATE NOT NULL,
    "erased_at" TIMESTAMP(3),
    "uploaded_by_id" TEXT NOT NULL,
    "first_viewed_by_id" TEXT,
    "first_viewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permit_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permit_attachments_permit_id_key" ON "permit_attachments"("permit_id");

CREATE INDEX "permit_attachments_retain_until_idx" ON "permit_attachments"("retain_until");

ALTER TABLE "permit_attachments" ADD CONSTRAINT "permit_attachments_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "permit_attachments" ADD CONSTRAINT "permit_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "permit_attachments" ADD CONSTRAINT "permit_attachments_first_viewed_by_id_fkey" FOREIGN KEY ("first_viewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
