-- Who decided a permit, and in what capacity (decided 2026-09-25): the
-- learner's musyrif or wali kelas, or a unit head for long leave, when no
-- mentor is on record, or on taking over from the mentor.
--
-- Additive: a new enum and two columns, the second with a default. Permits
-- decided before this migration keep `decided_as` NULL — their capacity was
-- never recorded, and guessing it now would put words in the record.
BEGIN;

CREATE TYPE "PermitDecider" AS ENUM ('MUSYRIF', 'WALI_KELAS', 'KEPALA_SEKOLAH', 'PIMPINAN_PESANTREN');

ALTER TABLE "permits"
  ADD COLUMN "decided_as" "PermitDecider",
  ADD COLUMN "took_over" BOOLEAN NOT NULL DEFAULT false;

COMMIT;
