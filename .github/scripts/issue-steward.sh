#!/bin/sh
# Age out stalled issues. Re-run daily by issue-steward.yml.
#
# Timers:
#   needs-info   -> close as not planned after 20 days with no reply
#   question     -> `stale` after 8 days, close 7 days later if still quiet
#   anything else-> `stale` after 90 days with no activity, close 14 days later
#
# Exempt, left exactly as they are: `pending-maintainer`, `ready`, `blocked`,
# `in-progress`, and any issue a maintainer has commented on since the timer's
# label was applied. `duplicate` is owned by duplicate-sweep.sh and is never
# touched here. A pull request is never touched: only issues are listed.
#
# The script holds no state between runs. It reads the label timestamps back
# from the issue timeline and the replies from the issue comments, so a run is
# a pure function of what GitHub holds. The item's updatedAt is deliberately not
# used as an activity clock: a later automated comment bumps it, which would
# hide an earlier human reply.
#
# Before a close, exactly ONE comment names the timer and says how to keep the
# issue open (reply, or remove the label). The close itself happens on the run
# after that comment, so the comment is posted while the issue is still open and
# "remove the label" is still actionable. The comment carries a marker, so a
# later run closes without posting it a second time.
#
# Usage: issue-steward.sh
# Env:   GH_TOKEN, REPO, DRY_RUN (non-empty: print what it would do, change nothing)
set -eu

REPO="${REPO:?REPO is required}"
DRY_RUN="${DRY_RUN:-}"
TAB=$(printf '\t')

# The one pre-close comment and the marker that keeps it from being posted
# twice. The marker is the state: a run that finds it closes.
NOTICE_MARK="<!-- issue-steward:closing -->"
# Comments carrying this footer are automated and never count as a human or
# maintainer reply. Every comment this script posts carries it, or its own
# notice would re-arm the timer it just set (#680: an automation that comments
# on issues re-triggers itself when it cannot tell its own comment apart).
AI_DISCLOSURE="This comment was created by an AI agent"
AI_FOOTER="$AI_DISCLOSURE (OpenHands) on behalf of the repository maintainers."

# A maintainer's to carry: never touched.
EXEMPT_LABELS="pending-maintainer ready blocked in-progress"
# Owned by duplicate-sweep.sh.
SKIP_LABELS="duplicate"

DAY=86400
NOW=$(date -u +%s)

has_label() { # <labels-csv> <name>
  printf '%s\n' "$1" | tr ',' '\n' | grep -Fxq "$2"
}

# A label's most recent application time. The timeline can carry several events
# when a label is removed and re-added; the latest one governs.
label_at() { # <timeline-tsv> <name>
  printf '%s\n' "$1" | awk -F "$TAB" -v want="$2" '$1 == want { ts = $2 } END { print ts }'
}

days_since() { # <iso>
  echo $(( (NOW - $(date -u -d "$1" +%s)) / DAY ))
}

# Count comments after <iso> that are by a person: not a bot account and not one
# of our automated notices.
human_reply_after() { # <comments-tsv> <iso>
  printf '%s\n' "$1" | awk -F "$TAB" -v after="$2" -v ai="$AI_DISCLOSURE" \
    '$1 > after && index($3, ai) == 0 && $2 !~ /\[bot\]$/ { n++ } END { print n + 0 }'
}

# Count comments after <iso> by a maintainer (author association OWNER/MEMBER/
# COLLABORATOR). The AI exclusion matters: the token's own comments can carry a
# maintainer association, and without it this script's notice would exempt the
# very issue it is about to close.
maintainer_reply_after() { # <comments-tsv> <iso>
  printf '%s\n' "$1" | awk -F "$TAB" -v after="$2" -v ai="$AI_DISCLOSURE" \
    '$1 > after && index($3, ai) == 0 && $4 ~ /^(OWNER|MEMBER|COLLABORATOR)$/ { n++ } END { print n + 0 }'
}

comment_marker_present() { # <comments-tsv> <marker>
  printf '%s\n' "$1" | cut -f3 | grep -Fq "$2"
}

post_notice() { # <n> <reason>
  if [ -n "$DRY_RUN" ]; then
    echo "DRY_RUN: would comment on issue #$1 (and close it next run): $2"
    return
  fi
  gh issue comment "$1" --repo "$REPO" --body "$2

$NOTICE_MARK

$AI_FOOTER"
  echo "Noticed issue #$1: $2"
}

close_issue() { # <n>
  if [ -n "$DRY_RUN" ]; then
    echo "DRY_RUN: would close issue #$1 as not planned"
    return
  fi
  gh issue close "$1" --repo "$REPO" --reason "not planned"
  echo "Closed issue #$1 as not planned."
}

add_stale() { # <n>
  if [ -n "$DRY_RUN" ]; then
    echo "DRY_RUN: would label issue #$1 stale"
    return
  fi
  gh issue edit "$1" --repo "$REPO" --add-label "stale"
  echo "Marked issue #$1 stale."
}

# A close is only reached once the notice is already posted; otherwise post the
# notice and let the next run close. <n> <reason> <comments-tsv>
notice_then_close() {
  if comment_marker_present "$3" "$NOTICE_MARK"; then
    close_issue "$1"
  else
    post_notice "$1" "$2"
  fi
}

