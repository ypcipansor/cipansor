# Radix components default to left-to-right

> `<html dir="rtl">` does not reach a Radix component: Tabs, Select,
> RadioGroup, ToggleGroup and their kin set `dir="ltr"` on themselves unless
> told otherwise, and that attribute wins for everything inside them.

Found 2026-10-03 on the public SPMB page (#642). The Arabic page was right to
left in the navbar and the hero, and left to right from the form's tabs
downward: the "Gelombang" column on the left, the tabs ordered TK → SMA from
the left. The served HTML showed `<html lang="ar" dir="rtl">` and, a few
elements further down, `<div dir="ltr" data-slot="tabs">`. Radix reads its
direction from a `DirectionProvider`, not from the document; with no provider
it falls back to `"ltr"` and writes it out.

## What to do

- A Radix component on a page that can be Arabic takes `dir={dirFor(locale)}`
  (`@/locales`), and so does the section that holds it when a component
  around it may have forced `ltr` (the SPMB form's own tabs wrap the intakes).
- Test it: assert the attribute, not the look —
  `querySelector('[data-slot="tabs"]').getAttribute("dir") === "rtl"`.
  The tablist itself carries no `dir`; the root does.
- If a second public page needs it, wrap the public layout in Radix's
  `DirectionProvider` instead of passing `dir` component by component. On
  2026-10-03 the SPMB page was the only public page using a direction-aware
  Radix component, so the prop was the smaller change.

## How it hides

The text inside reads correctly — Arabic glyphs are laid out right to left by
the browser whatever `dir` says — so only the **order** of columns, tabs and
alignment is wrong. A glance at a screenshot passes it; compare where the
first column sits.
