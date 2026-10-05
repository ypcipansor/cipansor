-- An SPMB intake as the brochure prints it (decisions/spmb-2027-2028.md item 2):
-- per unit, the requirements as a list, the minimum age and a contact person;
-- per wave, the sessions after registration (test, results, re-registration)
-- and the discount for paying in full.
--
-- Additive, except `requirements`, which goes from one text (a JSON array, or
-- free text an admin typed) to a list. Every row keeps what it said:
--   * a JSON array becomes its elements, in order;
--   * any other text becomes its non-empty lines;
--   * empty or NULL becomes an empty list.
-- Postgres refuses a subquery in ALTER COLUMN ... USING, so the list is built
-- in a new column, which then takes the old one's name.
BEGIN;

ALTER TABLE "admission_periods"
  ADD COLUMN "requirement_lines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $$
DECLARE
  r record;
  lines text[];
BEGIN
  FOR r IN
    SELECT id, requirements FROM "admission_periods"
    WHERE requirements IS NOT NULL AND btrim(requirements) <> ''
  LOOP
    BEGIN
      IF jsonb_typeof(r.requirements::jsonb) = 'array' THEN
        SELECT coalesce(array_agg(btrim(e) ORDER BY i), ARRAY[]::text[]) INTO lines
        FROM jsonb_array_elements_text(r.requirements::jsonb) WITH ORDINALITY AS t(e, i)
        WHERE btrim(e) <> '';
      ELSE
        lines := ARRAY[btrim(r.requirements)];
      END IF;
    EXCEPTION WHEN others THEN
      -- Not JSON: free text, one requirement per line.
      SELECT coalesce(array_agg(btrim(l) ORDER BY i), ARRAY[]::text[]) INTO lines
      FROM unnest(string_to_array(r.requirements, E'\n')) WITH ORDINALITY AS t(l, i)
      WHERE btrim(l) <> '';
    END;
    UPDATE "admission_periods" SET requirement_lines = lines WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "admission_periods" DROP COLUMN "requirements";
ALTER TABLE "admission_periods" RENAME COLUMN "requirement_lines" TO "requirements";

ALTER TABLE "admission_periods"
  ADD COLUMN "min_age_months" INTEGER,
  ADD COLUMN "age_reference_date" DATE,
  ADD COLUMN "contact_name" TEXT,
  ADD COLUMN "contact_phone" TEXT,
  ADD CONSTRAINT "admission_periods_min_age_months_range"
    CHECK ("min_age_months" IS NULL OR "min_age_months" BETWEEN 0 AND 360);

ALTER TABLE "admission_waves"
  ADD COLUMN "test_start_date" DATE,
  ADD COLUMN "test_end_date" DATE,
  ADD COLUMN "results_start_date" DATE,
  ADD COLUMN "results_end_date" DATE,
  ADD COLUMN "re_registration_start_date" DATE,
  ADD COLUMN "re_registration_end_date" DATE,
  ADD COLUMN "full_payment_discount" DECIMAL(12,2),
  -- An end needs a start, and is not before it. A start alone is one day.
  ADD CONSTRAINT "admission_waves_test_dates_ordered"
    CHECK ("test_end_date" IS NULL
           OR ("test_start_date" IS NOT NULL AND "test_end_date" >= "test_start_date")),
  ADD CONSTRAINT "admission_waves_results_dates_ordered"
    CHECK ("results_end_date" IS NULL
           OR ("results_start_date" IS NOT NULL AND "results_end_date" >= "results_start_date")),
  ADD CONSTRAINT "admission_waves_re_registration_dates_ordered"
    CHECK ("re_registration_end_date" IS NULL
           OR ("re_registration_start_date" IS NOT NULL
               AND "re_registration_end_date" >= "re_registration_start_date")),
  ADD CONSTRAINT "admission_waves_full_payment_discount_nonnegative"
    CHECK ("full_payment_discount" IS NULL OR "full_payment_discount" >= 0);

COMMIT;
