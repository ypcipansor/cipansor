# Changelog

What actually merged to `main`, newest first. One section per run, entries
grouped into Features, Fixes and Maintenance from the pull request's
conventional-commit title, each line carrying its PR number.

This file is kept current by `scripts/changelog.mjs` (`pnpm changelog`), the
deterministic core of the **SDLC 14b · Changelog generator** automation
(issue #692, section 4). It reads the PRs merged to `main` since the newest
`v*` tag and prepends a dated section, skipping any PR already listed here.
It never writes to `main` by itself: the automation opens a pull request, and
the release path stays the one place that decides what a version contains.

Nothing has been published as a GitHub Release yet, so this file starts empty
and fills from the first run after it merges.
