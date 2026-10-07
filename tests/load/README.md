# Load tests

k6 load tests for the Cipansor API, with a **relative** pass/fail policy: a run
is judged against a baseline recorded on the same target, never against a fixed
millisecond budget. A fixed budget would fail the moment the load profile, the
runner's machine or the target changed, and it would say nothing about whether
*this* build got slower than the last one.

The scheduled run lives in `.github/workflows/load-tests.yml` (weekly, and on
demand). It is not part of CI and does not gate a merge.

## What is here

| Path | What it is |
|---|---|
| `config.js` | The regression tolerances and the load profiles, in one place. The k6 thresholds and the runner's comparison both read it, so they cannot drift apart. |
| `run-load-tests.mjs` | The runner: runs k6, extracts the summary, compares it to the baseline, prints a report and sets the exit code. |
| `run-load-tests.test.mjs` | Unit tests for the runner (`node --test`). No k6 or network needed. |
| `scenarios/public-smoke.js` | Read-only, safe on any target including staging. Anonymous; an expected `401` counts as a pass. |
| `scenarios/authenticated-read.js` | Read-only; needs `LOAD_TEST_EMAIL` / `LOAD_TEST_PASSWORD`. Falls back to the anonymous path when login does not yield a token. |
| `baselines/<host>__<scenario>.json` | The recorded baseline per target and scenario. |

## Running it

k6 is not vendored. Install it (or set `K6_BIN`):

```bash
# macOS
brew install k6
# Debian/Ubuntu (see https://grafana.com/docs/k6/latest/set-up/install-k6/)
sudo gpg -k && ... && sudo apt-get install k6
# or drop the binary at /tmp/k6 — the runner checks there last
```

Record a baseline the first time, then compare against it:

```bash
# 1. Record the baseline (do this once per target + scenario)
node tests/load/run-load-tests.mjs \
  --url https://staging.cipansor.or.id --scenario public-smoke --update-baseline

# 2. Compare a later run against it
node tests/load/run-load-tests.mjs \
  --url https://staging.cipansor.or.id --scenario public-smoke

# Against the local stack (docker compose + db:seed), with credentials
LOAD_TEST_EMAIL=admin@example.com LOAD_TEST_PASSWORD=... \
  node tests/load/run-load-tests.mjs --url http://localhost:3001 --scenario authenticated-read
```

Flags: `--url`, `--scenario`, `--profile smoke|load`, `--baseline <path>`,
`--update-baseline`, `--json`, `--report <path>`.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Ran, no regression against the baseline. |
| `1` | Ran, one or more regressions found (p50/p95/p99, error rate or checks rate). |
| `2` | Could not run — k6 missing, an unknown scenario, a k6 failure, or a **rate-limited** run. Nothing was compared. |

The scheduled workflow fails the job on `1` **and** on `2`. A green load test
that never actually measured anything is worse than a red one.

## The regression policy

Tolerances live in `config.js` (`REGRESSION`). They are deliberately loose:
staging is a shared VM and one run is noisy, so they flag a real step change,
not run-to-run jitter.

- **p95** may grow by `1.5x` before it is a regression; **p99** by `1.75x`.
- **p99 is only compared once a run has `p99MinSamples` (100) samples.** Below
  that, p99 *is* the single slowest request and swings run to run — measured
  327 ms → 764 ms across two identical 48-request smoke runs — so it would flag
  regressions that never happened. p50/p95 are checked at every size.
- **Error rate** is computed by the runner from the `expected_responses` /
  `unexpected_responses` counters, not from k6's `http_req_failed` (which
  counts the `401`s the anonymous scenario expects as failures). The ceiling is
  `1%`.
- **Checks rate** must stay above `0.99`.

Both the k6 thresholds and the runner's comparison read a single metric,
`expected_response_duration`, which each scenario fills only for responses it
expected. This is what keeps k6's own "thresholds crossed" verdict and the
runner's report from disagreeing.

### Rate limiting

The API mounts a global limiter of 100 requests/minute per IP
(`apps/api/src/middleware/rate-limit.ts`). A run that trips it measures the
limiter, not the app, so a `429` is counted separately (`rate_limited`) and the
runner **refuses to record or compare** a baseline from a throttled run: it
prints why and exits `2`. The `smoke` profile stays under the budget on purpose;
the `load` profile does not — point it only at a stack you own.

## Baselines

One JSON file per target and scenario:
`baselines/<host-slug>__<scenario>.json`. `staging-cipansor-or-id__public-smoke.json`
is the recorded staging baseline. A baseline is a fact about one target on one
day, so re-record it (`--update-baseline`) when the target's capacity or the
profile changes, and say so in the PR.

## The authenticated scenario

`authenticated-read.js` needs `LOAD_TEST_EMAIL` / `LOAD_TEST_PASSWORD` for a
demo account on the target. On the Cipansor API a browser login is also gated by
Cloudflare Turnstile and 2FA; the scenario asks for a bearer client
(`X-Client: bearer`, see `docs/MOBILE_API.md`) so Turnstile — a browser gate —
is not in the way. If login still returns `requiresTwoFactor` /
`requiresTwoFactorSetup` / `requiresPasswordChange`, it logs once and runs
read-only without a token; the `401`s it then gets are expected. **It never
fabricates a token.** The scheduled workflow skips this job and says so when the
secrets are unset.
