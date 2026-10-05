-- The yayasan's real office holders, as it published them (decided 2026-10-02,
-- decisions/spmb-2027-2028.md item 5; the list is
-- packages/shared/src/types/office-holders.ts).
--
-- Every change is guarded so that nothing an admin entered is touched:
--   * a demo account is renamed only where its e-mail AND its name are still
--     exactly what the seed gave it;
--   * a board member row is set aside only where its name AND position are
--     exactly one of the invented seed rows — deactivated, never deleted;
--   * a real office holder is added only where no row with that name and
--     position exists, and only when there is exactly one foundation;
--   * a start date is cleared only where it is the date the presentation pack
--     invented (2022-01-01) on a row it created for a real name.
BEGIN;

-- Nobody here knows when each person took office. An invented "Sejak Jan
-- 2020" beside a real name is a false statement, so the column may be empty
-- until an admin enters the date from the appointment deed.
ALTER TABLE "board_members" ALTER COLUMN "start_date" DROP NOT NULL;

-- Demo accounts: the invented names of the organs and the TK Qur'an head.
UPDATE "users" u
SET name = r.new_name, updated_at = now()
FROM (VALUES
  ('yayasan.pembina@cipansor.or.id',    'K.H. Endang Saepudin, M.Pd.I', 'K.H. Aang Suandi, Lc.'),
  ('yayasan.pengawas@cipansor.or.id',   'H. Ujang Suryana, S.E.',       'Drs. Asep Tamim, M.Si.'),
  ('yayasan.sekretaris@cipansor.or.id', 'Hj. Siti Maemunah, S.Pd.',     'H. Dadan Ali Ridwan, S.Ag'),
  -- The yayasan publishes no Anggota Pengurus: the account is named by its function.
  ('yayasan.anggota@cipansor.or.id',    'H. Dedi Mulyadi, S.Ag.',       'Anggota Pengurus Yayasan'),
  ('tkq.kepala@cipansor.or.id',         'Hj. Wulan Sari, S.Pd.AUD',     'Ustadzah Ani Siti Nurasiah, S.Pd.')
) AS r (email, old_name, new_name)
WHERE u.email = r.email AND u.name = r.old_name;

-- The older seed's second set of organ accounts, already switched off by the
-- presentation pack: keep them off, and stop them claiming an office under an
-- invented name.
UPDATE "users" u
SET name = 'Akun lama (tidak dipakai)', updated_at = now()
FROM (VALUES
  ('ketua@cipansor.or.id',      'KH. Muhammad Yusuf'),
  ('pembina@cipansor.or.id',    'KH. Abdurrahman Wahid Nurcholis'),
  ('sekretaris@cipansor.or.id', 'Hj. Siti Fatimah'),
  ('bendahara@cipansor.or.id',  'H. Abdullah Rahman')
) AS r (email, old_name)
WHERE u.email = r.email AND u.name = r.old_name AND u.is_active = false;

-- Board members: the invented rows of both seeds step down.
UPDATE "board_members" b
SET is_active = false, updated_at = now()
FROM (VALUES
  ('KH. Muhammad Yusuf',           'Ketua'),
  ('H. Ahmad Fauzi',               'Wakil Ketua'),
  ('Hj. Siti Fatimah',             'Sekretaris'),
  ('H. Abdullah Rahman',           'Bendahara'),
  ('Ustadz Hasan Basri',           'Anggota'),
  ('K.H. Endang Saepudin, M.Pd.I', 'Pembina'),
  ('H. Ujang Suryana, S.E.',       'Pengawas'),
  ('Hj. Siti Maemunah, S.Pd.',     'Sekretaris'),
  ('H. Dedi Mulyadi, S.Ag.',       'Anggota')
) AS r (name, position)
WHERE b.name = r.name AND b.position = r.position AND b.is_active = true;

-- The real organs.
-- In the order the yayasan published them; the portal lists equals in the
-- order their rows were recorded.
CREATE TEMP TABLE real_organ (ord int, name text, position text, photo_url text) ON COMMIT DROP;
INSERT INTO real_organ VALUES
  (1, 'K.H. Aang Suandi, Lc.',                   'Pembina',    '/images/people/pembina-aang-suandi.webp'),
  (2, 'K.H. Muhammad Taufik Ismail, S.Pd',       'Pembina',    '/images/people/pimpinan-pesantren.webp'),
  (3, 'K.H. Drs. Tetep Abdullatip, M.Ag.',       'Pembina',    '/images/people/pembina-tetep-abdullatip.webp'),
  (4, 'Drs. Asep Tamim, M.Si.',                  'Pengawas',   NULL),
  (5, 'H. Tantan Permana',                       'Pengawas',   NULL),
  (6, 'Aminudin',                                'Pengawas',   NULL),
  (7, 'H. Ramram Mansur Ramdani, S.Pd.I., M.Ag', 'Ketua',      '/images/people/ketua-yayasan.webp'),
  (8, 'H. Dadan Ali Ridwan, S.Ag',               'Sekretaris', '/images/people/kepala-sdit.webp'),
  (9, 'H. Andi Muhammad Badrudin, S.T.',         'Bendahara',  '/images/people/bendahara-yayasan.webp');

-- Rows the presentation pack already made for a real name: give them their
-- portrait, and drop the start date it invented.
UPDATE "board_members" b
SET photo_url  = COALESCE(b.photo_url, o.photo_url),
    start_date = CASE WHEN b.start_date = DATE '2022-01-01' THEN NULL ELSE b.start_date END,
    updated_at = now()
FROM real_organ o
WHERE b.name = o.name AND b.position = o.position;

INSERT INTO "board_members" (id, foundation_id, name, position, photo_url, is_active, created_at, updated_at)
SELECT gen_random_uuid()::text, f.id, o.name, o.position, o.photo_url, true,
       now() + o.ord * interval '1 millisecond', now()
FROM real_organ o
CROSS JOIN (SELECT id FROM "foundations" WHERE (SELECT count(*) FROM "foundations") = 1) f
WHERE NOT EXISTS (
  SELECT 1 FROM "board_members" b
  WHERE b.foundation_id = f.id AND b.name = o.name AND b.position = o.position
);

COMMIT;
