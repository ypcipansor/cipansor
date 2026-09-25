# CLAUDE.md

@AGENTS.md
@.claude/memory/INDEX.md

## Claude Code only

The two imports above are the whole of the project guidance: `AGENTS.md` for
the rules (every agent reads it), `.claude/memory/INDEX.md` for where the work
stands. Claude Code does not load `AGENTS.md` on its own when a `CLAUDE.md`
exists — until 2026-09-25 this file only *said* "read AGENTS.md", and the
golden rules were not in context unless a session chose to open it.

- Hooks in `.claude/hooks/` enforce part of `AGENTS.md` mechanically; the list
  and the reasons are in `.claude/README.md`.
- Two memories, kept apart on purpose (`AGENTS.md` → "Where things live"): the
  repo's `.claude/memory/` — shared, committed through PRs, **nothing
  sensitive** — and the machine-local auto memory under
  `~/.claude/projects/…/memory/`, which holds what is sensitive, personal or
  specific to this machine.
