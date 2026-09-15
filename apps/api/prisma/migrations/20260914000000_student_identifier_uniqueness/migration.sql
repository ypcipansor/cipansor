-- NISN dan NIK santri: bentuk yang sah dan satu nomor untuk satu anak.
--
-- Diukur di produksi 2026-09-14 (14 santri):
--
--   nisn terisi 14 — 12 berbentuk 10 digit, 2 berbentuk 8 karakter berhuruf
--                    ('0134SDB1', '0134SMB1': seed.ts memotong NIS jadi NISN)
--   nik  terisi 0
--   duplikat NISN 0, duplikat NIK 0
--
-- Sebelum ini kolomnya TEXT tanpa aturan apa pun: tidak unik, tidak dibatasi
-- bentuknya, dan `PUT /student-compliance/:id` menulis isi body mentah-mentah.
-- NISN adalah kode nasional 10 digit yang berlaku SATU untuk satu peserta didik
-- seumur hidup (Pusdatin); NIK 16 digit (Dukcapil). Dua anak dengan NISN yang
-- sama berarti salah satunya tidak akan ditemukan di Dapodik/EMIS.
--
-- Urutan: (1) tabel audit, (2) rapikan spasi & string kosong, (3) nilai yang
-- bentuknya salah dan (4) nilai kembar dipindah ke tabel audit lalu
-- dikosongkan, (5) CHECK bentuk, (6) indeks unik. Tidak ada nilai yang hilang
-- tanpa jejak: setiap pengosongan tercatat beserta alasannya, dan untuk kembar
-- dicatat santri mana yang mempertahankannya.
--
-- Hanya MENAMBAH aturan; tidak ada kolom yang dihapus atau diganti nama, jadi
-- image `:rollback` tetap bisa membaca tabel ini (lihat audit PR #489 — B3).
-- Aman dijalankan ulang.

-- (1) Jejak setiap pengenal yang dikosongkan migrasi ini.
CREATE TABLE IF NOT EXISTS "legacy_identifier_audit" (
    "id"              TEXT NOT NULL,
    "student_id"      TEXT NOT NULL,
    "field"           TEXT NOT NULL,
    "value"           TEXT NOT NULL,
    "reason"          TEXT NOT NULL,
    "kept_student_id" TEXT,
    "recorded_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_identifier_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "legacy_identifier_audit_student_id_idx"
    ON "legacy_identifier_audit" ("student_id");

-- (2) Spasi di tepi bukan bagian dari nomor; string kosong berarti "belum ada".
UPDATE "students" SET "nisn" = NULLIF(btrim("nisn"), '')
 WHERE "nisn" IS NOT NULL AND "nisn" IS DISTINCT FROM NULLIF(btrim("nisn"), '');
UPDATE "students" SET "nik" = NULLIF(btrim("nik"), '')
 WHERE "nik" IS NOT NULL AND "nik" IS DISTINCT FROM NULLIF(btrim("nik"), '');

-- (3) Bentuk salah. Nilai seperti ini bukan NISN/NIK siapa pun; menyimpannya
-- di kolom hanya membuat laporan kesiapan Dapodik menghitungnya sebagai terisi.
INSERT INTO "legacy_identifier_audit" ("id", "student_id", "field", "value", "reason")
SELECT gen_random_uuid()::text, "id", 'nisn', "nisn", 'format'
  FROM "students" WHERE "nisn" IS NOT NULL AND "nisn" !~ '^[0-9]{10}$';
UPDATE "students" SET "nisn" = NULL
 WHERE "nisn" IS NOT NULL AND "nisn" !~ '^[0-9]{10}$';

INSERT INTO "legacy_identifier_audit" ("id", "student_id", "field", "value", "reason")
SELECT gen_random_uuid()::text, "id", 'nik', "nik", 'format'
  FROM "students" WHERE "nik" IS NOT NULL AND "nik" !~ '^[0-9]{16}$';
UPDATE "students" SET "nik" = NULL
 WHERE "nik" IS NOT NULL AND "nik" !~ '^[0-9]{16}$';

-- (4) Kembar. Yang dipertahankan: santri yang belum dihapus, lalu yang paling
-- dulu tercatat. Itu tebakan terbaik, bukan kebenaran — karena itu keduanya
-- dicatat dan petugas yang memutuskan lewat Kelengkapan Data.
WITH peringkat AS (
  SELECT "id", "nisn",
         first_value("id") OVER w AS "kept",
         row_number()      OVER w AS "urutan"
    FROM "students"
   WHERE "nisn" IS NOT NULL
  WINDOW w AS (PARTITION BY "nisn" ORDER BY ("deleted_at" IS NOT NULL), "created_at", "id")
)
INSERT INTO "legacy_identifier_audit" ("id", "student_id", "field", "value", "reason", "kept_student_id")
SELECT gen_random_uuid()::text, "id", 'nisn', "nisn", 'duplicate', "kept"
  FROM peringkat WHERE "urutan" > 1;

WITH peringkat AS (
  SELECT "id", "nik",
         first_value("id") OVER w AS "kept",
         row_number()      OVER w AS "urutan"
    FROM "students"
   WHERE "nik" IS NOT NULL
  WINDOW w AS (PARTITION BY "nik" ORDER BY ("deleted_at" IS NOT NULL), "created_at", "id")
)
INSERT INTO "legacy_identifier_audit" ("id", "student_id", "field", "value", "reason", "kept_student_id")
SELECT gen_random_uuid()::text, "id", 'nik', "nik", 'duplicate', "kept"
  FROM peringkat WHERE "urutan" > 1;

UPDATE "students" s SET "nisn" = NULL
  FROM "legacy_identifier_audit" a
 WHERE a."student_id" = s."id" AND a."field" = 'nisn' AND a."reason" = 'duplicate'
   AND s."nisn" = a."value";
UPDATE "students" s SET "nik" = NULL
  FROM "legacy_identifier_audit" a
 WHERE a."student_id" = s."id" AND a."field" = 'nik' AND a."reason" = 'duplicate'
   AND s."nik" = a."value";

-- (5) Bentuk dijaga basis data, bukan hanya skema zod: ada lebih dari satu
-- penulis (formulir santri, onboarding SPMB, kelengkapan data, seed, impor).
-- Polanya harus sama dengan NISN_PATTERN/NIK_PATTERN di
-- packages/shared/src/schemas/student-compliance.ts — diuji di
-- apps/api/src/modules/students/tests/student-identifiers.test.ts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_nisn_format_check' AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE "students"
      ADD CONSTRAINT "students_nisn_format_check" CHECK ("nisn" ~ '^[0-9]{10}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_nik_format_check' AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE "students"
      ADD CONSTRAINT "students_nik_format_check" CHECK ("nik" ~ '^[0-9]{16}$');
  END IF;
END $$;

-- (6) Satu nomor, satu santri. NULL tidak dihitung kembar oleh Postgres, jadi
-- santri yang belum punya NISN tetap bisa banyak. Nama indeks = nama bawaan
-- Prisma untuk `@unique`.
CREATE UNIQUE INDEX IF NOT EXISTS "students_nisn_key" ON "students" ("nisn");
CREATE UNIQUE INDEX IF NOT EXISTS "students_nik_key" ON "students" ("nik");
