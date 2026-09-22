# Pengawasan → Correspondence boundary — decision record

Status: **accepted** (repository owner: accepted via the PR #508 review thread,
2026-09-22). Applies to the Pengawasan oversight report drafting path.

## The question

`PengawasanService.draftPeriodicReportToEOffice` needs to file a periodic
oversight report as an E-Office **DRAFT** outgoing letter and return the created
`letterId` to its caller. It does this by calling
`CorrespondenceService.createGeneratedDraftLetter` directly
(`apps/api/src/modules/pengawasan/pengawasan.service.ts`, the periodic-report
method). The repository rule says cross-module communication goes through the
typed `eventBus`:

- root `AGENTS.md` — "Cross-module communication goes through the typed
  `eventBus` (`src/lib/event-bus.ts`)".
- `apps/api/AGENTS.md` — "Cross-module side effects: emit via `eventBus` … don't
  reach into other modules' services."
- `docs/ARCHITECTURE.md` — "Cross-module side effects — emit typed events on
  `eventBus` (`AppEvents`); don't reach into other modules' services."

Is the direct call a violation?

## Decision

**No — with a narrowed rule and a narrowed primitive.** The rule is about
_cross-module side effects_: fire-and-forget work that another module owns.
Filing a letter that the caller must acknowledge with a value is not a side
effect; it is a synchronous command whose result the caller depends on. The
rebus cannot carry it (`event-bus.ts` exposes only `emit`/`on`/`once`/`off`,
with no reply channel), so the sanctioned pattern is a direct call through a
**narrow, typed primitive** exported by the owning module.

This is not a new invention. The tree already takes this direction where a
value must come back:

- `apps/api/src/modules/users/user.service.ts` imports `auth.service.ts`.
- `apps/api/src/modules/analytics/alerts.service.ts` imports
  `notifications.service`.
- `apps/api/src/lib/event-bus.ts` itself imports the notification services that
  consume its events.

The exception is now stated in `docs/ARCHITECTURE.md` so it is a documented rule,
not a comment on one call site.

## Why `createGeneratedDraftLetter` and not `createLetter`

`createGeneratedDraftLetter` is deliberately narrower than the module's broad
creation surface. It:

- files only a **DRAFT** (never a `SENT` letter), so the Pembina can verify and
  sign it through the normal E-Office lifecycle;
- owns the letter invariants in the one place they live — nature/type validity,
  recipient eligibility, and the `CREATED` `LetterFlowEvent` in the same
  transaction;
- returns the `letterId` the caller needs.

Widening the allowlist to `createLetter` would hand the oversight roles the whole
correspondence-creation surface, including dispatch — the very lifecycle the
primitive exists to keep out of their reach.

## What is still forbidden (guard-pinned)

`apps/api/src/modules/pengawasan/tests/correspondence-boundary.test.ts` pins the
narrow invariant that survived review:

1. Pengawasan must never `prisma.letter.*` / `prisma.letterFlowEvent.*` /
   `prisma.letterRecipient.*` write. It files through the primitive.
2. Pengawasan must never call `CorrespondenceService.createLetter` /
   `.dispatch` / `.submit`.
3. The report is born a `DRAFT` — no `status: 'SENT'` written from oversight.

An earlier revision of this PR wrote `status: 'SENT'` straight into the `letters`
row, skipping history, reviewer rung, `sentAt` and dispatch. That is exactly the
table-write the guard now blocks.

## Consequence

The direct call is **correct-by-design** and is not a finding. If the bus ever
gains a request/response channel, this decision should be revisited so the
command can move behind it; until then the primitive is the boundary.
