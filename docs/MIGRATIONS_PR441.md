# Migration & rollback guide — PR #441 (nonprofit integration + upload/auth hardening)

> Subsystem-level rollout order, config flags, health check and per-subsystem
> rollback points live in [`ROLLOUT_ROLLBACK_PR441.md`](ROLLOUT_ROLLBACK_PR441.md).
> This file is the migration-specific detail.

This documents the six migrations shipped by
`feat/nonprofit-tech-optimization-2625167508293250836` and how to deploy and
roll them back. It exists because the PR description originally named three of
the six, so a rollback planned from it would have missed the blob-claim and
reconciliation migrations.

## The six migrations, in dependency order

`prisma migrate deploy` applies them in directory (timestamp) order. Each has a
`down`-less SQL migration, so "rollback" below means a manual compensating
migration, not `migrate down` (Prisma has no `migrate down`).

| # | Migration directory | Adds | Data impact | Safe to leave in place? |
|---|---------------------|------|-------------|-------------------------|
| 1 | `20260915055343_add_identity_providers` | `SSOProvider` enum; `identity_providers` table (+3 indexes, FK → `users.id` ON DELETE CASCADE) | New table only; no existing rows touched | Yes — additive |
| 2 | `20260915060000_users_email_lower_unique` | Normalises `users.email` in place, then `users_email_lower_key` on `lower(trim(email))` | **WRITES to `users.email`** (case/whitespace trim). Aborts pre-flight if two accounts normalise to the same address | No — the index depends on normalised data; see below. **Not auto-reversible** (it rewrites data): restore from the pre-deploy backup. |
| 3 | `20260915070000_blob_claims` | `BlobClaimKind` enum; `blob_claims` table (+ indexes) | New table only | Yes — additive |
| 4 | `20260917000000_blob_claims_discarded_tombstone` | `blob_claims.discarded_at` + index | Nullable column on a new table | Yes — additive |
| 5 | `20260921170000_blob_claim_operation_token_and_reconcile` | `blob_claims.operation_token` (NOT NULL, random default); `BlobReconcileStatus` enum; `reconcile_status`/`reconcile_attempts`/`last_reconcile_at`/`next_reconcile_at` | Backfills a random token per existing claim; new columns on a new table | Yes — additive (the enum and columns) |
| 6 | `20260922120000_blob_claim_reconcile_lease` | `blob_claims.reconcile_lease_owner`, `reconcile_lease_expires_at` | Nullable columns on a new table | Yes — additive |

### Dependency / order

- 3 → 4 → 5 → 6 are a **linear chain** on `blob_claims`: 4 adds a column to the
  table 3 creates, 5 adds `operation_token` + the reconcile columns, 6 adds the
  worker lease. They cannot be reordered.
- 1 is independent (its own table).
- 2 is independent of 3–6 but is the only migration with **destructive-adjacent
  data writes**.
- Roll-forward is the intended path for every one of them. There is no
  down-migration; to undo 1/3/4/5/6, drop the added columns/table or leave them
  (they are additive and unread once the code is reverted).

## Pre-deploy check for migration 2 (REQUIRED)

Migration 2 normalises emails and then creates a UNIQUE index. It is
**deliberately fail-closed**: rather than merge two accounts, it stops with the
colliding addresses and ids. Because `db:deploy` never runs
`db:normalize-emails`, you MUST run the pre-check before `migrate deploy`:

```bash
# 0. BACK UP FIRST. Migration 2 rewrites data in place and is NOT safe to undo
#    by hand — a botched rollback restores from this dump, not from SQL.
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql

# 1. Detect collisions and normalise rows the app can see either way.
#    Safe to run repeatedly; --dry-run only reports (exit non-zero on collision).
pnpm --filter api db:normalize-emails --dry-run   # report
#  → for EACH colliding pair: merge the two accounts (move references onto the
#    one you keep) or change one address. The script NEVER merges for you.
pnpm --filter api db:normalize-emails             # normalise (no account merge)
#  → repeat the dry-run until it is clean:
pnpm --filter api db:normalize-emails --dry-run

# 2. Only when the pre-check reports no collisions:
pnpm --filter api db:deploy
```

- The script reports collisions with `lower(trim(email))` — the exact key the
  migration's index uses — then exits non-zero **without changing anything**.
- It never merges accounts. Resolving a collision is a human decision: rename or
  merge the duplicate accounts, then re-run.
- The migration itself repeats the collision check inside a `DO $$ … $$` block
  before its `UPDATE`, so a missed pre-check fails with an actionable message
  (addresses + account ids) instead of a raw `unique_violation` after the write.

## Rollback procedure

Rollback here means: **revert the application code, then leave the additive
schema in place** — which is safe for 1 and 3–6. Only migration 2 needs a
decision because it changed data.

1. **Confirm the migration ledger exists.** `migrate deploy` requires an
   `_prisma_migrations` table (production historically had none — see
   `apps/api/prisma/AGENTS.md`).
   ```bash
   psql "$DATABASE_URL" -c '\dt _prisma_migrations'
   ```
2. **Revert the code** to the pre-PR revision and rebuild `@cipansor/shared`
   (its `auth`/`hr`/`upload` contracts changed — a coordinated API+web deploy is
   required, not just an API rollback).
3. **Leave the additive schema.** Dropping `identity_providers`, `blob_claims`,
   `discarded_at`, the reconcile columns or the lease columns is unnecessary
   once no code reads them, and dropping a table destroys the claim/audit trail
   you would want after an incident. `blob_claims.discarded_at` in particular is
   documented as safe to leave in place.
4. **Migration 2 only:** it is the ONE migration that is **not safe to roll back
   automatically** — its `UPDATE` rewrites `users.email` in place, and there is
   no SQL that can restore the exact original mixed-case/whitespace spellings.
   The compensating move for a genuine need to revert it is to **restore the
   pre-deploy `pg_dump` backup** (step 0 of the pre-deploy check). Do not try to
   hand-reverse it.
   - If you are only reverting to the pre-PR code and not undoing the migration,
     the `lower(trim(email))` index and the normalised emails are harmless to
     keep as long as the reverted code reads `email` case-insensitively.
   - If it does not, keep the index anyway (it only forbids two accounts that
     differ solely by case, which was already a login bug) and do **not** restore
     the mixed-case rows — that would reintroduce the SSO account-not-found
     defect.
   - Because the data was rewritten, do **not** mark this migration
     `migrate resolve --rolled-back` unless you actually restored the backup and
     dropped the index; otherwise a later `migrate deploy` would try to replay
     the normalisation against already-normalised data (which is idempotent) but
     the ledger would lie about what happened.
5. **`migrate resolve --rolled-back <name>`** is only for the additive
   migrations whose DDL you manually dropped (1, 3–6). Drop the added
   columns/table, then resolve, so a later deploy can replay them. Otherwise
   `migrate deploy` is idempotent and will report the six as already applied.

## What must be validated on deployment

- Migrations 3–6 replay from **empty** (the `0_init` squash exists so they do;
  migration 5 intentionally uses `gen_random_uuid()` rather than pgcrypto's
  `gen_random_bytes`, which no migration creates).
- The email pre-check against the real production `users` table before applying
  migration 2.
- `_prisma_migrations` exists before `migrate deploy`.
