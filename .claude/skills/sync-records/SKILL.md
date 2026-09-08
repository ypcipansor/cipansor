---
name: sync-records
description: Bring the durable records level with what actually happened this session — memory files and their index, docs/EOFFICE_ESIGN_PLAN.md, docs/ROADMAP.md, AGENTS.md. Use before compacting, before ending a long session, or whenever asked to "sesuaikan memori/plan/file lainnya".
---

# Sync the durable records

Everything in the conversation is lost at compaction. Only files survive. This
skill is the checklist for moving what matters out of the transcript and into
them — and it is the answer to "sesuaikan memori, plan, dan file lainnya".

Run it **before** compacting, not after.

Two committed hooks ask for this pass so nobody has to remember to:
`hooks/pre-compact-sync.sh` pauses the first manual `/compact` of a session, and
`hooks/stop-sync-records.sh` asks once at the first resting point after the
session has produced commits. Both ask exactly once and then stand aside. If
this pass genuinely finds nothing worth writing, say that in one line — an
invented edit to satisfy a hook is worse than no edit, because the next reader
trusts it.

## What to write, and where

| finding | goes to |
|---|---|
| how the codebase works, what a fix was | **nowhere** — the repo and git history already say it |
| a durable fact about the user or their preferences | `memory/` type `user` |
| guidance the user gave on how to work, with the why | `memory/` type `feedback` |
| project state not derivable from code or git | `memory/` type `project` |
| a decision the yayasan made, or a standard already researched | `docs/EOFFICE_ESIGN_PLAN.md`, and a memory pointer |
| what is done vs still open | `docs/ROADMAP.md` |
| a convention future work must follow | `AGENTS.md` (or the per-area one) |

Memory lives in `~/.claude/projects/-home-cipansoradm-cipansor/memory/`.

## The pass

1. **Re-read what the session actually changed.** `git log --oneline` since the
   session began, plus any production or deploy action taken. Findings that
   never reached a file are the ones at risk.
2. **Correct before you add.** A memory that has become *wrong* is worse than a
   memory that is missing, because it is trusted. Ask of every file you touched
   this session: is anything in it now false? This is the step most often
   skipped, and the one that has mattered most here — a credentials note went
   stale within thirty minutes of being written, because the session itself
   changed the password it described.
3. **Update in place, don't duplicate.** Look for the existing file that already
   covers the ground; a second file on the same subject splits the truth.
4. **Update `MEMORY.md`** — one line per memory, hook only, never content. If a
   memory's headline changed, its index line changed too.
5. **Docs are code.** Plan and ROADMAP edits go on a branch and through a PR
   like anything else; never commit them straight to `main`.
6. **Stamp it, so the pass counts.** Last step, always:

   ```
   python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/sync_stamp.py"
   ```

   This is what tells `pre-compact-sync.sh` the records are level. Without it a
   pass the user asked for directly did nothing to quiet the next `/compact` —
   which was backwards, and was fixed on 2026-09-05. The stamp measures *work*
   (git HEAD + working tree), not elapsed time, so it stays valid until
   something new actually happens.

   Skip it only when the pass found nothing AND wrote nothing.

7. **Say what you did**, briefly, so the user can disagree before the transcript
   is gone. Then tell them plainly that `/compact` will now go straight
   through — that sentence is the notification they were promised.

## What earns a memory

Write it down when a future session would otherwise **repeat the work or repeat
the mistake**: a trap that cost real time, a standard already researched with
its source, a decision and its reason, a measurement that contradicts an
assumption. Convert relative dates to absolute.

Do **not** write down what the repo already records, or what only mattered
inside this conversation.

## Signals it is worth a pass

- a PR merged or a deploy performed
- a measurement that contradicted a memory or a doc
- the user made a decision, or gave feedback on how to work
- a trap that cost more than a few minutes to diagnose
- anything learned about production that is not in the code
