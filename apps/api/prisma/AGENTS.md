# AGENTS.md — apps/api/prisma

Prisma 7 schema, migrations, and seeds. Read the root `AGENTS.md` first.

## ⚠️ Never clobber `schema.prisma`

`schema.prisma` defines **237 models and 133 enums** (~300 KB). It was once
accidentally truncated to a ~500-byte stub in a "comprehensive enhancement"
commit, which silently broke the entire backend (an empty Prisma client makes
every `prisma.*` call fail) and only "passed" because CI tolerated build
failures. **Edit it surgically. Never regenerate/replace it wholesale.** If you
must compare against history, diff against the last known-good revision rather
than overwriting.

## Prisma 7 setup (don't regress this)

- `schema.prisma` datasource has **no `url`** (unsupported in Prisma 7). The
  migrate/introspection connection string lives in `prisma.config.ts`
  (`datasource.url` from `DATABASE_URL`).
- The runtime client connects via the **`@prisma/adapter-pg` driver adapter** —
  see `../src/lib/prisma.ts`. Standalone scripts/seeds use
  `createPrismaClient()` from `./client.ts` (never `new PrismaClient()` directly,
  which won't have a connection in Prisma 7).
- `@@unique(..., nullsNotDistinct: true)` is no longer valid schema syntax, and
  **it was never replaced.** The three canteen/laundry uniques are plain UNIQUE
  indexes, so a NULL `businessUnitId` makes rows distinct: two categories in the
  same unit with the same name both insert. Proven against production
  2026-09-05 — the old claim that a migration preserved the constraint was
  false, and `2df27db` is a commit that widened the key, not a migration.
- Every relation needs both sides (Prisma 7 validates strictly).

## Workflow

```bash
# after editing schema.prisma
pnpm --filter api db:generate         # regenerate client
pnpm --filter api db:push             # apply to dev DB (no migration file)
# or, for a tracked change:
pnpm --filter api db:migrate          # create + apply a migration

pnpm --filter api db:seed             # tsx prisma/seed.ts (uses createPrismaClient)
```

## Files

- `schema.prisma` — models + enums (single source of truth for the DB).
- `prisma.config.ts` — Prisma 7 config (schema path, datasource url, seed cmd).
- `client.ts` — `createPrismaClient()` factory for seeds/scripts.
- `migrations/` — SQL migration history. Squashed to a single `0_init` baseline
  on 2026-09-05: the previous 27 directories could never replay from an empty
  database (P3006 on `complaints`), which is why production had no
  `_prisma_migrations` table at all. `migrate deploy` works from empty now;
  don't hand-edit `0_init`.
- `seed.ts`, `seeds/*` — seed data (admin user, roles, reference data).
