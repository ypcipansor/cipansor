# Test coverage and test quality

Two different questions, two different tools, two different places to run them:

| Question | Tool | Where | Consequence |
|---|---|---|---|
| Was this line executed? | coverage (`vitest --coverage`) | every PR, `ci.yml` → **Check coverage floor** | PR fails below the floor |
| Would a test have noticed if this line behaved differently? | mutation testing (Stryker) | weekly, `mutation.yml` | opens an issue on a regression |

## The coverage floor

`apps/api/coverage/coverage-summary.json` is compared against
`.github/coverage-baseline.json` by `.github/scripts/coverage-gate.mjs`. A pull
request whose coverage dropped more than `tolerance_pct` below the floor fails
the `Tests` job.

The floor is a **ratchet**: raise it as coverage improves, never lower it to
make a red PR pass. To raise it after adding tests:

``sh
pnpm --filter api test:coverage
# read the four numbers it prints, then edit .github/coverage-baseline.json
``

The bootstrap PR that first introduces the floor sets `COVERAGE_GATE=off` on the
`Check coverage floor` step for that one run; remove it afterwards.

## Mutation testing

`apps/api/stryker.config.mjs` mutates a small, curated set of critical-path
files — authentication and admissions today — and runs the narrow test set in
`apps/api/vitest.mutation.config.ts` for each mutant. A surviving mutant is a
test that reached the line but asserted nothing about it.

Add a file to `mutate` only once it has a unit test that imports it; a file with
no direct test reports 0% and wastes the run.

``sh
pnpm --filter api mutation            # writes apps/api/reports/mutation/
``

`.github/scripts/mutation-gate.mjs` compares the score against
`.github/mutation-baseline.json` and opens an issue labelled `chore` +
`automation-health` when it drops. `null` in the baseline means "not recorded
yet": the first run records reality, later runs compare.

## Finding the next gap

`Pemindai celah uji` runs weekly: it ranks untested services/controllers
and web flows by risk and opens **one** issue for the highest-risk gap. It does
not write tests — the issue goes through the normal pipeline (`Pelabel issue` applies
`ready`, `Tiket jadi PR` implements it and links the PR with `Fixes #<n>`).
