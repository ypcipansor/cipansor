#!/bin/sh
# Warn on a `duplicate` issue, then close it if nothing changes within the grace
# period. Re-run daily by duplicate-sweep.yml.
#
# For each open issue labelled `duplicate`:
#   * no warning comment yet          -> post the warning, record the timestamp
#   * warning present, still labelled -> if older than GRACE_DAYS, close it
#   * `duplicate` label removed       -> nothing (the sweep only sees the label)
#
# The warning timestamp is read back from the marker in the comment, so the
# script holds no state between runs.
#
# Usage: duplicate-sweep.sh
# Env:   GH_TOKEN, REPO, GRACE_DAYS (default 7)
set -eu

REPO="${REPO:?REPO is required}"
GRACE_DAYS="${GRACE_DAYS:-7}"
MARK="<!-- duplicate-sweep:warned -->"

NOW=$(date -u +%s)
ISSUES=$(gh issue list --repo "$REPO" --state open --label duplicate --limit 200 --json number --jq '.[].number')

for n in $ISSUES; do
  # The issue's own comments, newest first.
  COMMENTS=$(gh api "repos/$REPO/issues/$n/comments?per_page=100" \
    --jq '.[] | "\(.created_at)\t\(.body | gsub("\n"; " "))"' 2>/dev/null || true)
  WARNED_AT=$(printf '%s\n' "$COMMENTS" | grep -F "$MARK" | tail -1 | cut -f1 || true)

  if [ -z "$WARNED_AT" ]; then
    gh issue comment "$n" --repo "$REPO" --body "This looks like a **duplicate** of an issue already open or closed. It will be closed automatically in $GRACE_DAYS days unless it is shown to be distinct — edit the issue, or reply with why it is not a duplicate.

If a maintainer agrees it is distinct, removing the \`duplicate\` label cancels the close. $MARK"
    echo "Warned on #$n."
    continue
  fi

  AGE=$(( (NOW - $(date -u -d "$WARNED_AT" +%s)) / 86400 ))
  if [ "$AGE" -lt "$GRACE_DAYS" ]; then
    echo "#$n warned ${AGE}d ago; within the ${GRACE_DAYS}d grace period."
    continue
  fi

  # Any activity after the warning means the reporter responded; give it to a
  # human instead of closing on top of a reply.
  LAST_ACTIVITY=$(gh issue view "$n" --repo "$REPO" --json comments --jq '.comments[-1].createdAt // empty')
  if [ -n "$LAST_ACTIVITY" ] && [ "$LAST_ACTIVITY" != "$WARNED_AT" ]; then
    echo "#$n has activity after the warning; leaving it open for a maintainer."
    continue
  fi

  gh issue close "$n" --repo "$REPO" --reason "not planned" \
    --comment "Closing as a duplicate: no response in $GRACE_DAYS days. Reopen if it is in fact distinct. $MARK"
  echo "Closed #$n as a stale duplicate."
done
