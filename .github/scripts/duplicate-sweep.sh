#!/bin/sh
# Warn on a `duplicate` issue, then close it if nothing changes within the grace
# period. Re-run daily by duplicate-sweep.yml.
#
# For each open issue labelled `duplicate`:
#   * no warning comment yet          -> post the warning, record the timestamp
#   * warning present, still labelled -> if older than GRACE_DAYS, close it
#   * `duplicate` label removed       -> nothing (the sweep only sees the label)
#
# "Show it is not a duplicate" means the reporter did something a maintainer can
# weigh: edited the issue body, or replied to the warning. The warning timestamp
# is read back from the marker in the comment, so the script holds no state
# between runs. The issue's own updatedAt is used for the edit (a comment also
# bumps it, so the edit is only the update that no comment accounts for).
#
# Usage: duplicate-sweep.sh
# Env:   GH_TOKEN, REPO, GRACE_DAYS (default 7)
set -eu

REPO="${REPO:?REPO is required}"
GRACE_DAYS="${GRACE_DAYS:-7}"
MARK="<!-- duplicate-sweep:warned -->"
# Comments that carry this footer are automated and must not count as a human
# reply - otherwise one bot comment exempts a duplicate forever.
AI_DISCLOSURE="This comment was created by an AI agent"

NOW=$(date -u +%s)
ISSUES=$(gh issue list --repo "$REPO" --state open --label duplicate --limit 200 --json number --jq '.[].number')

for n in $ISSUES; do
  # The issue's own comments, oldest first (the API's order). A comment body's
  # tabs and newlines are folded so each comment stays on one tab-separated line.
  COMMENTS=$(gh api "repos/$REPO/issues/$n/comments?per_page=100" \
    --jq '.[] | "\(.created_at)\t\(.body | gsub("\n"; " ") | gsub("\t"; " "))"' 2>/dev/null || true)
  WARNED_AT=$(printf '%s\n' "$COMMENTS" | grep -F "$MARK" | head -1 | cut -f1 || true)

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

  # A comment after the warning that a person wrote (not the automation footer)
  # means the reporter responded; give it to a maintainer instead of closing on
  # top of a reply.
  LATEST_COMMENT_AT=$(printf '%s\n' "$COMMENTS" | tail -1 | cut -f1 || true)
  NEW_REPLY=$(printf '%s\n' "$COMMENTS" \
    | awk -F '\t' -v warned="$WARNED_AT" -v ai="$AI_DISCLOSURE" \
        '$1 > warned && index($0, ai) == 0 { line = $0 } END { print line }' || true)
  if [ -n "$NEW_REPLY" ]; then
    echo "#$n has a reply after the warning; leaving it open for a maintainer."
    continue
  fi

  # An edit to the issue body after the warning (and after the last comment, so
  # the warning's own comment does not read as an edit) also shows it is
  # distinct. GitHub bumps updatedAt for comments too, so require it to be
  # strictly newer than the newest comment.
  ISSUE_UPDATED_AT=$(gh issue view "$n" --repo "$REPO" --json updatedAt --jq '.updatedAt // empty')
  if [ -n "$ISSUE_UPDATED_AT" ] && [ "$ISSUE_UPDATED_AT" \> "$LATEST_COMMENT_AT" ]; then
    echo "#$n was edited after the warning; leaving it open for a maintainer."
    continue
  fi

  gh issue close "$n" --reason "not planned" \
    --comment "Closing as a duplicate: no response in $GRACE_DAYS days. Reopen if it is in fact distinct. $MARK"
  echo "Closed #$n as a stale duplicate."
done
