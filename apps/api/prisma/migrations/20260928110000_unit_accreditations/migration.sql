-- A unit's accreditation as its certificate states it (decided 2026-09-28,
-- decisions/akreditasi-unit.md): one row per certificate, with the PDF.
--
-- Additive: one enum and one table. `units.accreditation` stays for now and is
-- no longer read or written; nothing is copied from it, because no certificate
-- stands behind its values (the readiness self-assessment used to write it).
BEGIN;

CREATE TYPE "AccreditationRating" AS ENUM ('A', 'B', 'C');

CREATE TABLE "unit_accreditations" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "rating" "AccreditationRating" NOT NULL,
    "certificate_number" TEXT NOT NULL,
    "decree_number" TEXT NOT NULL,
    "decreed_at" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "issuer" TEXT NOT NULL DEFAULT 'BAN-PDM',
    "certificate_pdf" BYTEA NOT NULL,
    "certificate_sha256" TEXT NOT NULL,
    "reminder_sent_at" TIMESTAMP(3),
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_accreditations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "unit_accreditations_unit_id_valid_until_idx" ON "unit_accreditations"("unit_id", "valid_until");

ALTER TABLE "unit_accreditations" ADD CONSTRAINT "unit_accreditations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "unit_accreditations" ADD CONSTRAINT "unit_accreditations_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
