# github-actions-minutes-exhausted

> A CI job that fails in 2–3 seconds with zero steps is a billing wall, not a code failure — the reason is in the check's annotation, not its log.

First hit 2026-08-16: `Build` and `Tests` failed having run **no steps**,
started and finished 2–3 s apart. A re-run failed identically, so not a flake.
The log is empty; the diagnosis is in the annotation:

```
gh api repos/<org>/<repo>/check-runs/<job_id>/annotations
→ "The job was not started because recent account payments have failed or your
   spending limit needs to be increased."
```

**Read the annotation before touching any code.** An empty log invites a hunt
for a regression that does not exist.

## Why it ran out, and what was done

The repo was private on a plan with 2,000 Actions minutes a month, and the
workflows used about twice that — E2E alone ~68% (~36 billable job-minutes a
run), and every squash-merge re-ran the whole gate on `main`. It stopped being
a problem when the repo went public (Actions are free there). **It comes back
the day the repo goes private again.** What already cuts the bill (#532/#534):
no Docker build in CI; changes with no code (`*.md`, `docs/`, `.claude/`, … —
the list is `.github/scripts/change-scope.sh`) skip Lint, Build, Tests,
Security and E2E; E2E skips draft PRs. `main` is compared against the last
**passing** commit, so a run cancelled by concurrency cannot let untested code
through.

The billing REST endpoints are gone or scoped out (`/orgs/{org}/settings/billing/actions`
answers 410), so estimate usage from run durations.

## Merging when CI physically cannot run

That needs the user's word — the standing merge rule requires green checks. The
evidence that makes it defensible:

- `git diff --stat <last-green-commit> HEAD` showing the delta touches nothing
  the blocked jobs would have covered;
- the blocked jobs green on the parent commit;
- the same commands re-run locally;
- and a line in the merge commit body saying so, so the red X is explained
  where someone will look.

## A monitor that hears nothing is not a pass

`gh pr checks <n> --json …` is not supported by every `gh` version ("unknown
flag: --json"). Two CI monitors stayed silent for 50 minutes because their
stderr went to `/dev/null` and an empty list read as "still pending". Parse the
tab output (`gh pr checks <n> | awk -F'\t' '{print $1": "$2}'`) and never
discard stderr in a monitor.
