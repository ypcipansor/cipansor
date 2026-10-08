<!-- Keep this PR as a draft until it is ready for review. SDLC 22 only reviews a
     ready PR. A red check or a requested change leaves it open — the failing
     checks and the request-changes review are already visible on it, and a human
     decides when it is ready again (docs/LABELS.md, rule 5). -->

## HUMAN

<!-- Human author: replace this comment with a short note on what you tested and
     how. AI agents must not edit this section. -->

---

## AGENT

<!-- AI/LLM agents: do not edit the HUMAN section. Do not describe what you
     intend to do — state what you ran and what it returned. Testing with unit
     tests alone is not enough for a change that a user can exercise; run the
     real path and show it. End every comment with the AI-disclosure footer so
     this PR never re-triggers an automation on its own text:
     "_This comment was created by an AI agent (OpenHands) on behalf of <user>._" -->

## Why

<!-- The problem and its motivation. For a bug, the failure and its observed cost. -->

## What changed

<!-- 1-3 bullets. For a bug, state the failure, then the fix. -->
-

## Linked issue

<!-- Required. Write `Fixes #<n>`. The issue must carry the `ready` label: that
     label means it has a clear goal and concrete acceptance criteria, and is
     applied by SDLC 19 only then. Without a `ready` issue this PR should not
     exist yet — open the issue first. See docs/LABELS.md. -->
Fixes #

## Acceptance criteria

<!-- Copy the checkboxes from the linked issue and tick the ones this PR
     satisfies, with the evidence for each. SDLC 21 copies the issue's type and
     priority to this PR; the Issue label sync workflow fails when the type
     genuinely disagrees. -->

- [ ]

## How to test

<!-- Required. The exact commands a reviewer runs to see it work, with the
     observed output. For a bug: reproduction steps and the before/after result.
     If you could not test it, say why — that is better than a silent claim. -->

## Evidence

<!-- For a bug: the failure before and the success after, same setup. For any
     change under apps/web: a before and an after visual of the changed view or
     flow, both, pasted with GitHub's uploader. For other functional changes:
     screenshots or a video of the running behaviour. The `visual-evidence`
     workflow posts a reminder (never a block) when apps/web changed without a
     before/after visual. Logs and tests supplement this; for a non-functional
     change they may be the evidence. State what you validated and its limits. -->

## Type

<!-- Tick one. Must match the type label on the linked issue. -->
- [ ] `bug` — fixes a defect
- [ ] `enhancement` — a new capability
- [ ] `documentation` — docs only
- [ ] `refactor` — same behaviour, cleaner code
- [ ] `chore` — tooling, deps, maintenance
- [ ] `security` — hardening

## Notes

<!-- Optional: migrations, config changes, rollout concerns, follow-ups, or
     anything reviewers should know. Design docs belong in docs/ and a link. -->
