-- NIS per unit: tabel `student_unit_identifiers` (santri × unit → NIS).
--
-- NIS/NIPD adalah nomor induk yang diterbitkan SATUAN PENDIDIKAN — buku induk
-- dan rapor memuat NIS unit itu bersama NISN. `students.nis` hanya menyimpan
-- satu nomor dan unik lintas yayasan, sehingga (a) santri yang pindah unit
-- kehilangan NIS lamanya di dokumen unit lama, dan (b) dua unit yang sama-sama
-- menomori dari "2024001" tidak bisa hidup berdampingan. Audit PR #489 (B1)
-- memutuskan: NIS dipindah per unit, bukan dibuang.
--
-- Mengapa tabel sendiri dan bukan kolom di `student_unit_enrollments`: tabel
-- itu satu baris per (santri, unit, TAHUN AJARAN). NIS yang sama berulang di
-- setiap tahun, jadi "satu NIS satu santri per unit" tidak bisa jadi indeks unik
-- di sana. Di sini bisa: (unit_id, nis) dan (student_id, unit_id).
--
-- Migrasi ini HANYA menambah. `students.nis` tetap ada, tetap unik, dan ditulis
-- ganda oleh aplikasi; image `:rollback` tidak menyentuh tabel ini dan tetap
-- berjalan. Penghapusannya bagian 4, satu rilis kemudian.
--
-- Isi awal: NIS yang sekarang, untuk unit yang sekarang — satu-satunya pasangan
-- yang benar-benar diketahui. NIS unit-unit lama tidak pernah tersimpan dan
-- tidak dikarang. Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS "student_unit_identifiers" (
    "id"         TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "unit_id"    TEXT NOT NULL,
    "nis"        TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_unit_identifiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_unit_identifiers_student_id_unit_id_key"
    ON "student_unit_identifiers" ("student_id", "unit_id");
CREATE UNIQUE INDEX IF NOT EXISTS "student_unit_identifiers_unit_id_nis_key"
    ON "student_unit_identifiers" ("unit_id", "nis");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_unit_identifiers_student_id_fkey') THEN
    ALTER TABLE "student_unit_identifiers"
      ADD CONSTRAINT "student_unit_identifiers_student_id_fkey"
      FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_unit_identifiers_unit_id_fkey') THEN
    ALTER TABLE "student_unit_identifiers"
      ADD CONSTRAINT "student_unit_identifiers_unit_id_fkey"
      FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  -- NIS kosong bukan NIS. Spasi tepi dibuang aplikasi sebelum menulis.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_unit_identifiers_nis_not_blank_check') THEN
    ALTER TABLE "student_unit_identifiers"
      ADD CONSTRAINT "student_unit_identifiers_nis_not_blank_check"
      CHECK ("nis" = btrim("nis") AND "nis" <> '');
  END IF;
END $$;

INSERT INTO "student_unit_identifiers" ("id", "student_id", "unit_id", "nis", "created_at", "updated_at")
SELECT gen_random_uuid()::text, s."id", s."unit_id", btrim(s."nis"), s."created_at", CURRENT_TIMESTAMP
  FROM "students" s
 WHERE btrim(s."nis") <> ''
ON CONFLICT DO NOTHING;
