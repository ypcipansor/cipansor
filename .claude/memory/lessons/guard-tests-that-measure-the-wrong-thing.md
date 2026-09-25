# guard-tests-that-measure-the-wrong-thing

> A green test that measures a proxy instead of the property: presence instead of function, a walker that skips the root, pinned copy, the fix instead of the effect, a test that asserts the bug, text against text, fuzzing against a reference that shares the bug. The one question that catches all of them.

**The question to ask of every guard: what would have to change in the world
for this test to go red?** If the answer is "a comment", "a line of source" or
"a sentence of copy", it is not a guard.

## Presence is not function

A guard for the skip link checked `/<main[\s>]/` — "every page has a
`<main>`". Green; in production the landing page's `<main>` had **no id**, and
`SkipLink` (`getElementById` after `preventDefault`) became dead — worse than
the bug being fixed. Count the thing that ties the two together:
`<main\b[^>]*\bid="main-content"` exactly once, plus the invariant that every
`<main>` under `src/` carries the id.

## The walker never visited the root

A directory walker that only looked at `page.tsx` inside **sub**directories
never saw `src/app/page.tsx` — the one page that broke was outside the test's
universe. Start with the directory's own file, then recurse. The same shape:
menu guards that flattened one level went blind when submenus appeared
([rbac-nav-contract](./rbac-nav-contract.md)).

## A test that pins copy defends the lie

An e2e asserted the card title "AI-Driven Succession Recommendations" — the
very claim a PR removed because a weighted sum is not AI. The test failed *for
being right*, and the easy way past it was to put the lie back. Assert the
control, the role or the behaviour, not the sentence. When copy *is* the
invariant, invert it into a source guard that forbids the bad string (here:
"AI" may appear on those screens only within 40 characters after "bukan"),
and strip comments before matching, or the comment explaining the rule breaks
it.

## A guard that asserts the fix, not the effect

`dynamicParams = false` plus a test asserting the line existed — while the
page still answered 200 ([nextjs-loading-boundary-commits-200](./nextjs-loading-boundary-commits-200.md)).
**When the symptom is an HTTP status, the guard asserts the HTTP status.**

## A test that asserts the bug as correct behaviour

