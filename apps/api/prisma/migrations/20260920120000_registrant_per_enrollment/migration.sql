-- Progresi internal lewat SPMB (audit #489 bagian 3b-2).
--
-- `registrants.student_id` unik berarti satu santri hanya boleh punya SATU
-- pendaftaran seumur hidup: lulusan SD IT yang mendaftar SMP IT tidak bisa
-- ditautkan ke baris santri yang sama, sehingga onboarding membuat SANTRI
-- GANDA (orang yang sama, dua baris, dua NIS, dua kartu). Yang benar: satu
-- santri, banyak pendaftaran — satu per unit yang ia masuki.
--
-- Hanya melonggarkan: indeks unik ditukar indeks biasa, tidak ada kolom atau
-- tabel yang hilang, sehingga image `:rollback` tetap bisa membaca dan menulis
-- (klien lamanya hanya kehilangan jaminan unik yang tidak pernah ia butuhkan
-- untuk membaca).

DROP INDEX IF EXISTS "registrants_student_id_key";

CREATE INDEX IF NOT EXISTS "registrants_student_id_idx" ON "registrants" ("student_id");
