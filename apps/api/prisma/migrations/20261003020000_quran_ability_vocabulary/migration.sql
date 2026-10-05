-- A registrant's Qur'an ability, one vocabulary: BELUM_BISA, IQRA, LANCAR,
-- TARTIL, TAHFIDZ. The public SPMB form sent "IQRO" and "HAFIDZ" while the
-- lead scores, the seeds and the column's own comment used "IQRA" and
-- "TAHFIDZ", so a declared hafalan never counted. The column becomes an enum
-- so a sixth spelling cannot be stored again.
--
-- The two known variants are mapped. Any other value is not discarded: it is
-- kept in the registrant's notes, where the panitia can still read it, and the
-- column is emptied.
BEGIN;

UPDATE "registrants"
SET "notes" = concat_ws(E'\n', "notes", 'Kemampuan Al-Qur''an (isian lama): ' || btrim("quran_ability")),
    "quran_ability" = NULL
WHERE btrim("quran_ability") <> ''
  AND upper(btrim("quran_ability")) NOT IN
    ('BELUM_BISA', 'IQRA', 'IQRO', 'LANCAR', 'TARTIL', 'TAHFIDZ', 'HAFIDZ');

UPDATE "registrants"
SET "quran_ability" = CASE upper(btrim("quran_ability"))
    WHEN 'IQRO' THEN 'IQRA'
    WHEN 'HAFIDZ' THEN 'TAHFIDZ'
    ELSE NULLIF(upper(btrim("quran_ability")), '')
  END
WHERE "quran_ability" IS NOT NULL;

CREATE TYPE "QuranAbility" AS ENUM ('BELUM_BISA', 'IQRA', 'LANCAR', 'TARTIL', 'TAHFIDZ');

ALTER TABLE "registrants"
  ALTER COLUMN "quran_ability" TYPE "QuranAbility"
  USING "quran_ability"::"QuranAbility";

COMMIT;
