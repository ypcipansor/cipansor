-- The public site lists each unit's extracurriculars in Indonesian, English
-- and Arabic (decisions/fasilitas-dan-kegiatan-situs-publik.md); the unit's
-- admin keeps the two translations with the record. Empty means the site
-- shows the Indonesian name.
BEGIN;
ALTER TABLE "extracurriculars" ADD COLUMN "name_en" TEXT;
ALTER TABLE "extracurriculars" ADD COLUMN "name_ar" TEXT;
COMMIT;
