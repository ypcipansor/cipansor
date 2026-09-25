# radix-scrollarea-thumb-stalls

> In the production Next build, Radix `ScrollArea` writes its thumb position once per scroll session — content at 100% while the thumb shows 3%. Swapping to native scrolling costs width; padding on the Root skews the track; and a rAF sampler can invent the bug.

Measured 2026-09-03 after a user report: "the menu is at the bottom but the
scrollbar is still in the middle, then it jumps".

**The finding.** In the production Next build, Radix `ScrollArea` (v1.2.18)
writes its thumb position **exactly once per scroll session**, on the first
`scroll` event. Its rAF tracking loop (`addUnlinkedScrollListener`) never runs
— zero `requestAnimationFrame` calls during the whole scroll. One continuous
wheel burst: `scrollTop` 4119 of 4119 (at the bottom) with the thumb at
**3.1%** of its track. Programmatic scrolling (`el.scrollTop = n`) updates it
correctly, because that path skips the loop. The same component bundled
outside Next tracks within 0.3 px, so the defect comes from the combination —
which is why `ScrollArea` was replaced only in the ~4,800 px sidebar menu, not
in its 19 other uses.

**Reproduce it the way the user did:** one burst. Three separated sessions let
the last one write at ~90% and the bug almost disappears.

**A second, separate defect: vertical padding on `<ScrollArea>`.** The
scrollbar is `position: absolute` inside the Root, so its `h-full` is measured
against the Root's **padding** box while the viewport fills the **content**
box. `py-4` makes the track 32 px taller than what it represents. Put the
padding on a div **inside**. Horizontal padding is harmless.

**Native scrolling costs width.** A native bar takes width from the content
box; Radix's floats over it. The super-admin menu needs **≥ 223 px** of
content width or a label wraps. `px-3` leaves 221 px ("Perencanaan & Tata
Kelola" breaks); `pr-1` leaves 229 px.

**A CSS trap inside it:** in current Chromium `scrollbar-width` wins over
`::-webkit-scrollbar`, so `width: 8px` in the webkit rule does nothing
(measured 10 px). The padding saved the width, not the 8 px — re-measure if
you change it.

`apps/web/src/components/ui/scroll-area.guard.test.ts` pins both defects.

**Measuring-tool warning.** Sampling the thumb inside a plain
`requestAnimationFrame` callback produced a convincing, thrice-repeated
"152 px drift" — pure callback order: the sampler ran first and compared this
frame's `scrollTop` with last frame's transform. Sample at **end of frame**
(`rAF(() => setTimeout(fn, 0))`): 0.3 px. Suspect any number that is exactly a
frame's worth.
