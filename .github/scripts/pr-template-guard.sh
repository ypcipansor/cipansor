#!/bin/sh
# Hard gate on the pull-request template (a required check that fails).
#
#   body missing a required part  -> upsert one comment listing what is missing
#                                    AND exit 1 (the check fails)
#   body complete                 -> remove that comment, exit 0
#
# The template is a rule, not a nudge (upstream OpenHands enforces the same
# shape: a linked, ready issue and the Why/Summary/How-to-test sections). The
# required parts are: a `## HUMAN` note, `## Why`, `## What changed`,
# `## Acceptance criteria`, `## How to test`, and a linked issue — `Fixes #<n>`
# whose issue carries `ready` or `bot-implement`, or an explicit line saying
# there is no linked issue. The PR-language rule is enforced in the same place:
# the body must read as Indonesian prose (see docs/LABELS.md).
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

# The visible text of the section starting at "## <heading>", blank lines and
# bare list markers dropped. Operates on the cleaned body. A lone "-" is the
# template's placeholder for "What changed", not content; dropping only a marker
# with nothing after it keeps real bullets and the "- [x]" acceptance boxes.
section() {
  awk -v h="## $1" '
    $0 == h { f = 1; next }
    f && /^## / { f = 0 }
    f { print }
  ' "$CLEAN" | sed -e '/^[[:space:]]*$/d' -e '/^[[:space:]]*[-*+][[:space:]]*$/d'
}

visible_len() { printf '%s' "$1" | tr -d '\n' | wc -c | tr -d ' '; }

missing=""

[ "$(visible_len "$(section HUMAN)")" -ge 20 ] || missing="$missing
- catatan manusia singkat di bawah \`## HUMAN\` (minimal 20 karakter, apa yang Anda uji)"

[ -n "$(section Why)" ] || missing="$missing
- \`## Why\` — masalah dan motivasinya"
[ -n "$(section 'What changed')" ] || missing="$missing
- \`## What changed\` — apa perubahannya"

LINKED="$(printf '%s' "$BODY" | grep -oiE '(fix(e[sd])?|close[sd]?|resolve[sd]?) #[0-9]+' | grep -oE '[0-9]+' | head -n1)"
if [ -n "$LINKED" ]; then
  # A link is only a green light when the issue is ready for development:
  # `ready` (ready for anyone) or `bot-implement` (handed to the bot). A link to
  # an issue still in `needs-info` or `pending-maintainer` is not.
  LABELS="$(gh api "repos/$REPO/issues/$LINKED" --jq '[.labels[].name] | join(",")' 2>/dev/null || true)"
  case ",$LABELS," in
    *,ready,* | *,bot-implement,*) ;;
    *) missing="$missing
- issue tertaut #$LINKED harus berlabel \`ready\` atau \`bot-implement\` sebelum ditinjau (sekarang: ${LABELS:-tidak ada})" ;;
  esac
elif ! printf '%s' "$BODY" | grep -qiE 'no linked issue|tanpa issue'; then
  missing="$missing
- \`Fixes #<n>\` untuk issue tertaut, atau satu baris yang menyatakan tidak ada issue tertaut"
fi

[ -n "$(section 'How to test')" ] || missing="$missing
- \`## How to test\` — perintah yang dijalankan peninjau, dan apa yang Anda lihat"

if ! section 'Acceptance criteria' | grep -qE '^[[:space:]]*- \[[ x]\]'; then
  missing="$missing
- \`## Acceptance criteria\` — minimal satu kotak centang yang disalin dari issue tertaut"
fi

# The repo writes its GitHub prose in Indonesian (docs/LABELS.md). The check is
# deliberately coarse: it only fails a body that reads as English, i.e. it has
# common English function words and no common Indonesian ones. `English is
# intended` is the explicit escape hatch for the rare deliberate exception.
ID_WORDS='dan|yang|atau|dengan|untuk|tidak|adalah|pada|dari|ini|itu|akan|bisa|sudah|belum|perubahan|pengujian|perbaikan|masalah|berkas|kesalahan'
EN_WORDS='(^|[^a-z])(the|and|with|this|that|for|not|should|change|changes|changed|test|tests|tested|testing|fix|fixes|fixed|fixing|adds|added|adding)([^a-z]|$)'
if ! printf '%s' "$BODY" | grep -qiE "($ID_WORDS)" \
   && printf '%s' "$BODY" | grep -qiE "$EN_WORDS" \
   && ! printf '%s' "$BODY" | grep -qi 'english is intended'; then
  missing="$missing
- deskripsi terbaca sebagai Bahasa Inggris; repo ini menulis prosa GitHub-nya dalam Bahasa Indonesia (tambahkan baris \`English is intended\` hanya bila itu memang disengaja)"
fi

# Find any existing marker comment, so it can be updated instead of duplicated.
find_comment() {
  # --paginate: on an active PR the reminder can move past the first 100
  # comments; without it the guard would post a duplicate (or fail to delete a
  # resolved one). tail -n1 keeps the newest marker comment.
  gh api --paginate "repos/$REPO/issues/$PR/comments?per_page=100" \
    --jq ".[] | select(.body | contains(\"$MARK\")) | .id" 2>/dev/null | tail -n1
}
CID="$(find_comment || true)"

OUT="$DIR/out"
if [ -n "$missing" ]; then
  {
    printf '%s\n' "$MARK" "" "Deskripsi pull request ini belum lengkap:"
    printf '%s\n' "$missing"
    printf '%s\n' "" \
      "Check \`PR description\` gagal sampai ini diperbaiki. Lihat" \
      "\`docs/LABELS.md\`." \
      "" \
      "_This comment was created by an AI agent (OpenHands) on behalf of the maintainer._"
  } > "$OUT"
  if [ -n "$CID" ]; then
    if gh api -X PATCH "repos/$REPO/issues/comments/$CID" -f body=@"$OUT" >/dev/null; then
      echo "PR #$PR: updated the missing-description reminder."
    else
      echo "::warning::could not update the description reminder on PR #$PR"
    fi
  elif gh pr comment "$PR" --repo "$REPO" --body-file "$OUT" >/dev/null; then
    echo "PR #$PR: posted the missing-description reminder."
  else
    echo "::warning::could not post the description reminder on PR #$PR"
  fi
  echo "::error::PR #$PR description is incomplete; the check fails."
  exit 1
elif [ -n "$CID" ]; then
  if gh api -X DELETE "repos/$REPO/issues/comments/$CID" >/dev/null; then
    echo "PR #$PR: description is complete; removed the reminder."
  else
    echo "::warning::could not remove the description reminder on PR #$PR"
  fi
else
  echo "PR #$PR: description is complete."
fi
