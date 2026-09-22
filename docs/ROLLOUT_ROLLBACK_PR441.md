# Rollout & rollback matrix — PR #441

Operational companion to [`MIGRATIONS_PR441.md`](MIGRATIONS_PR441.md). Finding B3
on the PR asked whether the ~210-file change can be split into independently
deployable PRs, and — if not — for an executable rollout/rollback matrix per
subsystem. This is that matrix.

## Can the PR be split? No — and why

Splitting is **not safe at this stage**, for two structural reasons rather than
convenience:

1. **The migrations are already written and, in one case, destructive.** The six
   migrations in `apps/api/prisma/migrations/` are timestamped and would replay
   in filename order regardless of how the code is split. Migration #2
   (`20260915060000_users_email_lower_unique`) rewrites `users.email` in place
   and is not auto-reversible (see the migrations guide). Re-sequencing or
   cherry-picking commits now would not un-write that migration in any
   environment that has already run it, so a "split" would be a fiction on
   `main` and a hazard on deploy.
2. **The web and API halves of the session fix must land together.** The security
   fix replaces the client-writable `auth-storage` page guard with a
   server-signed `cipansor-session` cookie (see `docs/ARCHITECTURE.md` and
   `apps/web/src/lib/session.ts`). Splitting the web commit from the API commit
   ships the old vulnerable guard against an API that no longer issues the old
   cookie — the exact regression the fix closes. They are one unit.

What _is_ separable, if a future PR wants a smaller change, is the **contract**
work (`packages/shared`) from the **behavior** work, but only together with a
coordinated shared rebuild (below). It is not separable from the security fix.

Disposition: **accepted operational risk**, mitigated by the matrix below. The
mitigation is executable, not a note saying "scope documented".

## Subsystems and their deploy order

Deploy in this order. Nothing earlier waits on anything later.

| #   | Subsystem           | Artifact                       | Depends on                                |
| --- | ------------------- | ------------------------------ | ----------------------------------------- |
| 1   | `@cipansor/shared`  | `packages/shared/dist` (built) | —                                         |
| 2   | Database migrations | `apps/api/prisma/migrations/*` | DB reachable, backup taken (migration #2) |
| 3   | API                 | `apps/api` image               | 1 (types), 2 (columns/tables exist)       |
| 4   | Web                 | `apps/web` image               | 1, 3 (API must mint the session cookie)   |

Migrations #1, #3, #4, #5, #6 are additive and may run with the _old_ API still
serving (the old code neither reads nor writes those tables/columns needing a
schema change). Migration #2 must be pre-checked and pre-normalized before
`migrate deploy` — see the migrations guide. This is what makes a rolling
deploy safe: the new columns exist before any new code reads them.

## Feature & config flags that gate the risky surfaces

Set these before the new images start; an unset value degrades to _safe_ where
noted.

| Flag                                                        | Where                                           | Effect if wrong                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET` (fallback `JWT_SECRET`)                    | web container, `docker-compose.yml` web service | **Fails closed** — no `cipansor-session` cookie, every authenticated page bounces to `/login`. Safe but total; set one of the two. The routing payload is only a routing signal; authorization still re-checks the bearer per call.                  |
| `MICROSOFT_TENANT_ID`                                       | api container                                   | `common`/empty under `NODE_ENV=production` logs a startup warning (`warnOnLooseMicrosoftTenant`). Single-tenant resolution is per-login and cached; a transient discovery failure is cached only for `TENANT_FAILURE_TTL_MS` (60s), not permanently. |
| `MICROSOFT_ALLOW_MULTI_TENANT`                              | api container                                   | Must be enumerated in compose or it never reaches the container and multi-tenant fails closed at login.                                                                                                                                              |
| `AZURE_STORAGE_CONNECTION_STRING` / `AZURE_STORAGE_ACCOUNT` | api container                                   | Missing credentials are **not** a success in reconciliation — rows reschedule as `unavailable`, never stamped `DONE`. Local-disk storage is the fallback.                                                                                            |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS`          | api container                                   | Governs both `defaultLimiter` and `uploadsReadLimiter`. `RATE_LIMIT_UPLOAD_*` governs `uploadLimiter` on `POST /upload` only.                                                                                                                        |
| `NODE_ENV`                                                  | api container                                   | `test`/`development` skip the read and default limiters by design. Production must be `production`.                                                                                                                                                  |

## Rolling-deployment compatibility

- **Web ↔ API:** the new web image must not be rolled out before the new API
  image, because `POST /api/session` confirms the bearer against the API's
  `/auth/me`. An old API still answers it, but the **session cookie** is minted
  by the _web_ image, so the pairing that matters is web-new + API-new. During
  the window where web is new and API is old, logins mint a routing cookie only
  when `/auth/me` confirms — which the old API already does. No hard cutover.
- **Token refresh re-mints the routing cookie.** After a 401-driven
  `refreshAccessToken()` the web calls `POST /api/session` again with the
  rotated bearer, so a role change surfaced by the refresh is reflected in
  routing immediately. The remint goes through native `fetch`, not the Axios
  instance, so it cannot recurse into `refreshAccessToken()`. If the remint
  fails (non-2xx, `session:false`, network), the client **fails closed**: it
  clears the session and sends the user to `/login`, rather than let a new
  bearer run beside a stale routing identity. A rollback to a pre-PR web image
  loses this (it kept the old cookie); the API is unaffected.
- **API replicas:** the blob reconciliation worker takes a per-row lease
  (`reconcile_lease_owner` / `reconcile_lease_expires_at`) via a single
  conditional UPDATE, so more than one replica running the scheduler is safe.
  The lease is **not** renewed and expires in `BLOB_DISCARD_LEASE_MS` (5 min)
  inside the hourly schedule, so a crashed replica's rows return next run.
  Rolling the API back to code without the lease columns is safe (the columns
  are nullable and ignored), but rolling back to code that predates the
  `operation_token`/`discarded_at` protocol while tombstones exist is not
  supported — see the rollback point below.
- **Shared package:** both apps alias `@cipansor/shared` to `src` in tests but
  consume `dist` at build. A contract change therefore requires
  `pnpm --filter @cipansor/shared build` **and** a coordinated API+web deploy;
  deploying only one side against a changed DTO is the failure mode.

## Health check & rollback point

- **Health check:** `GET /health` (mounted in `apps/api/src/app.ts:209`, and
  `GET /api/health` via the router). It is exempt from every limiter. Treat a
  non-200 as "stop the rollout" before rolling the web image, so a broken API is
  never paired with the new session guard.
- **Pre-deploy rollback point:** the `pg_dump` taken before migration #2 (see
  the migrations guide). This is the only restore that recovers the pre-PR
  `users.email` values; every other subsystem rolls forward or rolls back
  independently.
