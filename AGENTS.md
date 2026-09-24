# AGENTS.md — Cipansor IMS

Canonical guidance for AI agents and developers working in this repository. This
is the single source of truth; `CLAUDE.md` points here. Keep it in sync with
`README.md`.

## What this is

Cipansor is an Information Management System for Yayasan Pesantren Cipansor
(TK Qur'an, SD IT, SMP IT, SMA Qur'an + tahfidz). It is a **pnpm + Turborepo
monorepo**:

| Workspace | Stack | Purpose |
|-----------|-------|---------|
| `apps/api` | Express 5, Prisma 7 (PostgreSQL), Zod, Socket.IO, Redis (ioredis), JWT | REST API + realtime |
| `apps/web` | Next.js 16 (App Router), React 19, React Query, Tailwind, Radix UI | Web client |
| `packages/shared` (`@cipansor/shared`) | TypeScript, Zod | Shared DTO types & schemas for both apps |

## Golden rules

1. **Never clobber `apps/api/prisma/schema.prisma`.** It is very large —
   ~9,400 lines, hundreds of models and enums. (Exact counts drift; don't
   hard-code them here.) It was once accidentally truncated to a stub, which
   broke the entire backend. Edit surgically; run `pnpm --filter api db:generate`
   after changes. A committed PreToolUse hook (`.claude/hooks/guard.sh`) blocks a
   full-file Write to this path.
2. **Prisma is the source of truth for DB enums and models.** Import DB enums
   (`RoleCode`, `VisitStatus`, `LeaveStatus`, …) from `@prisma/client`, not from
   `@cipansor/shared`. `@cipansor/shared` holds API/DTO contracts only. (Rule 3
   applies to the specific choice of role enum.)
3. **Use `RoleCode`, not the legacy `UserRole`.** `req.user.role` is a roleCode
   string. New auth checks use `RoleCode.*` / permissions; the legacy `UserRole`
   enum is deprecated and being removed.
4. **Validate at the edge with Zod, return via the response helper.** Routes →
   thin controller (`asyncHandler`, `ApiResponse`) → service (business logic +
   Prisma) → `schema.ts` (Zod). Routes never touch Prisma directly; controllers
   never embed business logic.
5. **Prove it locally before pushing.** Run the gate below; do not rely on CI to
   discover failures. CI is a backstop only.
6. **Develop on the feature branch, commit with clear messages, never push to
   `main`.**
7. **Ship tests with the code — no behavior change merges untested.** Every
   new/changed API **service or controller** ships with vitest tests in the
   module's `tests/`; every new/changed **web route or user flow** ships with
   Playwright e2e coverage in `apps/web/e2e/`. A bug fix ships with a test that
   fails before the fix and passes after. Exempt: barrels (`index.ts`),
   type-only files, and pure Zod `schema.ts` (cover them through the
   service/route that uses them). "Done" means the code **and** its tests are in
   the same commit and the full local gate — including e2e — is green.
8. **Ship features wired end-to-end — no orphaned API, no mocked UI.** A change
   is not done until both sides are connected:
   - **New/changed API endpoint that serves a user-facing capability** ships in
     the same change with its web consumer — a React Query hook in
     `apps/web/src/hooks/*` plus the page/component that uses it — not a
     stubbed endpoint waiting for a UI.
   - **New/changed web feature that needs data** is backed by a real endpoint;
     never hardcode mock/placeholder data (see `apps/web/AGENTS.md`). If the
     endpoint is missing, add it to the relevant API module in the same change.
   - **Contracts live once, in `@cipansor/shared`.** Reuse the existing DTO/Zod
     type there; only when it genuinely doesn't exist do you add a new one to
     shared (never redeclare it or fall back to `any` in either app). Backend
     validates with it at the edge; the web imports the same type.
   - **Exempt** (backend-only by nature, no UI required): webhooks and
     third-party callbacks, cron/scheduler jobs, health/readiness probes,
     internal integration-orchestrator calls, and PWA/push endpoints; and on the
     web side, purely presentational/static pages with no data needs. When you
     take an exemption, it should be obvious why from the code — otherwise wire
     the other side.
9. **Two open PRs that touch the same ground: merge them together in a worktree
   and run the gate before you merge the second one.** Each PR's CI only ever
   sees its own base, so a pair that is individually green can still redden
   `main`. Measured on 2026-09-21: #504 (removed the System Secrets module) and
   #505 (decommissioned Perguruan Tinggi/Litbang) were both fully green, and
   merging them together failed 3 of 2,346 API tests — #505's guard pinned the
   very files #504 deleted. `git worktree add --detach <dir> origin/main`, merge
   both heads into it, run the gate there; it costs one gate run and it is the
   only thing that catches this class.

## Commands

