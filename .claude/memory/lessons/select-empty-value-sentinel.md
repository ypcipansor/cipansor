# select-empty-value-sentinel

> Our `Select` wrapper maps `""` to a private sentinel so an "All" item can use `""`. A Select that passes `""` with no such item shows a blank box, not its placeholder. `value={x || undefined}` hides that and breaks resets: the Select turns uncontrolled. And a form of Selects filled by `form.reset` after mount lost its values — build the form after the data.

Found 2026-09-26 on the guru pengampu and musyrif pickers (#573), and
misdiagnosed there.

**What happens.** Radix Select (2.3.7) shows the placeholder for `""` *and*
for `undefined` (`shouldShowPlaceholder` in its source). Radix forbids
`<SelectItem value="">`, so `components/ui/select.tsx` maps `""` to
`"__empty__"` on the way in (Root value and Item value) and back on the way
out. That is right for a filter with an "All" item. For a Select with no such
item, Radix receives `"__empty__"`, which matches nothing, and the trigger
renders empty: no placeholder, no label.

**The tempting fix is wrong.** `value={x || undefined}` brings the placeholder
back because the wrapper passes `undefined` through. But `undefined` makes the
Select **uncontrolled**: Radix keeps its own last value. Set the parent state
back to `""` (a search box that clears the choice, a form reset while the
dialog stays open) and the trigger keeps showing the old choice while the
state is empty. #573 shipped this in two pickers, with a comment blaming Radix.

**What to do instead.** Fix the wrapper, not the call site: send `""` to Radix
as the sentinel only when the Select contains an item whose value is `""`. A
test must cover all three cases: `""` with no empty item shows the
placeholder; `""` with an "All" item shows "All"; a controlled value changed
from `"a"` back to `""` shows the placeholder again.

**Before blaming a library, read its source** (`node_modules/<pkg>/dist`)
and our wrapper around it. Here the library was right and the wrapper was the
cause. The e2e assertion that "proved" the diagnosis (`Received: ""`) was
correct about the symptom and silent about the cause.

## A controlled Select filled by `form.reset` after mount

The TK edit page (`tk/daily-reports/[id]/edit`) mounted its form empty and
called `form.reset(report)` when the report arrived. On submit, the mood and
meal fields held `""` — not an option — and the pupil and class were empty,
so the form could never pass its own validation (seen 2026-09-27 in #577's
e2e). The cause was not isolated (Radix's hidden native `<select>` is the
suspect); what fixed it was not resetting: render the form only once the data
is loaded, with the data as `defaultValues`, and key it on the record's id.
