# automation-self-trigger-loop

> An event automation whose trigger condition is "a new comment exists" will
> satisfy that condition with its own comment and re-arm itself. Once that
> happened, a single fixture produced six back-to-back LLM runs, each one
> triggered by the previous run's output.

A comment-triggered automation and its own output are indistinguishable unless
the trigger is written to tell them apart. The defect is not in the comments;
it is in the trigger.

1. **An automation's comment satisfies an `issue_comment.created` trigger.** A
   second condition on a label ("the issue carries the label that asks for a
   reply") does not help: the label persists, so the automation's own comment
   still satisfies both halves. Removing the label stops the loop, but only
   until the next honestly labelled issue — a mitigation, not a fix.

2. **The comment author is not a usable discriminator when the automation
   posts as a human account.** The automation posted through the same GitHub
   account as the reporter, with `user.type == 'User'`, so neither
   `sender.login` nor `sender.type == 'Bot'` marks it. The exclusions that do
   work, in order of robustness:

   - **Post from a dedicated bot account, then exclude it:**
     `sender.login != '<bot-account>'`. The trigger then depends on nothing
     about the comment's wording, and no later edit to a comment template can
     silently un-guard it.
   - **Exclude by the AI footer** every automated comment already carries:
     `!icontains(comment.body, 'created by an AI agent')`. No account change.
     Pin the substring to the **actual** footer an automated comment emits — a
     filter keyed on a remembered paraphrase of it matches nothing and fixes
     nothing.
   - **Trigger on the transition, not on the state.** Fire on `issues.labeled`
     and require the label that was *just applied* — `label.name == '<label>'`
     (the event's own `label`, not the issue's `labels[]`). A filter that only
     asks "is the label somewhere on the issue" (`contains(issue.labels[].name,
     '<label>')`) fires again on every later label event — adding any other
     label, or re-applying this one — for as long as the label stays.

3. **Do not rely on a human to stop it.** The re-check is a full LLM
   conversation per run; the cost is unbounded until someone removes the label
   by hand. The trigger must be self-limiting by construction.

**Monotonic, or it does not count.** A guard breaks a self-trigger loop only if
the thing it tests never returns to true on its own. An author exclusion and a
footer exclusion are monotonic. A label-presence test is not: the label survives
every comment, so the trigger stays armed and any later label event re-fires it.
Prefer the first two; if a transition trigger is wanted, key it on the event's
own `label`.

**Where the definition lives.** These are OpenHands event automations, not
files under git — a grep of `.github/`, `docs/`, `scripts/` and `.claude/` for
the trigger terms finds no definition. The change is a filter edit in the
automation backend (OpenHands automations API), outside this repository; a repo
PR can record the rule but cannot apply it. Read a candidate automation's
trigger with `GET /api/automation/v1/{id}`, dry-run the filter against a sample
payload with `POST /api/automation/v1/validate` (works without spending an LLM
run), and only then re-enable it.

**Why it matters:** one fixture cost six runs, and any comment-triggered
automation that can satisfy its own condition can consume unbounded runs.
**How to apply:** before enabling a comment-triggered automation, ask what its
own output does to the trigger; if the output satisfies it, add a monotonic
exclusion (a bot account or the AI footer) — never ship the trigger unfiltered
and rely on someone noticing.
