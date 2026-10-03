-- Announcements become the one way to broadcast (decisions/siaran-pengumuman.md):
-- who they reach is a scope — the yayasan, one unit, the sender's classes, or a
-- musyrif's santri mukim — and they can be withdrawn. Existing rows keep their
-- reach: a unit's stays UNIT, one with no unit was meant for every unit.
BEGIN;

CREATE TYPE "AnnouncementScope" AS ENUM ('YAYASAN', 'UNIT', 'CLASSES', 'BOARDERS');

ALTER TABLE "announcements"
  ADD COLUMN "scope" "AnnouncementScope" NOT NULL DEFAULT 'UNIT',
  ADD COLUMN "class_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "student_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "withdrawn_at" TIMESTAMP(3),
  ADD COLUMN "withdrawn_by_id" TEXT;

UPDATE "announcements" SET "scope" = 'YAYASAN' WHERE "unit_id" IS NULL;

COMMIT;

-- A bell row that delivers an announcement points at it: revising the
-- announcement rewrites the row, withdrawing it removes the row. Nullable and
-- without a default, so adding it rewrites nothing.
BEGIN;

ALTER TABLE "notifications" ADD COLUMN "announcement_id" TEXT;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_announcement_id_fkey"
  FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "notifications_announcement_id_idx" ON "notifications"("announcement_id");

COMMIT;
