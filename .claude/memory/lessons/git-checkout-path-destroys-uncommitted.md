# git-checkout-path-destroys-uncommitted

> `git checkout -- <file>` restores from the INDEX, so it erases edits you never `git add`ed — `git add -A` before a mutation test, or an hour of work goes without a warning.

Mutation testing here means: break the code on purpose, watch the guard fail,
restore the file ([guard-tests-that-measure-the-wrong-thing](./guard-tests-that-measure-the-wrong-thing.md)).
On 2026-09-04 the restore step, `git checkout -q -- <file>`, **erased an hour
of work**: the file had edits that were never staged, and `git checkout --`
restores from the index, which still held HEAD's version. No warning, no
prompt, and `git status` looked normal afterwards.

**The safe pattern, run BEFORE the first mutation:**

```
git add -A          # the index is now my work; checkout restores to HERE
<mutate> && <test> ; git checkout -q -- <file>
```

Here `git add -A` is not preparing a commit — it is the safety net. It turns
`git checkout --` from "throw away my work" into "undo my mutation". The same
holds for `git restore <file>` (without `--staged`) and
`git checkout <commit> -- <file>`.

**Two-second check before pressing enter:** `git status --short`. A marker in
the **second** column (` M`) means unstaged — restoring that file erases its
changes. A marker in the first column (`M `) is safe.

**Symptom if it already happened:** the compiler complains about a symbol you
"just wrote" (`Cannot find name 'splitCitedSources'`) while the file looks
whole. That is not an import error; the file is back to its old version.
