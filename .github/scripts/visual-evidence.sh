#!/bin/sh
# Visual-evidence check for UI changes (advisory, never a gate).
#
#   PR touches apps/web, body has no before/after visual  -> one reminder comment
#   PR does not touch apps/web, or has the visuals         -> remove the reminder
#
# It never fails, never labels and never changes the draft state. A "visual"
# counts as an image, a video, or a link to either (GitHub user-attachment URLs,
# raw/blob links to images, .png/.jpg/.gif/.webp/.mp4/.webm). Everything else is
# invisible to it, so it only ever asks — a reviewer judges the quality.
#
# Usage: visual-evidence.sh <pr-number>
# Env:   GH_TOKEN, REPO (owner/name)
set -eu

PR="${1:?usage: visual-evidence.sh <pr-number>}"
REPO="${REPO:?REPO is required}"

MARK="<!-- visual-evidence -->"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT EXIT HUP INT TERM

gh pr view "$PR" --repo "$REPO" --json files,body > "$TMP"

touch_web="$(jq -r '[.files[].path] | map(select(startswith("apps/web/"))) | length > 0' "$TMP")"
body="$(jq -r .body "$TMP")"

img_re='user-images\.githubusercontent\.com|private-user-images\.githubusercontent\.com|https?://[^ )]+\.(png|jpe?g|gif|webp|mp4|webm)'
has_media=0
printf '%s' "$body" | grep -qiE "$img_re" && has_media=1

find_comment() {
  gh api "repos/$REPO/issues/$PR/comments?per_page=100" \
    --jq ".[] | select(.body | contains(\"$MARK\")) | .id" 2>/dev/null | tail -n1
}
CID="$(find_comment || true)"

need=0
[ "$touch_web" = "true" ] && [ "$has_media" = "0" ] && need=1

if [ "$need" = "1" ]; then
  cat > "$TMP" <<EOF
$MARK
This pull request changes \`apps/web\`, but its description has no before/after
visual. Please add:

- **Before** — a screenshot or short video of the old behaviour.
- **After** — the same view or flow after the change.

Paste them with GitHub's uploader (they become \`user-images.githubusercontent.com\`
links) or link the files. This is a reminder, not a merge gate — it exists so a
reviewer can see the change without checking out the branch.

_This comment was created by an AI agent (OpenHands) on behalf of the maintainer._
EOF
  if [ -n "$CID" ]; then
    gh api -X PATCH "repos/$REPO/issues/comments/$CID" -f body=@"$TMP" >/dev/null
  else
    gh pr comment "$PR" --repo "$REPO" --body-file "$TMP" >/dev/null
  fi
  echo "PR #$PR: UI change without before/after visuals; reminder posted."
elif [ -n "$CID" ]; then
  gh api -X DELETE "repos/$REPO/issues/comments/$CID" >/dev/null
  echo "PR #$PR: visuals present (or no UI change); reminder removed."
else
  echo "PR #$PR: nothing to ask for."
fi
