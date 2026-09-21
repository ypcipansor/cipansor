-- NIS bukan nomor yayasan (audit #489 bagian 4).
--
-- `students.nis` unik SELURUH yayasan memaksa satu ruang nomor untuk lima
-- sekolah: SD IT dan SMP IT tidak boleh menerbitkan nomor yang sama, padahal
-- NIS/NIPD memang milik sekolah yang menerbitkannya. Kebenaran per unit sudah
-- disimpan `student_unit_identifiers` sejak #495 (unik [unit_id, nis] dan
-- [student_id, unit_id]); kolom `students.nis` tinggal cuplikan unit sekarang.
--
-- Kolomnya TIDAK dibuang: image rilis sebelumnya masih menulisnya, dan
-- `DROP COLUMN` akan mematikannya di jendela rollback. Yang dibuang hanya
-- indeks uniknya; indeks biasa tetap ada untuk pencarian.

DROP INDEX IF EXISTS "students_nis_key";

CREATE INDEX IF NOT EXISTS "students_nis_idx" ON "students" ("nis");
