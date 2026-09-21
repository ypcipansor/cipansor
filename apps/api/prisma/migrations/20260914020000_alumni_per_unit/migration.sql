-- Alumni per unit (audit #489 bagian 3b-1).
--
-- `alumni.student_id` unik membuat santri hanya bisa lulus SEKALI seumur hidup:
-- lulusan SD IT yang kemudian lulus dari SMP IT ditolak P2002 ("… already exists").
-- Yang unik sebenarnya lulus dari SATU unit pada SATU tahun. Hanya menambah/melonggarkan:
-- image `:rollback` tetap jalan (klien lamanya tidak bergantung pada indeks ini
-- untuk membaca).

DROP INDEX IF EXISTS "alumni_student_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "alumni_student_id_unit_id_graduation_year_key"
  ON "alumni" ("student_id", "unit_id", "graduation_year");

CREATE INDEX IF NOT EXISTS "alumni_student_id_idx" ON "alumni" ("student_id");

-- Label alasan keluar dari backfill 20260912020000 memberi `PINDAH_UNIT` pada
-- setiap baris yang diikuti unit berbeda, termasuk kenaikan jenjang normal
-- (TK tahun ini → SD IT tahun depan). Pindah unit berarti di TENGAH tahun
-- ajaran yang sama; unit berikutnya di tahun ajaran BERBEDA adalah kelulusan.
-- Migrasi lama tidak disunting (sudah diterapkan di produksi).
WITH urut AS (
  SELECT
    e."id",
    e."unit_id",
    e."academic_year_id",
    LEAD(e."unit_id") OVER w AS unit_berikutnya,
    LEAD(e."academic_year_id") OVER w AS tahun_berikutnya
  FROM "student_unit_enrollments" e
  WINDOW w AS (PARTITION BY e."student_id" ORDER BY e."entry_date", e."id")
)
UPDATE "student_unit_enrollments" e
SET "exit_reason" = 'LULUS'
FROM urut
WHERE urut."id" = e."id"
  AND e."exit_reason" = 'PINDAH_UNIT'
  AND urut.unit_berikutnya IS NOT NULL
  AND urut.unit_berikutnya <> urut."unit_id"
  AND urut.tahun_berikutnya <> urut."academic_year_id";
