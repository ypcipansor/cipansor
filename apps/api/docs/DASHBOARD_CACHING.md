# Dashboard metrics cache

The dashboard's headline figures — students, teachers, today's attendance,
hafidz count and murojaah quality — are computed in
`src/lib/dashboard-metrics.ts` and cached in Redis.

## Keys

| Scope | Key | TTL |
| --- | --- | --- |
| Whole yayasan | `metrics:global` | 60 s |
| One unit | `metrics:unit:{unitId}` | 60 s |

## Who reads, who writes

- **`getCurrentDashboardMetrics(unitId?)`** reads through the cache: a hit is
  returned as is, a miss runs six queries and caches the result for 60 s.
  `DashboardService` calls it for the dashboard's current figures.
- **The history job** (`src/jobs/dashboard-metrics.job.ts`, every minute)
  passes `{ fresh: true }`, which skips the cached copy but still refreshes it.
  Without that, a job running every minute against a 60-second cache would
  record the previous minute's figures again. The rows it writes to
  `dashboard_history` are the dashboard's trend; the cleanup job keeps the last
  24 hours.
- **`invalidateDashboardCache(unitId?)`** drops one entry. Event handlers in
  `src/lib/event-bus.ts` call it when attendance, tahfidz, payments, students or
  UKS records change. A unit's change drops only that unit's entry; the
  yayasan-wide entry catches up within its 60 s.

## When Redis is down

The cache is an optimisation only. While the client is not connected
(`redis.status !== 'ready'`) the figures come straight from the database and
invalidation is skipped; nobody waits on a reconnect. A read or write that
fails midway is logged and the database answer is used.

## What is not here

Nothing is pushed to browsers. The web keeps itself fresh by polling through
React Query (`refetchInterval` in `apps/web/src/hooks/use-dashboard.ts` and
others). Why, and what a push channel must satisfy if one is ever built:
`.claude/memory/decisions/realtime-polling.md`.

Tests: `src/lib/dashboard-metrics.test.ts` (cache behaviour) and
`tests/unit/dashboard-history.test.ts` (the job).
