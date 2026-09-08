---
name: gate
description: Run the full local quality gate for the Cipansor monorepo (shared build, API build + strict typecheck + tests, web build + tests) the way AGENTS.md requires before every push. Use when asked to "run the gate", "check everything passes", or before committing/pushing.
---

# Quality gate

AGENTS.md requires the full gate to pass locally before pushing — CI is only a
backstop. Run these in order from the repo root and stop at the first failure.

```bash
pnpm --filter api db:generate         # Prisma client (needed if schema changed)
pnpm --filter @cipansor/shared build  # shared types, consumed by both apps
pnpm --filter api lint                # eslint — CI fails on errors, not warnings
pnpm --filter web lint                # eslint — see the note below
pnpm --filter api build               # tsc, build config
pnpm --filter api build:strict        # tsc, full strict incl. tests (the real bar)
pnpm --filter api test                # vitest (API)
pnpm --filter web build               # next build (also typechecks web)
pnpm --filter web test                # vitest (web)
pnpm run audit:deps                   # the Security job, run against live advisories
```

Notes:
- **Lint is not optional and `build` does not cover it.** The React Compiler
  rules ship as eslint errors, not type errors: `Date.now()` called during
  render passed `build`, `build:strict`, all 1,327 API tests and all 362 web
  tests, and failed CI's Lint job on `disposition-timeline.tsx`. Read the count
  at the end — CI fails on **errors** and tolerates the ~1,900 warnings, so
  `grep -E '  error '` is how you find the one that matters.
- **A lint error CI does not report is probably yours alone.** eslint reads no
  `.gitignore`, so generated bundles a developer happens to have on disk
  (a `.next.bak/` rollback copy, a service worker) are linted locally and never
  in CI's fresh checkout. Add them to `globalIgnores` rather than learning to
  skim past them.
- **`audit:deps` can fail on a tree you did not touch.** It queries **npm's**
  live bulk advisory endpoint (`registry.npmjs.org/-/npm/v1/security/advisories/bulk`
  — not GitHub's, as this note wrongly said until 2026-09-04), so a newly
  published CVE reddens every open PR at once. The fix is a pin in the root
  `package.json` `pnpm.overrides`, then `pnpm install` (commit the lockfile —
  CI installs `--frozen-lockfile`).
- **But read the message before hunting for a pin.** The same endpoint returns
  503 and hangs outright, and that failure carries no package name or
  vulnerable range. The script retries with backoff, then splits the two
  failures by exit code: **findings fail closed, unavailability fails open.**
  An exhausted chunk with no findings exits **0** and prints
  `::warning title=Dependency audit incomplete::…` — a green check that says
  "N of M packages were NOT audited", so re-run it before trusting the pass. A
  finding still exits 1 even when part of the run never answered. Exit 2 is
  reserved for our own bugs (malformed request, unreadable lockfile). Tune with
  `AUDIT_TIMEOUT_MS` / `AUDIT_MAX_ATTEMPTS`; set `AUDIT_FAIL_ON_UNREACHABLE=1`
  to make an incomplete audit hard-fail before a release.
- `api build` / `web build` can OOM tsc/next on the default heap; if you see
  exit 134, prefix with `NODE_OPTIONS=--max-old-space-size=4096`.
- `web build` bakes `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3001`).
- `web build` bakes `NEXT_PUBLIC_SHOW_DEMO_LOGIN` too, and in production
  `NEXT_PUBLIC_API_URL` is deliberately **empty** (relative base). Reading either
  uses `??`, never `||` — `||` folds the empty string into the localhost default.
- The e2e suite (`pnpm --filter web test:e2e`) needs the local stack running —
  bring it up with the `stack` skill first. It is not part of this quick gate.
- **This gate cannot see credential drift — run e2e when you touch the seed.**
  `apps/web/e2e/helpers/auth-api.ts` and `e2e/fixtures/auth.fixture.ts` hardcode
  seeded logins, and nothing type-checks them against `prisma/seed.ts`. Renaming
  accounts there passed every step above and then failed CI in `global-setup`
  with `Failed to pre-authenticate <email> … Invalid email or password`. If a
  change touches seeded emails, passwords, or roles, run e2e locally or expect
  to learn about it 17 minutes into CI.
- Report the first failure with its output; do not claim green unless every
  step above exited 0.
