-- Web Push delivery and notification preferences that are actually stored.
--
-- 1. `notifications.push_state` turns the notification table into the push
--    outbox. Every producer (twenty-odd modules and jobs) already writes a row
--    here; the dispatcher claims PENDING rows, so no producer has to know push
--    exists. Existing rows stay NULL — they predate push and are never sent,
--    which also keeps this ALTER metadata-only (no table rewrite): the column is
--    added without a default and the default is set afterwards.
-- 2. `notification_preferences` stores what the settings page only pretended
--    to save until now. One row per user; missing row = defaults.
BEGIN;

CREATE TYPE "PushDispatchState" AS ENUM ('PENDING', 'SENDING', 'SENT', 'SKIPPED', 'FAILED');
CREATE TYPE "ReminderFrequency" AS ENUM ('DAILY', 'WEEKLY', 'NONE');

ALTER TABLE "notifications" ADD COLUMN "push_state" "PushDispatchState";
ALTER TABLE "notifications" ALTER COLUMN "push_state" SET DEFAULT 'PENDING';
CREATE INDEX "notifications_push_state_idx" ON "notifications"("push_state");

CREATE TABLE "notification_preferences" (
    "user_id" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "payment_reminders" BOOLEAN NOT NULL DEFAULT true,
    "attendance_alerts" BOOLEAN NOT NULL DEFAULT true,
    "academic_updates" BOOLEAN NOT NULL DEFAULT true,
    "tahfidz_progress" BOOLEAN NOT NULL DEFAULT true,
    "announcements" BOOLEAN NOT NULL DEFAULT true,
    "event_reminders" BOOLEAN NOT NULL DEFAULT true,
    "monthly_reports" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" VARCHAR(5),
    "quiet_hours_end" VARCHAR(5),
    "reminder_frequency" "ReminderFrequency" NOT NULL DEFAULT 'DAILY',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id"),
    -- Wall-clock "HH:MM", both set or both empty: the shape the service and the
    -- settings page agree on, held by the database too.
    CONSTRAINT "notification_preferences_quiet_hours_check" CHECK (
        ("quiet_hours_start" IS NULL AND "quiet_hours_end" IS NULL)
        OR ("quiet_hours_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            AND "quiet_hours_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            AND "quiet_hours_start" <> "quiet_hours_end")
    )
);

ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