# One issue. $1 number, $2 comma-separated labels.
steward_issue() {
  n="$1"; labels="$2"

  for l in $EXEMPT_LABELS; do
    if has_label "$labels" "$l"; then echo "Issue #$n: exempt ($l)."; return; fi
  done
  for l in $SKIP_LABELS; do
    if has_label "$labels" "$l"; then echo "Issue #$n: skipped ($l)."; return; fi
  done

  # Timeline as `label-name<TAB>created_at` for every `labeled` event. The REST
  # timeline is the only place a label's application time is recorded.
  TIMELINE=$(gh api --paginate "repos/$REPO/issues/$n/timeline?per_page=100" \
    --jq '.[] | select(.event == "labeled") | "\(.label.name)\t\(.created_at)"' 2>/dev/null || true)

  # Comments, oldest first, as `created_at<TAB>login<TAB>body<TAB>association`.
  # A PR is an issue to the REST API, so this serves both. --paginate so a reply
  # on a later page is not missed (the trap the #684 review found in the sweep).
  COMMENTS=$(gh api --paginate "repos/$REPO/issues/$n/comments?per_page=100" \
    --jq '.[] | "\(.created_at)\t\(.user.login)\t\(.body | gsub("\n"; " ") | gsub("\t"; " "))\t\(.author_association)"' 2>/dev/null || true)

  if has_label "$labels" "needs-info"; then
    T=$(label_at "$TIMELINE" "needs-info")
    if [ -z "$T" ]; then echo "Issue #$n: needs-info with no label event; skipping."; return; fi
    if [ "$(maintainer_reply_after "$COMMENTS" "$T")" -gt 0 ]; then
      echo "Issue #$n: a maintainer commented since needs-info; exempt."; return
    fi
    if [ "$(human_reply_after "$COMMENTS" "$T")" -gt 0 ]; then
      echo "Issue #$n: a reply arrived since needs-info; keeping open."; return
    fi
    if [ "$(days_since "$T")" -lt 20 ]; then
      echo "Issue #$n: needs-info $(days_since "$T")d old; within 20d."; return
    fi
    notice_then_close "$n" \
      "This issue has been waiting on requested information for 20 days and will be closed as not planned on the next run. Reply with the information, or remove the \`needs-info\` label, to keep it open." \
      "$COMMENTS"
    return
  fi

  if has_label "$labels" "question"; then
    TQ=$(label_at "$TIMELINE" "question")
    if [ -z "$TQ" ]; then echo "Issue #$n: question with no label event; skipping."; return; fi
    TS=$(label_at "$TIMELINE" "stale")
    if [ -z "$TS" ]; then
      if [ "$(maintainer_reply_after "$COMMENTS" "$TQ")" -gt 0 ]; then
        echo "Issue #$n: a maintainer commented since question; exempt."; return
      fi
      if [ "$(human_reply_after "$COMMENTS" "$TQ")" -gt 0 ]; then
        echo "Issue #$n: a reply arrived since question; keeping open."; return
      fi
      if [ "$(days_since "$TQ")" -lt 8 ]; then
        echo "Issue #$n: question $(days_since "$TQ")d old; within 8d."; return
      fi
      add_stale "$n"
      return
    fi
    if [ "$(maintainer_reply_after "$COMMENTS" "$TS")" -gt 0 ]; then
      echo "Issue #$n: a maintainer commented since stale; exempt."; return
    fi
    if [ "$(human_reply_after "$COMMENTS" "$TS")" -gt 0 ]; then
      echo "Issue #$n: a reply arrived since stale; keeping open."; return
    fi
    if [ "$(days_since "$TS")" -lt 7 ]; then
      echo "Issue #$n: stale $(days_since "$TS")d; within 7d."; return
    fi
    notice_then_close "$n" \
      "This question has been marked stale for 7 days with no reply and will be closed as not planned on the next run. Reply, or remove the \`stale\` label, to keep it open." \
      "$COMMENTS"
    return
  fi

  # Anything else: 90 days without activity, then 14 days after it went stale.
  TS=$(label_at "$TIMELINE" "stale")
  if [ -z "$TS" ]; then
    # Activity is a human comment; the issue's creation is the floor. A bot
    # comment (ours included) must not reset the clock.
    LAST=$(printf '%s\n' "$COMMENTS" | awk -F "$TAB" -v ai="$AI_DISCLOSURE" \
      '$2 !~ /\[bot\]$/ && index($3, ai) == 0 { ts = $1 } END { print ts }')
    CREATED=$(gh issue view "$n" --repo "$REPO" --json createdAt --jq '.createdAt' 2>/dev/null || true)
    if [ -z "$LAST" ]; then LAST="$CREATED"; fi
    if [ -z "$LAST" ]; then echo "Issue #$n: no activity clock; skipping."; return; fi
    if [ "$(days_since "$LAST")" -lt 90 ]; then
      echo "Issue #$n: active $(days_since "$LAST")d ago; within 90d."; return
    fi
    add_stale "$n"
    return
  fi
  if [ "$(maintainer_reply_after "$COMMENTS" "$TS")" -gt 0 ]; then
    echo "Issue #$n: a maintainer commented since stale; exempt."; return
  fi
  if [ "$(human_reply_after "$COMMENTS" "$TS")" -gt 0 ]; then
    echo "Issue #$n: a reply arrived since stale; keeping open."; return
  fi
  if [ "$(days_since "$TS")" -lt 14 ]; then
    echo "Issue #$n: stale $(days_since "$TS")d; within 14d."; return
  fi
  notice_then_close "$n" \
    "This issue has been marked stale for 14 days with no activity and will be closed as not planned on the next run. Reply, or remove the \`stale\` label, to keep it open." \
    "$COMMENTS"
}

# Only issues. `gh issue list` never returns a pull request, so no PR can be
# closed here (the sweep owns PRs, and closing one is never this script's job).
ISSUES=$(gh issue list --repo "$REPO" --state open --limit 500 \
  --json number,labels --jq '.[] | "\(.number)\t\([.labels[].name] | join(","))"')

printf '%s\n' "$ISSUES" | while IFS="$TAB" read -r n labels; do
  if [ -n "$n" ]; then steward_issue "$n" "$labels"; fi
done
