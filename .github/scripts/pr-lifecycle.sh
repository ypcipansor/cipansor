#!/bin/sh
# Apply the pull-request lifecycle rules after a CI, E2E or review run finishes.
#
#   red checks on a ready PR      -> convert to draft, comment which checks failed
#   changes requested on a PR     -> convert to draft, comment that it needs work
#   green checks on a draft PR    -> post the all-green comment (informational)
#   green checks on a ready PR    -> leave it alone
#
# This script never approves and never merges. Approval is the review gate's job
# (SDLC 22), which reads the diff; an automated approval from here could bless an
# unreviewed change, so the lifecycle guard only preserves the draft/ready state.
# The draft decision after a revert is likewise left to a human or that gate:
# this script never marks a PR ready by itself.
#
# Usage: pr-lifecycle.sh <pr-number> <head-sha>
# Env:   GH_TOKEN, REPO (owner/name)
set -eu

PR="${1:?usage: pr-lifecycle.sh <pr-number> <head-sha>}"
SHA="${2:?head sha is required}"
REPO="${REPO:?REPO is required}"

LIFE_MARK="<!-- pr-lifecycle:"
GREEN_MARK="<!-- pr-lifecycle:green -->"
CHANGES_MARK="<!-- pr-lifecycle:changes -->"

# Every lifecycle comment carries the AI-disclosure footer. A comment-triggered
# automation cannot otherwise tell an automated comment from a reporter's, and
# would treat "CI is red ..." as a fresh human request and re-arm (#680). The
# footer is also what the duplicate-sweep reply scan looks for.
AI_FOOTER="_This comment was created by an AI agent (OpenHands) on behalf of the maintainer._"

# The checks that make up the required gate. A green result only counts as
# "everything passed" when every one of these is present and successful on the
# tested commit - a subset (E2E has not started, or the API truncated a page)
# must never be mistaken for the full gate.
#
# Note the two definitions of "green" GitHub and this script use. A job skipped
# by its own `if:` (a docs-only PR reports `scope.run=false`, so
# Lint/Build/Tests/Security/E2E are skipped) still satisfies a *required status
# check* on GitHub - a skipped job reports success. This script is stricter: it
# requires each check to be present and `conclusion=success`, so a docs-only PR
# never reaches the all-green notice. That is intentional - the notice means "the
# full gate ran and passed", and a documentation change cannot satisfy it in any
# useful sense.
REQUIRED_CHECKS="${REQUIRED_CHECKS:-CI scope|Lint|Build|Tests|Security|E2E scope|E2E Tests (Chromium)}"

# Suites that publish a check run on every PR whose workflow ran. A signature
# with no check run on the tested commit means that workflow has not started (or
# its run is not yet associated with this commit), so a green subset must not be
# mistaken for the full gate even when every check seen so far passed. Only
# checked-in workflows publish checks: `CI scope` (ci.yml) and `E2E scope`
# (e2e-tests.yml). Analyze / CodeQL are code scanning, not workflow checks, so
# requiring them here would block the all-green notice forever.
KNOWN_SUITE_SIGNS="${KNOWN_SUITE_SIGNS:-CI scope|E2E scope}"

pr_field() { gh pr view "$PR" --repo "$REPO" --json "$1" --jq ".$1"; }

STATE=$(pr_field state)
[ "$STATE" = "OPEN" ] || { echo "PR #$PR is $STATE; nothing to do."; exit 0; }
DRAFT=$(pr_field isDraft)
REVIEW=$(pr_field reviewDecision)

# Checks are evaluated against the commit the workflows actually ran on. In this
# repository the CI and E2E workflows publish their check runs against the PR's
# source head SHA (which is also `workflow_run.head_sha`); the synthetic
# `pull_request` merge commit carries no check runs at all. Query the head SHA,
# and fall back to the reported merge commit only if the head yields nothing, so
# the script adapts if that ever changes.
merge_sha() { pr_field potentialMergeCommit; }

# A stale workflow_run can fire for an older commit; only act when this run is
# for the PR's current head (a merge-commit run names the source head_sha too).
HEAD=$(pr_field headRefOid)
if [ "$HEAD" != "$SHA" ]; then
  echo "Run is for $SHA but the PR head is $HEAD; skipping a stale run."
  exit 0
fi

