-- Alamat e-mail harus unik tanpa memandang huruf besar/kecil.
--
-- `users_email_key` (dari `@unique` di schema) membandingkan string apa
-- adanya, jadi `Guru@cipansor.or.id` dan `guru@cipansor.or.id` lolos sebagai
-- dua baris. Login SSO menerima e-mail dengan huruf apa pun dari penyedia
-- identitas, sehingga akun yang sama bisa gagal ditemukan. Indeks fungsional
-- ini menutup celah itu di tingkat basis data, bukan hanya di kode penulis.
--
-- Penulisan baru sudah dinormalkan lewat `utils/email.ts`. Indeks ini adalah
-- jaring pengaman untuk penulis yang belum/tidak melewatinya.
--
-- Baris lama ikut dinormalkan DI SINI, di dalam migrasi, bukan lewat langkah
-- manual terpisah. Login mencari `lower(email)`, jadi baris campuran huruf yang
-- dibiarkan apa adanya akan langsung kehilangan pemiliknya setelah deploy —
-- dan `db:deploy` tidak pernah menjalankan `db:normalize-emails`. Normalisasi
-- di sini berarti urutan yang benar dijamin, di lingkungan mana pun.
--
-- Bila masih ada dua baris dengan `lower(trim(email))` yang sama, hentikan
-- migrasi DI SINI — sebelum `UPDATE` menyentuh apa pun — dengan pesan yang
-- menyebut alamat dan id akunnya. Sebelumnya kegagalan baru muncul sebagai
-- `unique_violation` dari `CREATE UNIQUE INDEX` setelah `UPDATE` berjalan,
-- yang memberitahu operator bahwa ada tabrakan tetapi tidak akun mana yang
-- bertabrakan dan pada tahap apa deploy berhenti. Skrip
-- `db:normalize-emails` memakai kunci yang sama untuk pemeriksaan lebih awal.
DO $$
DECLARE
  collisions text;
BEGIN
  -- Dua tingkat agregasi: `string_agg` per alamat dulu (di dalam subquery yang
  -- di-`GROUP BY`), baru digabung jadi satu laporan. `string_agg(id, ...)` yang
  -- bersarang langsung di dalam `string_agg(...)` ditolak Postgres
  -- ("aggregate function calls cannot be nested"), sehingga migrasi ini gagal
  -- bahkan pada basis data kosong.
  SELECT string_agg(
           format('  %s (akun: %s)', email, ids),
           E'\n'
           ORDER BY email
         )
    INTO collisions
    FROM (
      SELECT
        lower(trim(email)) AS email,
        string_agg(id, ', ' ORDER BY id) AS ids
      FROM "users"
      WHERE "email" IS NOT NULL
      GROUP BY lower(trim(email))
      HAVING count(*) > 1
    ) AS conflicting;

  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION
      E'Tidak dapat menerapkan indeks unik e-mail: beberapa alamat dimiliki lebih dari satu akun.\n%\nGabungkan atau ubah akun-akun itu secara manual, jalankan `pnpm --filter api db:normalize-emails` untuk memverifikasi, lalu ulangi deploy.',
      collisions;
  END IF;
END $$;

UPDATE "users"
SET "email" = lower(trim("email"))
WHERE "email" IS NOT NULL AND "email" <> lower(trim("email"));

CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower(trim(email)));
