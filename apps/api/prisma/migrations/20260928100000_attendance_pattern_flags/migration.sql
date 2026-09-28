-- When a pattern in a santri's attendance was first raised this semester
-- (decided 2026-09-28, decisions/absensi-harian.md), so the wali kelas, the
-- guru BK and a santri mukim's musyrif are told once.
--
-- Additive: one enum and one table. Nothing existing changes.
BEGIN;

CREATE TYPE "AttendancePatternKind" AS ENUM ('ABSENCE', 'LATE');

CREATE TABLE "attendance_pattern_flags" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "kind" "AttendancePatternKind" NOT NULL,
    "semester_start" DATE NOT NULL,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pattern_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_pattern_flags_student_id_kind_semester_start_key" ON "attendance_pattern_flags"("student_id", "kind", "semester_start");

ALTER TABLE "attendance_pattern_flags" ADD CONSTRAINT "attendance_pattern_flags_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
