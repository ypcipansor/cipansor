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
-- Bila masih ada dua baris dengan `lower(email)` yang sama, `CREATE UNIQUE
-- INDEX` di bawah gagal dan seluruh migrasi dibatalkan — dan itu memang
-- tujuannya: kegagalan itu sendiri adalah buktinya, dan lebih baik deploy
-- berhenti daripada dua akun bertabrakan tanpa disadari. Skrip
-- `db:normalize-emails` tetap ada untuk pemeriksaan dan laporan lebih awal.
UPDATE "users"
SET "email" = lower(trim("email"))
WHERE "email" IS NOT NULL AND "email" <> lower(trim("email"));

CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower(trim(email)));
