---
name: stack
description: Bring up the Cipansor local stack (PostgreSQL + seeded database + API on :3001 + web on :3000) so e2e tests and the per-role screenshot sweep can run. Use when asked to "start the stack", "run the app locally", or before running e2e / screenshot-roles.
---

# Local stack

## Preferred: Docker

If a Docker daemon is available, `docker-compose.yml` defines `db`, `api`, and
`web`. Bring up the database, apply the schema, seed, then run the apps:

```bash
docker compose up -d db
pnpm --filter api db:generate
pnpm --filter api db:deploy
pnpm --filter api db:seed
pnpm --filter api dev &   # API on :3001
pnpm --filter web dev &   # web on :3000
```

## Fallback: no Docker daemon (managed/remote sessions)

Install and run PostgreSQL directly, then point the API at it. This is the path
that works in the web/remote sandboxes where the Docker socket is absent.

```bash
apt-get install -y postgresql-16        # if not already present
pg_ctlcluster 16 main start
su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""
su postgres -c "createdb cipansor"

# apps/api/.env (gitignored) — password must be IN the URL; Prisma ignores PGPASSWORD:
#   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/cipansor?schema=public"
pnpm --filter api db:generate
pnpm --filter api db:deploy              # MIGRATIONS, not `db:push` — see below
pnpm --filter api db:seed                # creates the 75 DEMO_ACCOUNTS, one per RoleCode

# Build once, then run the built output (more stable than dev under a browser sweep):
pnpm --filter @cipansor/shared build
pnpm --filter api build && pnpm --filter web build
DEMO_MODE=true node apps/api/dist/main.js &         # :3001
( cd apps/web && node_modules/.bin/next start -p 3000 ) &
```

## Provision with migrations, never `db:push`

Apply the schema with `pnpm --filter api db:deploy`, not `pnpm --filter api
db:push`. `db:push` syncs the database to `schema.prisma`, and `schema.prisma`
cannot express a partial unique index — including
`foundation_eseals_single_active_key … WHERE revoked_at IS NULL`, which
enforces "at most one active e-seal". A `db:push` database therefore behaves
differently from CI and production: the DB-backed test that should catch a seal
concurrency regression passes locally and fails in production. CI already uses
`db:deploy`; `apps/api/src/modules/foundation-decisions/tests/ci-provisioning.test.ts`
guards the workflows and this skill against drifting back.

An existing local database created with `db:push` has no `_prisma_migrations`
table and cannot be `migrate deploy`-ed. Drop and recreate it.

## Gotchas

- **`DEMO_MODE=true`** on the API is what lets the seeded admin demo accounts log
  in with a password only. Without it, admin roles are forced through mandatory
  2FA *setup* and never return a session — the screenshot sweep can't log them in.
- Demo credentials: every account is `<...>@cipansor.or.id` / `Cipansor123!`
  (see `packages/shared/src/types/demo-accounts.ts`). The local part carries the
  realm — `yayasan.ketua@`, `smpit.guru@` — since the old `@demo.` domain is gone.
  Do not invent `qa-*` accounts.
- Redis is optional; the API logs a connection error and runs degraded without it.
- Health check: `curl -sf http://localhost:3001/health` and `http://localhost:3000/login`.
