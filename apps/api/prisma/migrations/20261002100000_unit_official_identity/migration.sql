-- Each unit's official identity, as the permit and the national reference data
-- give it (decided 2026-10-02, decisions/spmb-2027-2028.md item 6). Documents
-- print the official name; screens keep the short `name`.
--
-- Additive, then a guarded fill:
--   * identifiers are written only where exactly one live unit has the type,
--     only into a column that is still empty, and an NPSN only when no other
--     row (deleted ones included, the index is unique) already holds it;
--   * the address and the yayasan's record are corrected only where they still
--     hold the seed's placeholder text, so nothing an admin typed is touched.
--
-- Sources: Kemendikdasmen Data Referensi Pendidikan (NPSN 69888850, 69988558,
-- 70038414) and the units' letterheads. TK Qur'an has no NPSN in the reference
-- data; its admin fills it in.
BEGIN;

ALTER TABLE "units"
  ADD COLUMN "official_name" TEXT,
  ADD COLUMN "operating_permit_number" TEXT,
  ADD COLUMN "operating_permit_date" DATE;

WITH ref ("type", official_name, npsn, permit_number, permit_date) AS (
  VALUES
    ('TK_QURAN'::"UnitType",  'TK Qur''an An Nur Pesantren Cipansor', NULL,       NULL,                           NULL::date),
    ('SD_IT'::"UnitType",     'SD IT Pesantren Cipansor',             '69888850', '642.2/0131/Disdik',            DATE '2015-01-16'),
    ('SMP_IT'::"UnitType",    'SMP IT Pesantren Cipansor',            '69988558', '503/0671/Kep.07/DPMPTSP/2019', DATE '2019-05-02'),
    ('SMA_QURAN'::"UnitType", 'SMA Qur''an Pesantren Cipansor',       '70038414', '5/011050/DPMPTSP/II/2023',     DATE '2023-02-07')
),
single AS (
  SELECT u.id, ref.*
  FROM "units" u
  JOIN ref ON ref."type" = u."type"
  WHERE u.deleted_at IS NULL
    AND (SELECT count(*) FROM "units" v WHERE v."type" = u."type" AND v.deleted_at IS NULL) = 1
)
UPDATE "units" u
SET official_name           = COALESCE(u.official_name, s.official_name),
    operating_permit_number = COALESCE(u.operating_permit_number, s.permit_number),
    operating_permit_date   = COALESCE(u.operating_permit_date, s.permit_date),
    npsn = CASE
      WHEN u.npsn IS NULL
       AND s.npsn IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "units" w WHERE w.npsn = s.npsn)
      THEN s.npsn
      ELSE u.npsn
    END
FROM single s
WHERE s.id = u.id;

-- The seed placed every unit in "Kp. Cipansor"; the permits, the letterheads
-- and the reference data all give Kp. Nyalindung, Desa Buniasih.
UPDATE "units"
SET address = 'Jl. Raya Malangbong - Kadipaten RT 001 RW 001, Kp. Nyalindung, Desa Buniasih, Kec. Kadipaten, Kab. Tasikmalaya, Jawa Barat 46157'
WHERE address = 'Kp. Cipansor, Kec. Kadipaten, Kab. Tasikmalaya, Jawa Barat 46157';

-- The yayasan's record still held the seed's sample values: another legal
-- name, a Sukabumi address, a sample NPWP and a 1985 founding date. The legal
-- name and the founding date are those of the founding deed (Akta Notaris
-- No. 01, 5 April 2012); the NPWP is cleared rather than guessed.
UPDATE "foundations" SET legal_name = 'Yayasan Pesantren Cipansor'
WHERE legal_name = 'Yayasan Pendidikan Islam Cipansor';
UPDATE "foundations"
SET address = 'Jl. Raya Malangbong - Kadipaten RT 001 RW 001, Kp. Nyalindung, Desa Buniasih, Kec. Kadipaten, Kab. Tasikmalaya, Jawa Barat 46157'
WHERE address = 'Jl. Cipansor No. 1, Kec. Sukabumi, Kota Sukabumi, Jawa Barat';
UPDATE "foundations" SET tax_id = NULL WHERE tax_id = '01.234.567.8-901.000';
UPDATE "foundations" SET founding_date = DATE '2012-04-05' WHERE founding_date = DATE '1985-08-17';
UPDATE "foundations" SET phone = '0811110400' WHERE phone = '0266100001';
UPDATE "foundations" SET email = 'halo@cipansor.or.id' WHERE email = 'yayasan@cipansor.or.id';

COMMIT;
