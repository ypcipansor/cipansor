#!/bin/sh
# Container entrypoint for the API image.
#
# MIGRATE_ON_START=true applies pending Prisma migrations before the API starts.
# It exists for Azure, where the database is on a private network that CI cannot
# reach, so migrations run from inside the container instead. `migrate deploy`
# only applies committed migration files, never generates or resets anything,
# and takes an advisory lock, so a second starting container waits rather than
# racing. If it fails the container exits here and the API never starts against a
# half-migrated schema.
#
# Unset (docker compose on the VM) it is skipped, and releases keep running
# migrations by hand as the deploy runbook describes.
set -e

if [ "${MIGRATE_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] MIGRATE_ON_START=true: prisma migrate deploy"
  # CHECKPOINT_DISABLE: no usage ping or update check to prisma.io on each start.
  CHECKPOINT_DISABLE=1 node_modules/.bin/prisma migrate deploy --config prisma/prisma.config.ts
fi

exec node dist/main.js
