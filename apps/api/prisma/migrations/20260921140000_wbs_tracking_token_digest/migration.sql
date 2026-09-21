-- Store only an HMAC digest of the WBS tracking token, never the bearer value.
--
-- The tracking token is a bearer credential: holding it lets anyone read a
-- confidential report and post as the reporter. It was persisted verbatim, so
-- any read of the database (a backup, a replica, a support query) exposed every
-- anonymous channel. `utils/wbs-token.ts` now writes a keyed digest and the raw
-- value is returned once, at creation.
--
-- LEGACY DATA STRATEGY — INVALIDATION, EXPLICITLY.
--
-- The `wbs_reports` table itself is introduced in this same change set
-- (`20260915160000_wbs_and_board_suspensions`), so no production data exists
-- that predates the digest. A row written by an earlier build of this branch,
-- however, would hold a raw token that can never match a digest, and silently
-- leaving it would look like "token salah" to a reporter whose token was in
-- fact valid. There is no way to recover the digest for those rows: the key is
-- app config, not present at migration time, and hashing here would require
-- shipping the secret into a migration.
--
-- So the strategy is deliberate invalidation: any stored value that is not
-- already a 64-hex digest is replaced with an unusable marker. Reporters with
-- an in-flight pre-digest ticket must be re-issued a ticket through the normal
-- channel; there are none in production, and the alternative — a compatibility
-- branch reading raw tokens forever — reintroduces the exact secret-at-rest
-- exposure this change removes.
UPDATE "wbs_reports"
SET "tracking_token" = 'LEGACY-INVALIDATED'
WHERE "tracking_token" !~ '^[0-9a-f]{64}$';
