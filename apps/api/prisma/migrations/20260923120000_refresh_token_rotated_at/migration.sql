-- Remember a rotated refresh token for a short race window instead of deleting it.
--
-- Two browser tabs share one `HttpOnly` refresh cookie and refresh at the same
-- moment. The winner consumes the row and sets a fresh pair; the loser must be
-- told to retry with the now-current cookie, not to log out. The loser can reach
-- its lookup *after* the winner has already committed, so the two cannot be told
-- apart by interleaving — the distinction has to be durable.
--
-- `rotated_at` is that marker. A consumed row keeps its stamped timestamp and
-- `AuthService.refreshToken` treats a presentation within the window as
-- `REFRESH_RACE` (409, no cookie deletion), while a presentation past the window
-- is a spent token and fails closed. Tombstones are pruned by the rotating
-- transaction once the window lapses, so the table does not grow one row per
-- rotation.
--
-- Additive and nullable: existing rows (none consumed-and-retained) read as
-- "never rotated", which is exactly the previous behaviour.
ALTER TABLE "refresh_tokens" ADD COLUMN "rotated_at" TIMESTAMP(3);

-- The prune and the race lookup both filter on this column.
CREATE INDEX "refresh_tokens_rotated_at_idx" ON "refresh_tokens" ("rotated_at");
