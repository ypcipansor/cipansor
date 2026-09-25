# Progress — where the work stands

Updated **2026-09-25**. What a new session needs to pick up the thread, newest
first. Keep it short: finished work belongs to git history, and the ordered
backlog to [`roadmap.md`](roadmap.md).

## Environments

- **Production** — `cipansor.or.id`, Azure App Service since 2026-09-24. A
  release needs the user's explicit approval every time, and
  releases the SHA staging reports at `/healthz`, not the head of `main`.
  Migrations run when the container starts (`MIGRATE_ON_START`).
- **Staging** — `staging.cipansor.or.id`, demo data only, deploys every `main`
  on which CI and E2E (Chromium) pass. At `24068dc9` on 2026-09-25.

## Waiting on the user

- Approval for the next production release. (Which fixes production still
  lacks is for the machine-local memory, not here — see "Where things live".)
- Role catalogue items decided but not built: a *bidang* attribute for Wakasek,
  `PESANTREN_ADMIN` (needs a pesantren unit first — every pesantren role is
  scoped to SMP IT today), a Panitia SPMB assignment that expires, and the
  "Admin" → "Operator" label.
- One Bendahara role with a unit scope waits for Model A (decided 2026-09-25).

## In flight

- **Agent-context restructure** (decided 2026-09-25): steps 1–3 are merged
  (see below); step 4 is the domain skills `panduan-peran`,
  `tata-kelola-yayasan` and `naskah-dinas`, with `apps/web/scripts/role-menus.ts`
  to print any role's menu from code.
- **Model A design document** — approved to draft on 2026-09-25: a permission
  per feature and action, data scope from the assignment, menus derived from
  permissions, separation-of-duty rules locked in code, and the account
  lifecycle (joiner–mover–leaver, immediate deactivation, SCIM from Microsoft
  Entra or a Google Directory API sync after SSO). For the user's review before
  any code. `docs/DEPLOYMENT.md` goes
  after 2026-10-01 (the VM is the rollback target until then, and a guard test
  reads it).

## Recently done (2026-09-24 → 25)

- Santri and staff data scoped to the caller (#546, #547, #549, #550);
  2FA required for the yayasan organs (#548); a unit admin can no longer make
  themselves Super Admin (#543); CodeQL alerts cleared (#545).
- Pesantren role catalogue (#552): no Direktur, the Kiai is Pimpinan Pesantren
  and also Pembina; Musyrifah, Wali Kamar and Murabbi merged into Musyrif,
  Muhafidzah into Muhafidz.
- The E2E helper that picked another spec's plan (#551).
- The server checks who is named *atasan penilai* on a PK: never the owner,
  and only someone who holds a supervising role (#553).
- Agent context (#554, #555, #556): `CLAUDE.md` imports `AGENTS.md` and this
  index; stale docs deleted; roadmap and known issues cut to open work;
  decisions and lessons moved here from the machine-local memory; golden rules
  10 (before/after screenshots) and 11 (menu path + state).
- **Licence decided (2026-09-25): proprietary, owned by Yayasan Pesantren
  Cipansor — not open source**, because the repository becomes private. Never
  add an open-source licence, badge, or "contributions welcome" text.

## Next

Model A (a permission per feature plus a data scope), then one adaptive
`/dashboard` and a scoped `/analytics` — see [`roadmap.md`](roadmap.md).
