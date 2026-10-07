#!/bin/sh
# Sync a pull request's labels with the issue it closes, and fail when they
# cannot be reconciled.
#
# The PR and the issue must carry the same "shared" labels: the type labels
# (bug, enhancement, documentation, refactor, chore, security) and the priority
# label. Labels that describe the issue's own lifecycle (question, needs-info,
# duplicate, invalid, wontfix, blocked, ready, in-progress, ...) are not copied.
#
#   * missing shared labels are added to the PR
#   * a priority on the PR that contradicts the issue is corrected
#   * a genuine disagreement (a different type on the PR, an ambiguous issue
#     with two priorities) fails the check for a human or the review
#     automation to resolve
#
# Usage: issue-label-sync.sh <pr-number>
# Env:   GH_TOKEN, REPO (owner/name)
set -eu

PR="${1:?usage: issue-label-sync.sh <pr-number>}"
REPO="${REPO:?REPO is required}"

TYPE_LABELS="bug enhancement documentation refactor chore security"

labels_of() { # labels_of <pr|issue> <number> -> newline-separated label names
  gh "$1" view "$2" --repo "$REPO" --json labels --jq '.labels[].name'
}

# GitHub's own parse of "Closes #N" / "Fixes #N" in the body.
ISSUE=$(gh pr view "$PR" --repo "$REPO" --json closingIssuesReferences \
  --jq '.closingIssuesReferences[0].number // empty')

if [ -z "$ISSUE" ]; then
  echo "PR #$PR closes no issue; nothing to sync."
  exit 0
fi

PR_LABELS=$(labels_of pr "$PR")
ISSUE_LABELS=$(labels_of issue "$ISSUE")

has() { # has "<newline list>" <name>
  printf '%s\n' "$1" | grep -qxF "$2"
}

# Shared labels the issue carries: its types and its priority.
ISSUE_TYPES=$(printf '%s\n' "$ISSUE_LABELS" | grep -xF "$(printf '%s\n' $TYPE_LABELS)" || true)
ISSUE_PRIO=$(printf '%s\n' "$ISSUE_LABELS" | grep -x 'priority:.*' || true)
PR_TYPES=$(printf '%s\n' "$PR_LABELS" | grep -xF "$(printf '%s\n' $TYPE_LABELS)" || true)
PR_PRIO=$(printf '%s\n' "$PR_LABELS" | grep -x 'priority:.*' || true)

# An issue may carry only one type and one priority; more than one is ambiguous
# and the automation that labelled it has to be corrected.
ISSUE_TYPE_COUNT=$(printf '%s\n' "$ISSUE_TYPES" | grep -c . || true)
ISSUE_PRIO_COUNT=$(printf '%s\n' "$ISSUE_PRIO" | grep -c . || true)
if [ "$ISSUE_TYPE_COUNT" -gt 1 ] || [ "$ISSUE_PRIO_COUNT" -gt 1 ]; then
  echo "::error::Issue #$ISSUE has more than one type or priority label; the sync cannot tell which to copy."
  exit 1
fi

FAIL=0

# A PR type that contradicts the issue's type is a real disagreement: the PR is
# doing something the issue does not describe. Report it, do not guess.
if [ -n "$ISSUE_TYPES" ] && [ -n "$PR_TYPES" ] && [ "$PR_TYPES" != "$ISSUE_TYPES" ]; then
  echo "::error::PR #$PR is labelled '$PR_TYPES' but issue #$ISSUE is '$ISSUE_TYPES'. Fix the type on whichever is wrong."
  FAIL=1
fi

ADD=""
for l in $ISSUE_TYPES $ISSUE_PRIO; do
  has "$PR_LABELS" "$l" || ADD="$ADD,$l"
done
[ -n "$ADD" ] && gh pr edit "$PR" --repo "$REPO" --add-label "${ADD#,}"

# A stale priority on the PR (different from the issue's) is corrected.
if [ -n "$ISSUE_PRIO" ] && [ -n "$PR_PRIO" ] && [ "$PR_PRIO" != "$ISSUE_PRIO" ]; then
  echo "Correcting PR priority '$PR_PRIO' -> '$ISSUE_PRIO' (from issue #$ISSUE)."
  gh pr edit "$PR" --repo "$REPO" --remove-label "$PR_PRIO" --add-label "$ISSUE_PRIO"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "Label sync failed. See the errors above."
  exit 1
fi

echo "PR #$PR labels are in sync with issue #$ISSUE (${ISSUE_TYPES:-no type} ${ISSUE_PRIO:-no priority})."
