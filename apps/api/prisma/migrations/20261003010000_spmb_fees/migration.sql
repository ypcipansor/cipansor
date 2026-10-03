-- An SPMB intake's fee table, as the brochure's "Rincian Biaya" prints it
-- (decisions/spmb-2027-2028.md item 2): per unit, lines with an amount for
-- ikhwan and one for akhwat, for boarding, non-boarding or both. Additive.
BEGIN;

CREATE TYPE "FeeResidency" AS ENUM ('ALL', 'BOARDING', 'NON_BOARDING');

CREATE TABLE "admission_fee_items" (
  "id" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "label" TEXT NOT NULL,
  "male_amount" DECIMAL(12,2) NOT NULL,
  "female_amount" DECIMAL(12,2) NOT NULL,
  "residency" "FeeResidency" NOT NULL DEFAULT 'ALL',
  "is_monthly" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admission_fee_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admission_fee_items_amounts_nonnegative"
    CHECK ("male_amount" >= 0 AND "female_amount" >= 0),
  CONSTRAINT "admission_fee_items_label_not_blank" CHECK (btrim("label") <> '')
);

CREATE INDEX "admission_fee_items_period_id_idx" ON "admission_fee_items"("period_id");

ALTER TABLE "admission_fee_items"
  ADD CONSTRAINT "admission_fee_items_period_id_fkey"
  FOREIGN KEY ("period_id") REFERENCES "admission_periods"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