```bash
pnpm install                          # bootstrap workspace
pnpm --filter api db:generate         # generate Prisma client (after schema edits)
pnpm --filter @cipansor/shared build  # build shared package (consumed by both apps)

# Local stack (Postgres + Redis) for running/testing end-to-end
docker compose -f docker-compose.dev.yml up -d
pnpm --filter api db:push             # apply schema to the dev DB
ALLOW_DESTRUCTIVE_SEED=1 E2E_FIXED_2FA=1 pnpm --filter api db:seed  # WIPES every table, then demo data

pnpm dev                              # turbo: run api + web in watch mode

# Quality gate — ALL must pass locally before committing/pushing
pnpm --filter api build               # tsc (build config)
pnpm --filter api build:strict        # tsc (full strict — the real target)
pnpm --filter api test                # vitest (API)
pnpm --filter web build               # next build
pnpm --filter web test                # vitest (web)
pnpm --filter web test:e2e            # Playwright e2e (needs the local stack up)
pnpm format                           # prettier
pnpm lint                             # eslint (api + web)
```

## Architecture standard (API module)

Every module under `apps/api/src/modules/<name>/` follows:

```
<name>/
  routes.ts        # express.Router(); auth + validate middleware; delegates to controller
  controller.ts    # thin handlers wrapped in asyncHandler; shape responses via ApiResponse
  service.ts       # business logic + Prisma access
  schema.ts        # Zod request schemas; types via z.infer
  index.ts         # barrel: export { <name>Routes }
  tests/           # vitest unit tests (Prisma mocked)
```

Reuse the shared primitives — do not reinvent them:
- `src/utils/response.ts` — `ApiResponse.success/error/paginated`
- `src/middleware/error.ts` — `ApiError`, `Errors.*`, `asyncHandler`, `validate`, `validateQuery`
- `src/middleware/auth.ts` — `authenticate`, `authorize(...RoleCode)`, `hasPermission`, `isAdmin`, `isSuperAdmin`, `isTeacherOrAbove`
- `src/lib/{prisma,event-bus,realtime,jwt,redis,logger}.ts`

Cross-module communication goes through the typed `eventBus` (`src/lib/event-bus.ts`);
add new events to the `AppEvents` interface with a payload type.

## Web standard

- Data layer: Axios instance in `src/lib/api.ts` (+ `lib/api-error.ts`), consumed
  through React Query hooks in `src/hooks/*`. **No mock/placeholder data in
  pages** — wire to the API.
- Share request/response types from `@cipansor/shared`; don't redefine `any`.
- Route protection / nav visibility must reflect real `RoleCode` + permissions.

## Per-area guides

See nested `AGENTS.md` files: `apps/api/AGENTS.md`, `apps/web/AGENTS.md`,
`packages/shared/AGENTS.md`, `apps/api/prisma/AGENTS.md`. Known technical debt and
the remaining build-green roadmap live in `docs/KNOWN_ISSUES.md`.

## Committed skills and hooks

`.claude/` carries the automation this repo relies on, and it is checked in so
every session gets it.

**These files are kept current without asking.** Standing permission from the
user (2026-07-24, widened 2026-09-05) covers **adding, changing and deleting**
anything in `.claude/`, `AGENTS.md`, `CLAUDE.md` and the per-area guides — new
files where one is missing, and removal of files that guard a flow that no
longer exists. The reason is the same one that put them here: a stale guide is
not neutral, it actively misleads, and a skill for a workflow we deleted is a
trap for whoever reads it next.

Three conditions, none of them loosened by that permission: it goes through a
branch and a PR like any other change, **never straight to `main`**; a deletion
must say in the PR body *why*, because what is gone is invisible on screen; and
before removing anything, prove it is unused — grep for callers, check
`settings.json` for a hook registration — rather than assuming.

| | |
|---|---|
| `skills/gate` | the quality gate AGENTS.md requires before pushing |
| `skills/stack` | bring the local Postgres + Redis stack up |
| `skills/screenshot-roles` | render real components for before/after shots |
| `skills/sync-records` | move findings out of the transcript and into files |
| `hooks/guard.sh` | PreToolUse — blocks a full-file Write to `schema.prisma` and a push to `main` |
| `hooks/session-bootstrap.sh` | SessionStart — installs deps, generates the Prisma client, builds shared |
| `hooks/pre-compact-sync.sh` | PreCompact — pauses a manual `/compact` when there is new work the durable records do not yet reflect; *holds* an auto-compaction until this session has run `sync-records` |
| `hooks/context-sync-warn.sh` | PostToolUse + UserPromptSubmit — tells the model, before the auto-compaction window, to run `sync-records` (the only channel that reaches it) |
| `hooks/main-ci-watch.sh` | SessionStart + UserPromptSubmit + PostToolUse — reports once when a workflow on `main` fails (CI, E2E, CodeQL, Deploy staging/production), and once when it recovers |
| `hooks/sync_stamp.py` | shared by the hooks above and the `sync-records` skill: one definition of "the records are level", plus the context-size reading |
| `hooks/stop-sync-baseline.sh` | SessionStart — records the HEAD sha the session started from, so the Stop hook has something to compare against |
| `hooks/stop-sync-records.sh` | Stop — asks for a `sync-records` pass once, at the first resting point after the session has produced commits |

