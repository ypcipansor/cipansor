-- Forced password change (decided 2026-09-28, decisions/autentikasi-2fa-dan-sandi.md).
--
-- Additive. Existing accounts start WITHOUT the flag: the release that brings
-- the password rules flags every account once, by a script run at that
-- release (apps/api/scripts/require-password-change-all.ts), not here — a
-- migration also runs on staging, whose shared demo accounts must keep their
-- published password. New rows get the flag by default, so any path that
-- creates an account for someone else is covered without remembering to.
--
-- `password_needs_second_factor` records that the current password is shorter
-- than the single-factor minimum; turning 2FA off then requires a new one.
-- Unknown for existing rows, hence false; the release-wide change sets it.
BEGIN;

ALTER TABLE "users"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "password_needs_second_factor" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users" ALTER COLUMN "must_change_password" SET DEFAULT true;

COMMIT;
