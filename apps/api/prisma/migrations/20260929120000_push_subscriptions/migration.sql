-- Browser Web Push subscriptions (one row per device/browser).
--
-- The API already wrote FCM tokens into `users.fcm_token` (one per person, for
-- a native Android build). Browser Web Push is a different transport with a
-- different key shape — endpoint + p256dh + auth — and a person can have the
-- portal installed on several devices at once, so it needs its own table rather
-- than another column.
--
-- Additive: one table, no data moved. The server-side sender that consumes
-- these rows needs VAPID credentials and is not in this repo yet; the client can
-- register and unregister subscriptions as soon as the table exists.
BEGIN;

CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

ALTER TABLE "push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
