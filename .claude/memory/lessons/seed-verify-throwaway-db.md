# seed-verify-throwaway-db

> Prove a seed change by running the whole seed against a disposable Postgres on its own Docker network — the seed TRUNCATEs every table, so never near a real one.

`apps/api/prisma/seed.ts` opens with `TRUNCATE … CASCADE` over almost every
table, and refuses to run without `ALLOW_DESTRUCTIVE_SEED=1`. Never set that
against a database holding anything you want. To prove a seed change actually
runs (nested creates, FKs, `Decimal` — things `tsc` cannot catch):

```
docker network create seednet --internal
docker run -d --name seedpg --network seednet \
  -e POSTGRES_PASSWORD=pw -e POSTGRES_USER=seed -e POSTGRES_DB=seedtest postgres:16-alpine
# wait: docker exec seedpg pg_isready -U seed -d seedtest
docker run --rm --network seednet -v "$PWD":/app -w /app/apps/api \
  -e CI=true -e ALLOW_DESTRUCTIVE_SEED=1 \
  -e DATABASE_URL="postgresql://seed:pw@seedpg:5432/seedtest?schema=public" \
  node:22-alpine sh -c 'node_modules/.bin/prisma migrate deploy --config prisma/prisma.config.ts \
    && node_modules/.bin/tsx prisma/seed.ts'
# check: docker exec seedpg psql -U seed -d seedtest -c "…"
# clean up: docker rm -f -v seedpg; docker network rm seednet
```

(Dependencies must already be installed in the tree; an `--internal` network
has no internet, which is the point.)

**Why the real database is safe from it:** the runtime client reads
`process.env.DATABASE_URL`, and `prisma.config.ts`'s `import 'dotenv/config'`
does not override a variable that is already set — so the `-e DATABASE_URL`
wins over the repo's `.env`. The isolated network means it could not reach
another database even if it tried.

**A running system is changed additively, never by reseeding.** When demo data
on a live database needs a fix, write an idempotent script (every insert
guarded by `NOT EXISTS`), test it on a copy, back up first, and remember that
writing to a real database needs the user's approval.

Table names differ from model names (`@@map`): `user_role_assignments`, not
`user_roles`; `teachers.user_id`, not `"userId"`. A student's class is through
`class_enrollments`; `Student` has no `classId`.

See [migration-history-baselined](./migration-history-baselined.md) and
[branch-switch-stale-artifacts](./branch-switch-stale-artifacts.md).
