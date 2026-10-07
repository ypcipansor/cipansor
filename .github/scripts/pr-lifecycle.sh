#!/bin/sh
# Apply the pull-request lifecycle rules after a CI or E2E run finishes.
#
#   red CI on a ready PR            -> convert to draft, comment which checks failed
#   changes requested on a ready PR -> convert to draft, comment that it needs work
#   green CI on a draft PR          -> post the all-green comment (informational)
#   green CI on a ready PR, labels in sync, no changes requested
#                                   -> approve
#
# The draft decision after a revert is left to a human or the review automation:
# this script never marks a PR ready by itself.
#
# Usage: pr-lifecycle.sh <pr-number> <head-sha>
# Env:   GH_TOKEN, REPO (owner/name)
set -eu

PR="${1:?usage: pr-lifecycle.sh <pr-number> <head-sha>}"
SHA="${2:?head sha is required}"
REPO="${REPO:?REPO is required}"

GREEN_MARK="<!-- pr-lifecycle:green -->"
RED_MARK="<!-- pr-lifecycle:red -->"
CHANGES_MARK="<!-- pr-lifecycle:changes -->"

pr_field() { gh pr view "$PR" --repo "$REPO" --json "$1" --jq "$2"; }

STATE=$(pr_field state '.')
[ "$STATE" = "OPEN" ] || { echo "PR #$PR is $STATE; nothing to do."; exit 0; }
DRAFT=$(pr_field isDraft '.')
REVIEW=$(pr_field reviewDecision '.')
HEAD=$(pr_field headRefOid '.')

# A stale workflow_run can fire for an older commit; only act on the head.
if [ "$HEAD" != "$SHA" ]; then
  echo "Run is for $SHA but the PR head is $HEAD; skipping a stale run."
  exit 0
fi

# Classify every check on the head commit.
CHECKS=$(gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  --jq '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"' 2>/dev/null || true)
RED=$(printf '%s\n' "$CHECKS" | grep -E '	completed	(failure|timed_out|cancelled|action_required|startup_failure|stale)$' || true)
PENDING=$(printf '%s\n' "$CHECKS" | grep -vE '	completed	' | grep -v '^$' || true)
TOTAL=$(printf '%s\n' "$CHECKS" | grep -c . || true)

failed_names() { printf '%s\n' "$RED" | cut -f1 | sed 's/^/- `&`/' || true; }

comment_once() { # comment_once <marker> <body>
  if gh pr view "$PR" --repo "$REPO" --json comments --jq '.comments[].body' | grep -qF "$1"; then
    echo "Comment '$1' already present; not repeating."
    return 0
  fi
  gh pr comment "$PR" --repo "$REPO" --body "$2"
}

if [ "$REVIEW" = "CHANGES_REQUESTED" ]; then
  if [ "$DRAFT" != "true" ]; then
    gh pr ready "$PR" --repo "$REPO" --undo
    echo "PR #$PR has changes requested; converted to draft."
  fi
  comment_once "$CHANGES_MARK" "A reviewer requested changes on this PR, so it is back in **draft**.

Address every open review thread, push the fixes, then mark it ready for review again once CI is green. ${CHANGES_MARK}"
  exit 0
fi

if [ -n "$RED" ]; then
  if [ "$DRAFT" != "true" ]; then
    gh pr ready "$PR" --repo "$REPO" --undo
    echo "PR #$PR has failing checks; converted to draft."
  fi
  comment_once "$RED_MARK" "CI is red on this PR, so it is back in **draft**. Failing checks:

$(failed_names)

Get every check green, then mark it ready for review again. ${RED_MARK}"
  exit 0
fi

if [ -n "$PENDING" ] || [ "$TOTAL" -eq 0 ]; then
  echo "Checks for $SHA are still running (or none are reported yet); leaving the PR as it is."
  exit 0
fi

# Every check passed.
if [ "$DRAFT" = "true" ]; then
  comment_once "$GREEN_MARK" "All checks are green. This PR is a **draft**; mark it ready for review when the work is complete. ${GREEN_MARK}"
  echo "PR #$PR is green and still a draft."
  exit 0
fi

if [ "$REVIEW" = "APPROVED" ]; then
  echo "PR #$PR is green and already approved."
  exit 0
fi

# Labels must agree with the issue before approval. issue-label-sync.sh adds
# missing labels and fails on a real disagreement.
if ! sh "$(dirname "$0")/issue-label-sync.sh" "$PR"; then
  echo "Labels are out of sync; not approving PR #$PR."
  exit 0
fi

gh pr review "$PR" --repo "$REPO" --approve --body "All required checks are green and the labels match the linked issue. Approving automatically. ${GREEN_MARK}"
echo "Approved PR #$PR."
