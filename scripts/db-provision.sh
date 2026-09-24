#!/usr/bin/env bash
# Provision the local database: apply migrations ALWAYS, seed only when empty.
#
# Kept separate from `dev-up.sh` so its failure path can be exercised with a
# stubbed `pnpm` (see
# `apps/api/src/modules/foundation-decisions/tests/provisioning-script.test.ts`).
# `set -euo pipefail` means any failed command aborts with a non-zero exit:
# nothing is piped through `tail`, and no exit code is swallowed. `dev-up.sh`
# invokes this under its own `set -e`, so a failure here prevents the API from
# starting.
#
# Migrations are NEVER `prisma db push`: `schema.prisma` cannot express the
# partial unique index `foundation_eseals_single_active_key`, so a `db push`
# database silently lacks the "at most one active e-seal" invariant.
set -euo pipefail

ROOT="${PROVISION_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

DB_NAME="${DB_NAME:-cipansor}"
PSQL="${PSQL:-psql}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"

# Generate the Prisma Client from the CURRENT schema BEFORE anything touches the
# database. `migrate deploy` does NOT regenerate the client, so a checkout whose
# `schema.prisma` gained models (e.g. the foundation-decision tables) would start
# the API against a STALE client: every `prisma.foundationDecision.*` call would
# fail at runtime while the database itself looked correctly migrated. Generation
# is cheap and idempotent, so it runs unconditionally.
#
# Still migration-only: this does NOT introduce `prisma db push`.
echo "Generating Prisma Client..."
pnpm --filter api db:generate

# Apply every pending migration. Idempotent: `migrate deploy` is a no-op when the
# schema is current, which is why it can (and must) run on every startup rather
# than only on a fresh database.
echo "Applying migrations..."
pnpm --filter api db:deploy

# Seed ONLY when the database has NO application data at all — not merely no
# users. `prisma/seed.ts` TRUNCATEs every table, so re-seeding over real data
# destroys it. Checking `users` alone was wrong: a database whose `users` table
# is empty while any other table holds rows (a partial restore, an interrupted
# seed, a wiped admin table) would be re-seeded and every one of those rows
# TRUNCATEd. The probe therefore sums the row count across every application
# table; only a total of zero — an actually fresh database — seeds. An unknown
# count (psql missing, connection error, empty output) skips seeding rather
# than guessing: fail closed.
#
# `query_to_xml` runs one `SELECT count(*)` per table inside the database, so
# the script needs no per-table knowledge and cannot drift from the schema. It
# is scoped to `public` and excludes `_prisma_migrations` so the migration
# ledger itself never counts as application data.
APPTABLES=""
if command -v "$PSQL" >/dev/null 2>&1; then
  APPTABLES="$("$PSQL" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -tAc "SELECT COALESCE(sum((xpath('/row/cnt/text()', query_to_xml(format('SELECT count(*) AS cnt FROM %I.%I', schemaname, tablename), false, true, '')))[1]::text::bigint), 0) FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';" 2>/dev/null | tr -d '[:space:]' || true)"
fi

if [ -z "$APPTABLES" ]; then
  echo "Cannot determine application row count; skipping seed."
elif ! [[ "$APPTABLES" =~ ^[0-9]+$ ]]; then
  # Fail closed: a probe that returns something other than a plain
  # non-negative integer (a wrapped/truncated value, a locale-formatted
  # number, a stray psql notice) is NOT taken as "0 rows". Guessing here would
  # run the destructive seed over real data; skipping only costs a manual seed.
  echo "Application row count is not an integer ('$APPTABLES'); skipping seed."
elif [ "$APPTABLES" -eq 0 ]; then
  echo "Seeding DB (no application data)..."
  # `prisma/seed.ts` TRUNCATEs every table, so it demands an explicit opt-in.
  # This branch only runs when the database has no application rows at all, and
  # this script is local-dev/CI only, so the opt-in is correct here — never in
  # production.
  E2E_FIXED_2FA=1 ALLOW_DESTRUCTIVE_SEED=1 pnpm --filter api db:seed
else
  echo "DB already has $APPTABLES application rows; skipping seed"
fi
