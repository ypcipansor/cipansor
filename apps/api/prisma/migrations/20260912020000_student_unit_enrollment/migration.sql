-- Riwayat satuan pendidikan per tahun ajaran.
--
-- Masalahnya: `students.unit_id` hanya menyimpan unit SEKARANG. Sekitar 85
-- tempat menyaring lewat `student: { unitId }`, yang berarti setiap laporan
-- bertanya "unit santri ini apa?" padahal maksudnya "saat itu unitnya apa?".
-- Santri yang naik dari TK ke SD IT membawa catatan kesehatan, izin,
-- penghargaan, dan angka dasbor tahun-tahun TK-nya ikut pindah ke SD IT.
--
-- Migrasi ini HANYA membuat sumber jawabannya dan mengisinya dari bukti yang
-- sudah ada. Tidak satu pun laporan diubah di sini — penukaran penyaringnya
-- dilakukan satu modul per PR, supaya tiap perubahan angka bisa dibaca
-- tersendiri.

CREATE TABLE IF NOT EXISTS "student_unit_enrollments" (
    "id"               TEXT NOT NULL,
    "student_id"       TEXT NOT NULL,
    "unit_id"          TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "entry_date"       DATE NOT NULL,
    "exit_date"        DATE,
    "exit_reason"      TEXT,
    "grade_level"      TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_unit_enrollments_pkey" PRIMARY KEY ("id")
);

-- Satu baris per (santri, unit, tahun ajaran). Inilah yang membuat backfill
-- boleh dijalankan ulang tanpa menggandakan riwayat.
CREATE UNIQUE INDEX IF NOT EXISTS "student_unit_enrollments_student_unit_year_key"
    ON "student_unit_enrollments" ("student_id", "unit_id", "academic_year_id");

CREATE INDEX IF NOT EXISTS "student_unit_enrollments_student_id_entry_date_idx"
    ON "student_unit_enrollments" ("student_id", "entry_date");
CREATE INDEX IF NOT EXISTS "student_unit_enrollments_unit_id_academic_year_id_idx"
    ON "student_unit_enrollments" ("unit_id", "academic_year_id");