- **Rollback order:** web first (restores the old guard — see below), then API,
  then leave the additive migrations in place. Do **not** drop the blob-claim
  tables on rollback while tombstones exist.

## Per-subsystem rollback

| Subsystem             | Roll-forward (preferred) | Rollback                                                                                                                                                                                                                                            |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations 1,3,4,5,6  | Leave in place           | Drop the added table/columns, then `npx prisma migrate resolve --rolled-back <name>` so it can replay. Safe to leave; old code ignores them.                                                                                                        |
| Migration 2           | Leave in place           | **Not reversible in code.** Restore from the pre-deploy backup, or accept the normalized rows (they are strictly more correct). Do not drop the unique index to "undo" it.                                                                          |
| API                   | Roll forward             | Redeploy the previous image. Additive columns are ignored by old code. Blob reconciliation stops (its scheduler registration is new); tombstones remain and resume when the new image returns.                                                      |
| Web                   | Roll forward             | Redeploying a pre-session-cookie image restores the **old, vulnerable `auth-storage` guard**. Coordinate with the API so the security fix is not silently lost; a web rollback is a deliberate, temporary risk acceptance, not a neutral operation. |
| Session cookie        | Leave in place           | `DELETE /api/session` (or `{clear:true}`) clears it; the cookie is `HttpOnly`, so no client code can forge or clear it without the server.                                                                                                          |
| SSO                   | Roll forward             | The SSO routes are additive (`identity_providers` is a new table). Reverting the API image removes SSO login while leaving local login untouched.                                                                                                   |
| Azure / local storage | Roll forward             | A missing `AZURE_STORAGE_*` falls back to local disk; reconciliation reschedules instead of deleting. No data loss on rollback.                                                                                                                     |
| Blob reconciliation   | Leave running            | Stopping the worker is safe — it only retries deletes of already-discarded blobs. Never release a tombstone by hand: the remote delete may have applied, and a release lets a create re-claim a dead URL.                                           |

## Operator checklist (copy-paste)

```bash
# 0. Backup — REQUIRED before migration #2
cd apps/api && pg_dump -U postgres cipansor > backup_$(date +%Y%m%d_%H%M%S).sql

# 1. E-mail pre-check (fails closed on collisions; never auto-merges)
pnpm --filter api db:normalize-emails --dry-run   # report only, no writes
#    resolve each colliding pair by hand, then re-run until clean
pnpm --filter api db:normalize-emails
npx prisma migrate deploy

# 2. Build shared before either app
pnpm --filter @cipansor/shared build

# 3. API first, then web (web mints the session cookie)
docker compose up -d --build api
curl -fsS "$API/health" || { echo "API unhealthy — stop"; exit 1; }
docker compose up -d --build web
```

See `docs/DEPLOYMENT.md` and `docs/AZURE_DEPLOYMENT.md` for the host-specific
variants of the same sequence.
