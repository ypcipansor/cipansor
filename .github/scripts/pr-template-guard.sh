#!/bin/sh
# Advisory check of the pull-request template (warning-only, never a gate).
#
#   body missing a required part  -> upsert one comment listing what is missing
#   body complete                 -> remove that comment
#
# It never fails, never blocks a merge, never labels and never changes the PR's
# draft state. The template is a nudge, not a rule: a maintainer decides whether
# the information is sufficient. What it enforces is only visibility, so a
# reviewer is not left guessing.
#
# A PR that changes anything under apps/web is additionally asked for before and
# after visuals by the visual-evidence workflow, not by this one.
#
# Usage: pr-template-guard.sh <pr-number>
# Env:   GH_TOKEN, REPO (owner/name)
set -eu

PR="${1:?usage: pr-template-guard.sh <pr-number>}"
REPO="${REPO:?REPO is required}"

MARK="<!-- pr-template-guard -->"
DIR="$(mktemp -d)"
RAW="$DIR/raw"
CLEAN="$DIR/clean"
trap 'rm -rf "$DIR"' EXIT EXIT HUP INT TERM

gh pr view "$PR" --repo "$REPO" --json body --jq .body > "$RAW"

# Visible text: strip HTML comments (including multi-line ones and the template
# placeholders) and fenced code, so placeholders do not count as content.
perl -0777 -pe 's/<!--.*?-->//gs; s/```.*?```//gs' "$RAW" > "$CLEAN"
BODY="$(cat "$CLEAN")"

# The visible text of the section starting at "## <heading>", blank lines
# dropped. Operates on the cleaned body.
section() {
  awk -v h="## $1" '
    $0 == h { f = 1; next }
    f && /^## / { f = 0 }
    f { print }
  ' "$CLEAN" | sed -e '/^[[:space:]]*$/d'
}

visible_len() { printf '%s' "$1" | tr -d '\n' | wc -c | tr -d ' '; }

missing=""

[ "$(visible_len "$(section HUMAN)")" -ge 20 ] || missing="$missing
- a short human note under \`## HUMAN\` (at least 20 characters, saying what you tested)"

[ -n "$(section Why)" ] || missing="$missing
- \`## Why\` — the problem and its motivation"
[ -n "$(section 'What changed')" ] || missing="$missing
- \`## What changed\` — what the change is"

if ! printf '%s' "$BODY" | grep -qiE '(fix(e[sd])?|close[sd]?|resolve[sd]?) #[0-9]+|no linked issue|tanpa issue'; then
  missing="$missing
- \`Fixes #<n>\` for the linked issue, or a line saying there is no linked issue"
fi

[ -n "$(section 'How to test')" ] || missing="$missing
- \`## How to test\` — the commands a reviewer runs, and what you saw"

if ! section 'Acceptance criteria' | grep -qE '^[[:space:]]*- \[[ x]\]'; then
  missing="$missing
- \`## Acceptance criteria\` — at least one copied checkbox from the linked issue"
fi

# Find any existing marker comment, so it can be updated instead of duplicated.
find_comment() {
  gh api "repos/$REPO/issues/$PR/comments?per_page=100" \
    --jq ".[] | select(.body | contains(\"$MARK\")) | .id" 2>/dev/null | tail -n1
}
CID="$(find_comment || true)"

OUT="$DIR/out"
if [ -n "$missing" ]; then
  {
    printf '%s\n' "$MARK" "" "This pull request's description is missing:"
    printf '%s\n' "$missing"
    printf '%s\n' "" \
      "Filling these in does not gate the merge and no automation will block it —" \
      "the template just exists so a reviewer does not have to ask. See" \
      "\`docs/LABELS.md\`." \
      "" \
      "_This comment was created by an AI agent (OpenHands) on behalf of the maintainer._"
  } > "$OUT"
  if [ -n "$CID" ]; then
    gh api -X PATCH "repos/$REPO/issues/comments/$CID" -f body=@"$OUT" >/dev/null
  else
    gh pr comment "$PR" --repo "$REPO" --body-file "$OUT" >/dev/null
  fi
  echo "PR #$PR: posted the missing-description reminder."
elif [ -n "$CID" ]; then
  gh api -X DELETE "repos/$REPO/issues/comments/$CID" >/dev/null
  echo "PR #$PR: description is complete; removed the reminder."
else
  echo "PR #$PR: description is complete."
fi