CREATE INDEX IF NOT EXISTS "student_unit_enrollments_academic_year_id_idx"
    ON "student_unit_enrollments" ("academic_year_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_unit_enrollments_student_id_fkey') THEN
    ALTER TABLE "student_unit_enrollments"
      ADD CONSTRAINT "student_unit_enrollments_student_id_fkey"
      FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_unit_enrollments_unit_id_fkey') THEN
    ALTER TABLE "student_unit_enrollments"
      ADD CONSTRAINT "student_unit_enrollments_unit_id_fkey"
      FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_unit_enrollments_academic_year_id_fkey') THEN
    ALTER TABLE "student_unit_enrollments"
      ADD CONSTRAINT "student_unit_enrollments_academic_year_id_fkey"
      FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- Tanggal keluar tidak boleh mendahului tanggal masuk. Tanpa ini satu salah
  -- ketik menghasilkan periode negatif yang diam-diam menghilangkan santri dari
  -- setiap laporan yang bertanya "siapa yang ada di unit ini pada tanggal X".
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_unit_enrollments_exit_after_entry') THEN
    ALTER TABLE "student_unit_enrollments"
      ADD CONSTRAINT "student_unit_enrollments_exit_after_entry"
      CHECK ("exit_date" IS NULL OR "exit_date" >= "entry_date");
  END IF;

  -- Alasan keluar dibatasi daftar yang dikenal. CHECK, bukan enum Postgres:
  -- menambah nilai ke enum mengunci tabel dan tidak bisa dibatalkan dalam
  -- transaksi yang sama, sementara daftar ini masih akan tumbuh.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_unit_enrollments_exit_reason_check') THEN
    ALTER TABLE "student_unit_enrollments"
      ADD CONSTRAINT "student_unit_enrollments_exit_reason_check"
      CHECK ("exit_reason" IS NULL OR "exit_reason" IN (
        'LULUS', 'PINDAH_UNIT', 'PINDAH_SEKOLAH', 'MENGUNDURKAN_DIRI',
        'DIKELUARKAN', 'MENINGGAL', 'TAHUN_AJARAN_SELESAI'
      ));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Backfill 1: dari pendaftaran kelas, satu-satunya bukti langsung "santri ini
-- ada di unit itu pada tahun ajaran itu" yang dimiliki basis data.
--
-- `entry_date` diambil dari `enrolled_at` HANYA bila tanggal itu masuk akal —
-- yaitu jatuh di dalam rentang tahun ajarannya. Baris seed dan baris hasil
-- impor sering memakai waktu pembuatan baris (hari ini), yang kalau dipercaya
-- akan mencatat santri masuk TK pada 2026 untuk tahun ajaran 2024/2025.
-- Selain itu dipakai tanggal mulai tahun ajarannya.
INSERT INTO "student_unit_enrollments" (
  "id", "student_id", "unit_id", "academic_year_id",
  "entry_date", "exit_date", "exit_reason", "grade_level",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  ce."student_id",
  c."unit_id",
  c."academic_year_id",
  CASE
    WHEN MIN(ce."enrolled_at") BETWEEN ay."start_date" AND ay."end_date"
      THEN MIN(ce."enrolled_at")::date
    ELSE ay."start_date"::date
  END,
  -- Tahun ajaran yang sudah lewat berarti periodenya selesai; yang berjalan
  -- dibiarkan terbuka (NULL = masih berlangsung).
  CASE WHEN ay."end_date" < NOW() THEN ay."end_date"::date ELSE NULL END,
  NULL,
  MIN(c."level"),
  NOW(),
  NOW()
FROM "class_enrollments" ce
JOIN "classes" c        ON c."id" = ce."class_id"
JOIN "academic_years" ay ON ay."id" = c."academic_year_id"
JOIN "students" s        ON s."id" = ce."student_id"
WHERE s."deleted_at" IS NULL
GROUP BY ce."student_id", c."unit_id", c."academic_year_id", ay."start_date", ay."end_date"
ON CONFLICT ("student_id", "unit_id", "academic_year_id") DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Backfill 2: santri yang belum punya satu pun baris riwayat — tidak ada
-- pendaftaran kelas sama sekali. Bukti terbaik yang tersisa adalah unit yang
-- tercatat sekarang, dipasangkan dengan tahun ajaran aktif. Itu tebakan, dan
-- ditandai begitu: tidak ada tanggal keluar, tidak ada tingkat.
INSERT INTO "student_unit_enrollments" (
  "id", "student_id", "unit_id", "academic_year_id",
  "entry_date", "exit_date", "exit_reason", "grade_level",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  s."id",
  s."unit_id",
  ay."id",
  CASE
    WHEN s."entry_year" IS NOT NULL AND s."entry_year" BETWEEN 1900 AND 2200
      THEN GREATEST(make_date(s."entry_year", 7, 1), ay."start_date"::date)
    ELSE ay."start_date"::date
  END,
  NULL,
  NULL,
  NULL,
  NOW(),
  NOW()
FROM "students" s
CROSS JOIN LATERAL (
  SELECT "id", "start_date" FROM "academic_years" WHERE "is_active" = true
  ORDER BY "start_date" DESC LIMIT 1
) ay
WHERE s."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "student_unit_enrollments" e WHERE e."student_id" = s."id"
  )
ON CONFLICT ("student_id", "unit_id", "academic_year_id") DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Alasan keluar, diisi hanya untuk hal yang benar-benar bisa disimpulkan:
--   PINDAH_UNIT  — ada baris berikutnya di unit yang BERBEDA.
--   LULUS        — tidak ada baris berikutnya dan santrinya sudah alumni.
-- Sisanya dibiarkan NULL. Menebak lebih jauh berarti menulis sejarah yang
-- tidak pernah terjadi.
WITH urut AS (
  SELECT
    e."id",
    e."unit_id",
    LEAD(e."unit_id") OVER (PARTITION BY e."student_id" ORDER BY e."entry_date", e."id") AS unit_berikutnya,
    s."status" AS status_santri
  FROM "student_unit_enrollments" e
  JOIN "students" s ON s."id" = e."student_id"
)
UPDATE "student_unit_enrollments" e
SET "exit_reason" = CASE
      WHEN urut.unit_berikutnya IS NOT NULL AND urut.unit_berikutnya <> urut."unit_id" THEN 'PINDAH_UNIT'
      WHEN urut.unit_berikutnya IS NULL AND lower(urut.status_santri) IN ('alumni', 'graduated', 'lulus') THEN 'LULUS'
      ELSE NULL
    END
FROM urut
WHERE urut."id" = e."id"
  AND e."exit_reason" IS NULL
  AND e."exit_date" IS NOT NULL;
