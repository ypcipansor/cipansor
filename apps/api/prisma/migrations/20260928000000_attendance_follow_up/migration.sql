-- How an unexplained absence was followed up (decided 2026-09-27,
-- decisions/absensi-harian.md): the wali kelas of a day pupil, or the musyrif
-- of a santri mukim, contacts the wali and records what came of it.
--
-- Additive: two enums and one table. Nothing existing changes.
BEGIN;

CREATE TYPE "AttendanceFollowUpChannel" AS ENUM ('PHONE', 'WHATSAPP', 'IN_PERSON', 'OTHER');

CREATE TYPE "AttendanceFollowUpOutcome" AS ENUM ('ILL', 'EXCUSED', 'NO_REASON', 'UNREACHABLE');

CREATE TABLE "attendance_follow_ups" (
    "id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "contacted_by_id" TEXT NOT NULL,
    "channel" "AttendanceFollowUpChannel" NOT NULL,
    "outcome" "AttendanceFollowUpOutcome" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_follow_ups_attendance_id_idx" ON "attendance_follow_ups"("attendance_id");

CREATE INDEX "attendance_follow_ups_contacted_by_id_idx" ON "attendance_follow_ups"("contacted_by_id");

ALTER TABLE "attendance_follow_ups" ADD CONSTRAINT "attendance_follow_ups_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_follow_ups" ADD CONSTRAINT "attendance_follow_ups_contacted_by_id_fkey" FOREIGN KEY ("contacted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