**Why the compaction hook exists.** Compaction discards the transcript, and only
files survive it. Findings were reaching `memory/`, the plan and the ROADMAP
only because the user remembered to ask, every single time. The hook asks
instead: it exits 2, which hands control back for a `sync-records` pass, and
lets the retry through — so it can nag but can never wedge a session.
`/compact skip-sync` bypasses it deliberately.

**What "level" means is work, not time** (corrected 2026-09-05). The stamp used
to expire after thirty minutes, which asked for a second pass over a session
that had produced nothing new. `sync_stamp.py` now compares git HEAD plus the
working tree, so `/compact` is quiet until something actually changes; a
six-hour ceiling remains for findings that never touch git. The
`sync-records` skill writes the stamp itself as its last step — before that, a
pass the user ran directly did nothing to quiet the next `/compact`, which was
backwards.

**Auto-compaction is held, and the warning comes from a different hook**
(rebuilt 2026-09-23). The first design assumed auto worked like manual: block
once, the model reads the message, runs the pass, the retry goes through. It
never did. For an *automatic* compaction Claude Code writes the block reason to
its debug log only — the model never sees it — and because the hook wrote the
stamp while blocking, the retry one tool call later went through. Measured in a
session transcript: nine auto-compactions, zero passes caused by the hook.

What reaches the model is `additionalContext` from PostToolUse and
UserPromptSubmit (tested live with a probe hook). So `context-sync-warn.sh`
reads the current context size from the transcript (`usage` of the last
main-chain reply) and warns twice per round: at `autoCompactWindow` − 120k
("run `sync-records` now") and at − 60k ("compaction is due and held").
`pre-compact-sync.sh` holds the auto-compaction in that band without writing
any stamp; only a `sync-records` pass by *this* session since the round began
releases it (`sync_stamp.py` run from the skill records
`CLAUDE_CODE_SESSION_ID`). A "round" runs from the last SessionStart, which
`stop-sync-baseline.sh` records.

Safety rails: nothing is held unless `autoCompactWindow` is set at or below
800k (unset = the model's own window = never held); a compaction far below the
window — a smaller model, a reactive retry — is never held; and the hold lets
go at window + 150k (at most 900k), so the worst case is a late compaction
without a pass, never a session stranded at the context wall.
`CLAUDE_SKIP_CONTEXT_SYNC=1` silences the warning.

**Why `main` is watched too** (added 2026-09-24, the user's proposal). A
failing PR is visible — it has checks, and a session can subscribe to it. After
the merge nobody was looking, and that is where the expensive failures hide:
#504 and #505 were green alone and red together, `audit:deps` can turn `main`
red with a newly published CVE and no diff at all, and Deploy staging only runs
after the merge. `main-ci-watch.sh` looks at the latest *completed* run of each
workflow on `main` (`cancelled` is ignored — concurrency cancels runs on
purpose) and tells the model once per failing run, and once when it goes green
again. `gh run list` costs about a second, so tool calls read a cache and a
stale cache (over three minutes) is refreshed by a detached background process;
only SessionStart waits for a fresh answer (8 s cap), so a new session knows at
once that `main` is red. Without `gh` or a network it stays silent.
`CLAUDE_SKIP_MAIN_CI_WATCH=1` turns it off. It is a backstop, not a
replacement: after merging, still follow the merge commit's runs to the end
before releasing it.

**Why there is a `Stop` hook too.** The compaction hook only guards the
compaction door. A session that finishes without ever being compacted never
passes through it — and those are exactly the sessions that leave findings in
the transcript alone. `stop-sync-records.sh` closes that gap.

It is deliberately hard to trigger, because `Stop` fires at the end of *every*
turn and a reminder that appears every turn teaches everyone to ignore hook
messages. It stays quiet unless all five hold: not already continuing from its
own block (`stop_hook_active` — this is what makes a loop impossible), not yet
asked this session, at least one commit since the session began, no pending
changes to tracked files (a resting point, not mid-edit), and no durable record
touched since the session began. One reminder per session, then never again.
`CLAUDE_SKIP_STOP_SYNC=1` turns it off.

Both `Stop` and `PreCompact` fail open on everything else — unreadable input, an
unreadable git tree, an unwritable stamp directory. A hook that breaks a session
is worse than a hook that misses a reminder.
