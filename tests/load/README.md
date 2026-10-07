# Load tests

Scheduled, small, read-only load against **staging** — never production.

`../.github/workflows/load-tests.yml` runs this daily (and on demand): it signs
in as seeded non-2FA demo accounts, loops a few reads, and compares p50/p95/p99
and the error rate against [`baseline.json`](baseline.json). A clean run
proposes the fresh numbers as the new baseline (via a PR, since `main` is
protected); a regression opens an issue with the numbers and the baseline it
compared to.

## Pieces

| File | What it is |
|---|---|
| [`k6/api-smoke.js`](k6/api-smoke.js) | The k6 script: login + reads, per-endpoint metrics, `handleSummary` |
| [`lib/resolve-accounts.mjs`](lib/resolve-accounts.mjs) | Reads the demo accounts + `DEMO_PASSWORD` from `packages/shared/src/types/demo-accounts.ts` — never hardcoded |
| [`lib/compare.mjs`](lib/compare.mjs) | Compares `summary.json` against `baseline.json`; `--update` records a clean run |
| [`baseline.json`](baseline.json) | The last clean run, the yardstick for the next one |
| `summary.json`, `comparison.json` | Run artifacts (git-ignored) |

## Running it by hand

k6 has no npm install; fetch the binary once.

```bash
curl -fsSL https://github.com/grafana/k6/releases/download/v0.49.0/k6-v0.49.0-linux-amd64.tar.gz - | tar -xz
node tests/load/lib/resolve-accounts.mjs > /tmp/accounts.json

BASE_URL=https://staging.cipansor.or.id \
  ACCOUNTS_FILE=/tmp/accounts.json \
  VUS=3 DURATION=30s SLEEP_SECONDS=2 \
  ./k6-v0.49.0-linux-amd64/k6 run tests/load/k6/api-smoke.js

node tests/load/lib/compare.mjs          # exit 1 on a regression
node tests/load/lib/compare.mjs --update # record a clean run as the baseline
```

`BASE_URL` must be `staging.cipansor.or.id` or a local stack; the script
refuses anything else, so no run can be aimed at `cipansor.or.id`.

## Why it is shaped this way

- **Why demo accounts, resolved from the checkout.** The password is public in
  `demo-accounts.ts`; nothing sensitive belongs in the workflow. Only roles
  without a second factor are eligible — a seeded admin or unit head needs 2FA
  and its password alone cannot start a session (`SECOND_FACTOR_ROLE_CODES`),
  so those are excluded by construction.
- **Why only three VUs.** `/api/auth/login` is rate-limited to 5/min with a
  production ceiling that is not relaxed for a load test. Three logins (a
  teacher, a pesantren ustadz, a parent) stay under it. If a run is repeated
  within a minute, the logins are the first thing to fail.
- **Why reads only.** The three endpoints return the caller's own profile,
  dashboard metrics and the announcement list — a page load's core, no write,
  no e-mail, no WhatsApp. Staging's outbound and Turnstile are off.
- **Why a regression never fails the workflow.** Staging is a shared
  single-instance App Service, so latency moves on noise. `compare.mjs` needs
  both a ratio (p95 ×1.5, p99 ×2) and an absolute floor before it reports, and
  the regression becomes an **issue** the team reads — not a red build. Only a
  broken run (staging unreachable, a login that cannot start a session) fails
  the job.
