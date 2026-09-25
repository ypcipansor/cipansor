# route-naming

> Route/naming refactor decided 2026-07-21 — PPDB/PSB → SPMB, every retired path keeps a permanent redirect, and pesantren domain terms are never translated

The rename tables once lived in `docs/planning/ROUTE_NAMING_REFACTOR.md`, which
no longer exists; what is left of the work is in [`roadmap.md`](../roadmap.md)
§7. This note records the decisions, which still hold.

**Approved 2026-07-21.** The frontend half shipped in #439 (2026-09-12). User asked for a "total restructure" of
every frontend + backend endpoint and any badly-chosen name. I pushed back on
big-bang (live site, indexed, Google Ad Grants depends on landing pages not
404ing; 1,838 route literals across 456 files) and they chose:
- scope: **backend AND frontend, every retired path keeps a permanent 308**
- timing: **only after the Playwright route/role audit is done and fixed**, so
  audit findings stay attributable to real bugs rather than rename fallout

**PPDB is retired — the official term is SPMB** (*Sistem Penerimaan Murid
Baru*), Kemendikdasmen, from school year 2025/2026; SPMB 2026 in force. The
user caught this; I had wrongly argued to keep `/public/ppdb` because "parents
search for PPDB". Not just a rename: *zonasi* → **domisili** route (plus
afirmasi/prestasi/mutasi), "peserta didik" → "murid". Use SPMB in all new
admissions copy. The public pages moved to `/public/spmb` in #439, with permanent
redirects from `/ppdb/*` and `/psb/*`.

**Standing rule the user agreed to:** Islamic/pesantren domain terms are never
translated in routes or labels — `tahfidz muhadhoroh muhadatsah muhasabah
ibadah takhosus simaan murojaah sanad syariah musyrif kitab-progress halaqoh`.
Anglicising them makes the product worse. Generic admin concepts follow the
app's predominantly-English route vocabulary, but visible labels stay
Indonesian.

The app-shell convention is in [`apps/web/AGENTS.md`](../../../apps/web/AGENTS.md).