- **E-sign (#449).** Requesting a signing key demanded an already-verified
  identity; verification only happened when a request was decided. Nobody
  could ever obtain a key, so every signed naskah, the archive, verification
  and revocation were unreachable. 1,399 tests were green, and one was titled
  "rejects a request when the data is complete but unverified" — it asserted
  the deadlock. Each test checked half the chain against its own expectation.
  Found by walking the chain on a running system: three requests.
- **PK (#415), self-inflicted.** A new guard refused a PK with no supervisor;
  creating a subordinate PK required the supervisor's approved PK; approval
  required a proposed PK. The yayasan organs have no supervisor in the system,
  so the root of the chain could never be proposed — **no PK anywhere could be
  created**. 1,671 tests green.

**The reusable rule:** for every guard that demands a *precondition*, ask what
satisfies it for the **first** element of the chain. If the answer is "the
element before it", the chain has no root and the module is dead. A chain
across two modules needs a test across two modules
(`esign.identity-chain.test.ts`), and the business process run through the API
on an isolated stack finds what reading code does not.

## Text against text

`decommissioned-modules.guard.test.ts` once compared a number read from a
migration's **header comment** with a number pinned in the test itself. If the
real FK closure moved, it stayed green; text never met the catalog. Take the
evidence from what is actually deployed (`0_init`'s tables, unique indexes and
FKs), and pin what makes the number true (here, the order of the migration
folders).

## Fuzzing against a reference inherits the reference's blindness

A PR claimed its sanitizer passed "300k random inputs, 0 mismatches" against a
naive reference. 2,189 of those outputs still carried a live `<tag>`: the
reference modelled quotes with the same wrong assumption, so both were wrong
together. **Fuzz against an invariant**, not against a copy of yourself: no
output may match `/<[a-zA-Z\/!?][^<>]*>/`, and real text must come out
unchanged. The property test is pinned in `email-transport.test.ts`.

## A distinction the server makes and no screen shows

The API distinguished "assistant busy" (503, `CHATBOT_BUSY`, `Retry-After`)
from "assistant down", with tests. The widget caught every error in one
`catch {}` and printed one sentence. A test of `isBusyError()` would be green
too — the function is right; nothing calls it. Render the widget and assert the
sentence the visitor reads, with the opposite case. Ask of every API change:
*who reads the message I just wrote?*

## A detector calibrated on invented examples

"If the model cites a source, it answered" looked robust, and its test was
green. One real call killed it: the persona tells the model to list topics and
the contact page *when it refuses*, so refusals cite sources too. Tests for such
detectors use **sentences the model actually wrote** (`refusal.test.ts`).

## E2E assertions that test the shell

`getByRole("heading", { name: /keuangan|finance/ })` after opening `/finance`
was green for months because the **sidebar group** "Keuangan" is on every page;
the page is titled "Tagihan & SPP". Scope assertions to `<main>`. Also: a
`test.skip("No students")` guard skipped two tests on every CI run because the
page was broken — **read the skipped count and names**, not only "0 failed";
and a `waitForToast` helper used 22 times looked for `role="status"`, which the
toast library does not render, so it never found any toast.

## E2E that fails on a random spec each run

Three CI runs failed three different specs. The cause was one pattern in 15
specs: reading the DOM while the shell bounced to `/login` before the auth
store rehydrated, which only happens under load. `e2e/helpers/page-state.ts`
(`settledContent`) retries until the document settles; `page-state-helper.spec.ts`
forces the bounce to prove it. Retrying does not weaken the assertion — a page
settled on `/login` still fails the caller's URL check.

## The tools lie too

- `cmd | tail -20; st=$?` captures `tail`'s status. Capture first.
- `head -30` cut a findings list and hid the one remaining offender.
- A JSDoc block containing `{/* … */}` closes itself at the first `*/`; vitest
  then reports **"no tests"**, not a failure — a "red on main, green on the
  branch" proof over an unparsed file is void. Read how many tests *ran*.
- A rAF sampler invented a 152 px drift, stable across three runs; systematic
  bias is stable too ([radix-scrollarea-thumb-stalls](./radix-scrollarea-thumb-stalls.md)).
- A `401` does not prove a route exists — `router.use(authenticate)` answers
  before routing. Knock with a valid token.
- A claim in a PR body ("`findAll` now filters by status") was never committed.
  Every "X now does Y" needs a line in `git show <commit> --stat` and a test of
  the **effect**. A behaviour script run against the running system caught it
  — after first being run against the old build to prove it could go red.

When a tool gives the good news you wanted, that is the moment to check the
tool.

## A stale test that sides with the status quo

A test titled "gives the same message for a missing and a rejected Turnstile
token" was right about the old code and blocked the fix that told blocked
visitors something useful. Replace it with a test stating the new behaviour
and why; do not loosen it until both pass. A red test that blocks a fix is an
old decision asking for review.

## One fact in two places

When one fact is written in two files with no type binding them (a Turnstile
action name in `apps/web` and in `apps/api`), bind them with a test that reads
both files and requires the sets to be equal **in both directions**
(`middleware/turnstile-actions.contract.test.ts`). Prove it red by changing one
side.

## The rule

**Prove a guard red against the exact tree you are about to ship**, not
against a hand-made counterexample. Keep the new test and revert only the fix:

```
git add -A                                        # safety net first
git stash push -q -- apps/web/src/app apps/web/src/components
pnpm vitest run <file> -t '<the new describe>'
git stash pop -q
```

Or read the old tree without touching yours: run the predicates over
`git show main:<path>`. See [git-checkout-path-destroys-uncommitted](./git-checkout-path-destroys-uncommitted.md)
before restoring anything.
