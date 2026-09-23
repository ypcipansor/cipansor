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

# Seed ONLY when the database has no users — `prisma/seed.ts` TRUNCATEs every
# table, so re-seeding over real data destroys it. An unknown user count skips
# seeding rather than guessing.
USERS=""
if command -v "$PSQL" >/dev/null 2>&1; then
  USERS="$("$PSQL" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -tc 'SELECT count(*) FROM users;' 2>/dev/null | tr -d '[:space:]' || true)"
fi

if [ -z "$USERS" ]; then
  echo "Cannot determine user count; skipping seed."
elif [ "$USERS" -eq 0 ] 2>/dev/null; then
  echo "Seeding DB..."
  E2E_FIXED_2FA=1 pnpm --filter api db:seed
else
  echo "DB already has $USERS users"
fi
