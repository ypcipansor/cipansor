# Project memory — index

Where the work stands, what was decided, and what was learned the hard way.
Claude loads this file in every session (through `CLAUDE.md`); any other agent
should read it before starting, and open a file below when its line matches the
task. The rules for what goes here and what does not are in `AGENTS.md` →
"Where things live". **Nothing sensitive in this folder** — the repository is
public until release, and the Security CI job and Claude's `guard.sh` refuse
the mechanical cases.

## State — update as the work moves

| File | Holds | Update when |
|---|---|---|
| [`progress.md`](progress.md) | what is merged, on staging, in production; what waits on the user; what is in flight | a PR merges, a deploy runs, the user decides something |
| [`roadmap.md`](roadmap.md) | the ordered backlog — what to do next, and why in that order | priorities change, or an item is done |
| [`known-issues.md`](known-issues.md) | open defects, in detail | a defect is found, or fixed (delete a fixed entry; git keeps it) |

## Decisions — settled; do not re-open without a new reason

- [pimpinan-pesantren-kiai](decisions/pimpinan-pesantren-kiai.md) — no Direktur; the Kiai is Pimpinan Pesantren (unit head) and also Pembina, with the legal basis
- [pk-organ-yayasan-tanpa-kontrak](decisions/pk-organ-yayasan-tanpa-kontrak.md) — Pembina, Pengurus and Pengawas make no PK; a unit head's PK hangs on the unit's ratified RKA
- [pengesahan-dokumen-yayasan](decisions/pengesahan-dokumen-yayasan.md) — who drafts, reviews and ratifies RPJP/Renstra/RKA; ratified documents freeze
- [rka-dua-tingkat](decisions/rka-dua-tingkat.md) — four planning levels (RPJP → Renstra → RKA Yayasan → RKA Unit); never propose three
- [unit-vs-asrama-vs-takhosus](decisions/unit-vs-asrama-vs-takhosus.md) — a unit issues its own graduation; asrama is not a unit; takhosus is `UnitType.PESANTREN`
- [menu-ia-tiga-tingkat](decisions/menu-ia-tiga-tingkat.md) — at most three menu levels, nine groups by discipline; no sub-sub-menus
- [eoffice-revocation-authority](decisions/eoffice-revocation-authority.md) — who may revoke a naskah dinas; Pengawas, not Ketua; never Super Admin
- [eoffice-revocation-mechanics](decisions/eoffice-revocation-mechanics.md) — revocation is a signed statement; the DICABUT stamp; requesting ≠ deciding
- [eoffice-verify-by-upload-not-qr](decisions/eoffice-verify-by-upload-not-qr.md) — verify by uploading the PDF, never by a token page; Arabic in the naskah
- [esign-standards-ceiling](decisions/esign-standards-ceiling.md) — AATL/eIDAS/PP 71 ceiling; Ed25519 blocks PAdES; no PSrE for now; research not to repeat
- [chatbot-retrieval-settled](decisions/chatbot-retrieval-settled.md) — the whole corpus goes into every prompt; what was rejected; when to revisit
- [route-naming](decisions/route-naming.md) — PPDB/PSB → SPMB with permanent redirects; pesantren terms are never translated
- [istilah-dan-penamaan](decisions/istilah-dan-penamaan.md) — murid/santri/peserta didik, spellings, portal Indonesian-only vs trilingual public site, `/api/v1`, tables follow models, no lab module, ZIS/wakaf law, target module names
- [pemutus-izin-santri](decisions/pemutus-izin-santri.md) — a santri's leave is decided by their musyrif or wali kelas, not the kepala; heads only for long leave, no mentor, or takeover; three parameters open
- [public-site-photography](decisions/public-site-photography.md) — where real photos come from, what was left behind, claim only what a photo shows

## Lessons — traps that already cost time

- [guard-tests-that-measure-the-wrong-thing](lessons/guard-tests-that-measure-the-wrong-thing.md) — "what would have to change for this test to go red?"; chains with no root; fuzz against invariants
- [teacher-dashboard-fake-stats](lessons/teacher-dashboard-fake-stats.md) — four kinds of figures that lie, and how to find each
- [breadth-over-depth](lessons/breadth-over-depth.md) — built wider than used; walk a real journey end to end
- [student-status-case-mismatch](lessons/student-status-case-mismatch.md) — `'active'` vs `'ACTIVE'`: 43 queries returned zero; one vocabulary + CHECK + scanner
- [prisma-include-leaks-pii](lessons/prisma-include-leaks-pii.md) — `include: { student }` sends 69 columns of a child's data; always `select`
- [rbac-nav-contract](lessons/rbac-nav-contract.md) — `navigation.ts` and `rbac.ts` are one contract; the three directions tested, and how they go blind
- [api-integration-traps](lessons/api-integration-traps.md) — empty permission matrix, Express 5 `req.query`, `/:id` shadowing, unmounted paths
- [auth-session-traps](lessons/auth-session-traps.md) — refresh-token stampede, pre-rehydration redirects, the 4 KB cookie
- [stale-temporal-data](lessons/stale-temporal-data.md) — derive dates from now; `isActive` is not a schedule
- [migration-history-baselined](lessons/migration-history-baselined.md) — `0_init`; `migrate diff` blind to triggers; CI's `db push`; wrap data migrations in BEGIN/COMMIT
- [seed-verify-throwaway-db](lessons/seed-verify-throwaway-db.md) — prove a seed change on a disposable, isolated Postgres
- [git-three-dot-diff-hides-stale-base](lessons/git-three-dot-diff-hides-stale-base.md) — measure from the merge base; paired PRs; a bot's stale-tree commit
- [git-checkout-path-destroys-uncommitted](lessons/git-checkout-path-destroys-uncommitted.md) — `git add -A` before a mutation test
- [branch-switch-stale-artifacts](lessons/branch-switch-stale-artifacts.md) — rebuild `shared` and regenerate Prisma after checkout or stash
- [pnpm-install-silently-installs-nothing](lessons/pnpm-install-silently-installs-nothing.md) — exit 0, nothing installed; `CI=true`
- [audit-deps-fails-on-time-not-diff](lessons/audit-deps-fails-on-time-not-diff.md) — the Security job reds on the date, and greens without checking
- [github-actions-minutes-exhausted](lessons/github-actions-minutes-exhausted.md) — a 2-second job with no steps is a billing wall; read the annotation
- [gh-cli-and-shell-traps](lessons/gh-cli-and-shell-traps.md) — `gh pr edit` does nothing; unquoted heredocs run backticks
- [docker-image-size-traps](lessons/docker-image-size-traps.md) — Prisma's optional peer, `chown -R`, recursive `*.sql` in `.dockerignore`
- [next-image-optimizer-dead](lessons/next-image-optimizer-dead.md) — `/_next/image` never resizes; ship images at display size
- [nextjs-loading-boundary-commits-200](lessons/nextjs-loading-boundary-commits-200.md) — a root `loading.tsx` turns every 404 into a 200
- [mobile-layout-audit](lessons/mobile-layout-audit.md) — `scrollWidth` lies here; the ancestor-walk test that works
- [radix-scrollarea-thumb-stalls](lessons/radix-scrollarea-thumb-stalls.md) — the thumb that stops at 3%; measuring at end of frame

Update a file in place — one subject, one file — on a branch and through a PR,
like any other change. Keep this index to one line per file.
