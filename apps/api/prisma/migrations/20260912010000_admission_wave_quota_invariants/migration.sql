-- Kuota gelombang SPMB: jadikan batasnya aturan basis data, bukan hanya aturan
-- satu jalur kode.
--
-- `assignRegistrantToWave` sudah benar: ia menaikkan `registered_count` dengan
-- compare-and-set bersyarat (`registeredCount < quota`) lalu memeriksa bahwa
-- tepat satu baris terkena, sehingga dua pendaftar yang berebut slot terakhir
-- tidak bisa sama-sama menang. Tetapi jalur itu bukan satu-satunya yang menulis
-- kolom ini: impor, perbaikan manual lewat psql, dan skrip pemeliharaan menulis
-- langsung. Bagi mereka tidak ada apa pun yang menghalangi kuota terlampaui.
--
-- Dua invarian, dipisah namanya supaya pesan kesalahannya menyebut aturan yang
-- dilanggar:
--   1. registered_count <= quota  — kuota adalah batas, bukan saran.
--   2. quota >= 1                 — kuota 0 membuat `fillRate` di
--                                   ppdb-wave.service.ts membagi dengan nol
--                                   (Infinity/NaN sampai ke layar laporan),
--                                   dan Zod sudah menolaknya di API (min(1)).
--
-- Catatan untuk yang menurunkan kuota di bawah jumlah pendaftar yang sudah
-- masuk: itu ditolak, dan memang seharusnya — pendaftar yang sudah terdaftar
-- tidak bisa dibatalkan dengan mengecilkan angka. Cara menutup pendaftaran
-- lebih awal adalah menyetel status gelombang menjadi FULL/CLOSED, yang sudah
-- dibedakan dari penuh-karena-kapasitas lewat `full_by_capacity`.
-- API menjawab 400 dengan kalimat itu (ppdb-wave.service.ts) sebelum sampai ke
-- batasan ini.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admission_waves_registered_within_quota'
      AND conrelid = 'admission_waves'::regclass
  ) THEN
    ALTER TABLE "admission_waves"
      ADD CONSTRAINT "admission_waves_registered_within_quota"
      CHECK ("registered_count" <= "quota");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admission_waves_quota_positive'
      AND conrelid = 'admission_waves'::regclass
  ) THEN
    ALTER TABLE "admission_waves"
      ADD CONSTRAINT "admission_waves_quota_positive"
      CHECK ("quota" >= 1);
  END IF;
END $$;
