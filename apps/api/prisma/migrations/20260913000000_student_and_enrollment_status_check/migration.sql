-- Status santri dan status pendaftaran kelas: jadikan kosakatanya aturan basis
-- data, supaya ejaan yang salah GAGAL alih-alih diam.
--
-- Diukur di produksi 2026-09-13:
--
--   students.status             = 'active' (14 baris)
--   class_enrollments.status    = 'active' (11 baris)
--   takhosus_enrollments.status = 'ACTIVE' (1 baris)   ← enum Prisma, benar
--   extracurricular_…status     = 'ACTIVE' (3 baris)   ← enum Prisma, benar
--
-- Kedua kolom pertama bertipe TEXT bebas, dan 45 tempat di API menyaring atau
-- menulis 'ACTIVE' huruf besar. Postgres peka huruf, jadi semuanya nol — tanpa
-- galat, tanpa peringatan, tanpa satu baris log. `activeStudents` 0 padahal
-- `totalStudents` 14; `attendanceRate` selalu 0 karena ia membagi dengan angka
-- itu; ekspor EMIS ke Kemenag kosong. Dan yang terburuk bukan bacaan:
-- `analytics/bulk.service.ts` MENULIS 'ACTIVE' pada impor massal, sehingga
-- setiap santri hasil impor tak terlihat oleh 62 penyaring yang benar.
--
-- Kedua tabel yang ber-enum Prisma justru huruf besar dan BENAR. Itu bukan
-- kebetulan — itu sebabnya: enum membuat ejaan salah gagal dikompilasi. Dua
-- kolom TEXT ini tidak punya penjaga apa pun, jadi CHECK ini penjaganya.
--
-- Mengapa CHECK dan bukan enum Postgres: kosakata ini masih bisa bertambah
-- (mis. 'mutasi_masuk'), dan menambah nilai pada CHECK adalah satu ALTER
-- sementara pada enum ia ALTER TYPE yang tidak bisa dibatalkan di dalam
-- transaksi. Konvensi yang sama dipakai `exam_security_logs.type`.
--
-- Daftar nilainya harus SAMA dengan `packages/shared/src/types/student-status.ts`
-- (STUDENT_STATUS dan CLASS_ENROLLMENT_STATUS). Penjaganya ada di
-- `apps/api/src/utils/student-status.test.ts`, yang membaca berkas ini.
--
-- Aman dijalankan berulang, dan aman atas data yang ada: kedua tabel hanya
-- berisi 'active', yang ada di dalam kedua daftar.

DO $$
BEGIN
  -- students.status — 'active' | 'alumni' | 'dropped' | 'transferred'
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_status_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE "students"
      ADD CONSTRAINT "students_status_check"
      CHECK ("status" IN ('active', 'alumni', 'dropped', 'transferred'));
  END IF;

  -- class_enrollments.status — 'active' | 'completed' | 'transferred' | 'dropped'
  -- Kosakatanya BEDA dari status santri: 'completed' ada di sini, 'alumni'
  -- tidak. Keduanya tidak boleh dipertukarkan meski nilai 'active'-nya sama.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_enrollments_status_check'
      AND conrelid = 'public.class_enrollments'::regclass
  ) THEN
    ALTER TABLE "class_enrollments"
      ADD CONSTRAINT "class_enrollments_status_check"
      CHECK ("status" IN ('active', 'completed', 'transferred', 'dropped'));
  END IF;
END $$;
