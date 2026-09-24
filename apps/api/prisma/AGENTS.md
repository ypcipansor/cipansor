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

ALLOW_DESTRUCTIVE_SEED=1 pnpm --filter api db:seed  # TRUNCATEs every table first; refuses without the flag
ALLOW_DEMO_PACK=1 pnpm --filter api db:seed:presentasi  # ADDS the presentation pack to an existing DB; truncates nothing
```

**The presentation pack** (`seeds/paket-presentasi.ts`) turns the thin base seed
into a school year that holds together: 164 santri in 20 rombel, a clash-free
timetable, attendance on school days only, exams and grades, last semester's
rapor, SPP billing paid according to each family's habit, tahfidz that follows
one curriculum from SD 1 to SMA 12 (earlier hafalan recorded as history, this
year's setoran continuing where it stops), UKS records that match the attendance,
asrama rooms, discipline, and SPMB for next year. It runs ONLY through
`db:seed:presentasi`, on top of a database that already has the base data
(staging, production demo data). It is idempotent — it skips itself when SD IT
already has a class `6A` in the active year — and every date derives from today.

**`db:seed` deliberately does not run it.** The e2e suite is written against the
base seed, and the pack changes what that suite relies on: 12 of 386 tests
failed when it ran inside `db:seed` (#530) — "the first exam" is a different
exam among 648, a homeroom teacher gains the `WALI_KELAS` role, and unit
addresses push `admin.sdit@`'s and `fatimah@`'s `auth-storage` cookie past 4 KB,
which Playwright refuses outright (the browser drops it silently — see
`docs/KNOWN_ISSUES.md`). Test fixtures and presentation data do different jobs.

Its guarantees are checked by invariants rather than by eye: nobody in two
classes, no teacher or class in two places at once, no setoran on a day the
santri was absent, no ziyadah overlapping another, invoice status matching final
payments, no room over capacity or of the wrong gender. Generated wali accounts
have **no phone number** (the SPP reminder job WhatsApps `User.phone` on the
1st) and no password. It also clears `dashboard_history` and
`dashboard_metric_snapshots`: they are derived caches, and rows computed from the
thin base data made the dashboard show "+1162%" growth that never happened.

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
- `seed-presentasi.ts` — standalone runner for the presentation pack; refuses without `ALLOW_DEMO_PACK=1`.
