# Project memory — index

Where the work stands. Claude loads this file in every session (through
`CLAUDE.md`); any other agent should read it before starting. The rules for what
goes here and what does not are in `AGENTS.md` → "Where things live". **Nothing
sensitive in this folder** — the repository is public until release, and the
Security CI job and Claude's `guard.sh` refuse the mechanical cases.

| File | Holds | Update when |
|---|---|---|
| [`progress.md`](progress.md) | what is merged, on staging, in production; what waits on the user; what is in flight | a PR merges, a deploy runs, the user decides something |
| [`roadmap.md`](roadmap.md) | the ordered backlog — what to do next, and why in that order | priorities change, or an item is done |
| [`known-issues.md`](known-issues.md) | open defects, in detail | a defect is found, or fixed (delete a fixed entry; git keeps it) |

Update a file in place — one subject, one file — on a branch and through a PR,
like any other change. Keep this index to one line per file.
