# mobile-layout-audit

> `document.scrollWidth === clientWidth` does not mean the page fits: the app shell's `<main>` is itself a scroller. The ancestor-walk test that does work, and the three shapes that broke 14 of 20 routes at 390 px.

In the portal the shell's `main.flex-1.overflow-auto` is a scroll container,
so an over-wide toolbar scrolls *inside* `<main>` instead of widening the
document. The page reports no horizontal overflow while content slides
sideways under a fixed header, and every naive "no horizontal scrollbar"
check passes. That is how 14 of 20 top-level routes were broken at 390 px on
2026-08-14 with nobody noticing.

## The test that works

For each element whose `right` exceeds the viewport — skipping
`position: fixed`, and skipping elements whose parent also overflows, so only
the outermost cause is reported — walk up the ancestors to the first
`overflow-x: auto|scroll` (a scroller) or `overflow-x: hidden` (a clip):

- a **local** wrapper (`div.relative.w-full.overflow-x-auto` around a table) →
  fine, that is the right pattern;
- `<main>` / `<body>` / the document element → **broken**, the whole content
  area drags sideways;
- `overflow-x: hidden` → **clipped**, permanently unreachable.

Match the scroller on `tagName === 'MAIN'`, not `document.querySelector('main')`
— the root layout has its own outer `<main id="main-content">`, and that one
mistake made two audit batches report clean.

**Sweeping many routes cheaply:** same-origin hidden iframes at 390×844 from
an already signed-in tab, ~2 s to settle each, reading `contentDocument`.

## What was wrong (fixed in #401), all below 640 px

1. **Page headers** — `flex items-center justify-between` cannot wrap, so the
   action buttons ran off. 116 occurrences in 94 files, one shape. The
   replacement `flex flex-col gap-4 sm:flex-row sm:items-center
   sm:justify-between` is **a no-op at ≥640 px by construction** — the `sm:`
   variants restore exactly the three properties replaced — which is what made
   a 116-site sweep safe without eyeballing each.
2. **`TabsList`** — sized by its labels. Now `max-w-full overflow-x-auto` and
   `justify-start`. The `justify` change is the load-bearing half: a centred
   row that overflows spills past *both* edges, and the browser cannot scroll
   to a negative offset, so the first tab becomes unreachable.
3. **`Pagination`** (every `DataTable`) — its two halves need ~440 px side by
   side.

The public site and the data tables were already right — don't "fix" them.