# Fetch the check runs for the tested commit once (the head SHA in this
# repository, falling back to the reported merge commit only if the head has
# none), then keep the *latest* run of every check name. Grouping by name rather
# than position is what lets a re-run supersede an earlier cancelled or failed
# result: a positional `.[-1]` kept the last run of the *list*, so a replaced
# failure was still reported.
CHECKS_JSON=""
for cand in "$SHA" "$(merge_sha)"; do
  [ -n "$cand" ] && [ "$cand" != "null" ] || continue
  # --paginate prints one JSON document per page; jq -s slurps them into one
  # array of responses and .[].check_runs combines every page, so a head with
  # more than 100 check runs (reruns) is not silently discarded when a single
  # count cannot be compared.
  CHECKS_JSON=$(gh api --paginate "repos/$REPO/commits/$cand/check-runs?per_page=100" 2>/dev/null | jq -s '[.[].check_runs[]]' 2>/dev/null || true)
  if [ "$(printf '%s' "$CHECKS_JSON" | jq 'length' 2>/dev/null || echo 0)" -gt 0 ]; then
    CHECK_SHA="$cand"
    break
  fi
  CHECKS_JSON=""
done
CHECK_SHA="${CHECK_SHA:-$SHA}"

# name<TAB>status<TAB>conclusion for the latest run of each check name.
LATEST=$(printf '%s' "$CHECKS_JSON" | jq -r '
  (if type == "array" then . else [] end) | sort_by(.started_at, .id) | group_by(.name) | map(.[-1])[]
  | "\(.name)\t\(.status)\t\(.conclusion // "")"' 2>/dev/null || true)
# RED is restricted to the gate checks. The check-run API returns every run on
# the commit, including advisory workflows (the PR-description reminder) and
# third-party checks. Drafting a PR because an advisory reminder failed would
# contradict the gate definition above, so only a failed check whose name is one
# of REQUIRED_CHECKS counts. Matching is exact on the names in REQUIRED_CHECKS.
RED=$(printf '%s\n' "$LATEST" \
  | awk -F'\t' -v req="$REQUIRED_CHECKS" '
      BEGIN { n = split(req, a, "|"); for (i = 1; i <= n; i++) want[a[i]] = 1 }
      NF && $2 == "completed" && $3 ~ /^(failure|timed_out|action_required|startup_failure|stale)$/ && ($1 in want) { print }' || true)
printf '%s\n' "$LATEST" \
  | awk -F'\t' -v req="$REQUIRED_CHECKS" '
      BEGIN { n = split(req, a, "|"); for (i = 1; i <= n; i++) want[a[i]] = 1 }
      NF && $2 == "completed" && $3 ~ /^(failure|timed_out|action_required|startup_failure|stale)$/ && !($1 in want) { print "Ignoring non-gate check \x27" $1 "\x27 when deciding to draft the PR." }' || true
# PENDING: a latest run still running, or finished with a conclusion this gate
# does not call green (a cancelled run whose replacement has not appeared yet).
PENDING=$(printf '%s\n' "$LATEST" \
  | awk -F'\t' 'NF && ($2 != "completed" || $3 !~ /^(success|failure|timed_out|action_required|startup_failure|stale|neutral|skipped)$/)' || true)
PRESENT=$(printf '%s\n' "$LATEST" | awk -F'\t' 'NF {print $1}' || true)

# True when every required check is present on the tested commit. A skipped
# check reports success for the required gate (a docs-only PR skips Lint, Build,
# Tests, E2E) but must still be *present*, so an early subset (E2E not started
# yet) is not mistaken for the full gate. IFS is newline so names with spaces
# stay intact.
required_present() {
  _ifs=$IFS
  IFS='
'
  set -f
  for want in $(printf '%s\n' "$REQUIRED_CHECKS" | tr '|' '\n'); do
    printf '%s\n' "$PRESENT" | grep -qxF "$want" || { IFS=$_ifs; set +f; return 1; }
  done
  IFS=$_ifs
  set +f
  [ "$(printf '%s\n' "$REQUIRED_CHECKS" | grep -c .)" -gt 0 ]
}

failed_names() { printf '%s\n' "$RED" | awk -F'\t' 'NF {print "- `" $1 "`"}'; }

# True when a check from every known suite is present. Together with
# required_present this rejects a green subset: a suite that has not published
# its check run yet (E2E only starts after CI, so early on it is absent) keeps
# the decision pending rather than green.
known_suites_seen() {
  _ifs=$IFS
  IFS='
'
  set -f
  for _sign in $(printf '%s\n' "$KNOWN_SUITE_SIGNS" | tr '|' '\n'); do
    [ -n "$_sign" ] || continue
    printf '%s\n' "$PRESENT" \
      | awk -v s="$_sign" 'index($0, s) == 1 { found = 1 } END { exit !found }' \
      || { IFS=$_ifs; set +f; return 1; }
  done
  IFS=$_ifs
  set +f
  return 0
}

# Post exactly one lifecycle comment and keep it current. The PR carries at most
# one comment whose body contains LIFE_MARK; it is rewritten when the state (the
# dedupe token) changes, and left alone when it does not, so a new commit that
# fails different checks replaces the stale list instead of being suppressed by
# an existing marker. The token is embedded in the body so a repeat of the same
# state is recognised.
comment_once() { # comment_once <body> <dedupe-token>
  body="$1"; token="$2"
  # The footer is appended here, once, so every message carries it and the
  # dedupe comparison below sees the same text that is posted.
  body="$body

$AI_FOOTER"
  # The REST comments list gives each comment's numeric database id; the GraphQL
  # node id from `gh pr view --json comments` is rejected by
  # repos/.../issues/comments/{id}, so the GET and PATCH below must use this id.
  # Newest marker first: a comment the workflow cannot edit (posted by another
  # actor) must not be retried forever while a fresh notice stacks up each run.
  # Editing the newest editable one keeps a single current comment.
  ids=$(gh api --paginate "repos/$REPO/issues/$PR/comments?per_page=100" \
    --jq ".[] | select(.body | contains(\"$LIFE_MARK\")) | .id" 2>/dev/null \
    | awk '{ a[NR] = $0 } END { for (i = NR; i >= 1; i--) print a[i] }' || true)
  for id in $ids; do
    old=$(gh api "repos/$REPO/issues/comments/$id" --jq .body 2>/dev/null || true)
    if [ "$old" = "$body" ]; then
      echo "Lifecycle comment already current ('$token'); not repeating."
      return 0
    fi
    if gh api "repos/$REPO/issues/comments/$id" -X PATCH -f body="$body" >/dev/null 2>&1; then
      echo "Updated lifecycle comment ('$token')."
      return 0
    fi
  done
  echo "No editable lifecycle comment ('$token'); posting a fresh one."
  gh pr comment "$PR" --repo "$REPO" --body "$body"
}

if [ "$REVIEW" = "CHANGES_REQUESTED" ]; then
  if [ "$DRAFT" != "true" ]; then
    gh pr ready "$PR" --repo "$REPO" --undo
    echo "PR #$PR has changes requested; converted to draft."
  fi
  comment_once "A reviewer requested changes on this PR, so it is back in **draft**.

Address every open review thread, push the fixes, then mark it ready for review again once CI is green. ${CHANGES_MARK}" "changes-requested"
  exit 0
fi

if [ -n "$RED" ]; then
  if [ "$DRAFT" != "true" ]; then
    gh pr ready "$PR" --repo "$REPO" --undo
    echo "PR #$PR has failing checks; converted to draft."
  fi
  SIG=$(printf '%s\n' "$RED" | cut -f1 | sort | tr '\n' ',' | sed 's/,$//')
  comment_once "CI is red on this PR, so it is back in **draft**. Failing checks:

$(failed_names)

Get every check green, then mark it ready for review again. <!-- pr-lifecycle:red:$SIG -->" "red:$SIG"
  exit 0
fi

# Require the full set, not just a nonempty one: a green subset (an early CI
# finish before E2E has published its checks) is still pending.
if [ -n "$PENDING" ] || [ "$(printf '%s\n' "$LATEST" | grep -c .)" -eq 0 ] \
  || ! required_present || ! known_suites_seen; then
  echo "Checks for $CHECK_SHA are not all green yet; leaving the PR as it is."
  exit 0
fi

# Every required check passed. The lifecycle guard has nothing left to do: it
# does not approve (that is the review gate's job) and does not mark a draft
# ready.
if [ "$DRAFT" = "true" ]; then
  comment_once "All checks are green. This PR is a **draft**; mark it ready for review when the work is complete. ${GREEN_MARK}" "green"
  echo "PR #$PR is green and still a draft."
  exit 0
fi

echo "PR #$PR is green and ready. Leaving approval to the review gate."
