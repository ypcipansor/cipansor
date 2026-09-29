#!/usr/bin/env bash
#
# Produce the before/after screenshot pair for the PWA UI surfaces touched by
# this branch (AGENTS.md golden rule #10).
#
# It shoots the same spec twice: once with the changed UI files restored from
# `origin/main` (before) and once with the branch's own files in place (after).
# The swap is restored on exit, including on failure, so the working tree is
# never left holding main's version of a branch file.
#
# Usage (from apps/web, or anywhere — the script cds itself):
#   apps/web/scripts/capture-before-after.sh
#   PWA_SHOTS_DIR=/tmp/ba-shots apps/web/scripts/capture-before-after.sh
#
# Output: ${PWA_SHOTS_DIR:-/tmp/ba-shots}/<surface>-{before,after}.png
# Requires the seeded stack up (API :3001, web :3000) — see .claude/skills/stack.

set -uo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$WEB_DIR/../.." && pwd)"
OUT="${PWA_SHOTS_DIR:-/tmp/ba-shots}"
BASE_REF="${BA_BASE_REF:-origin/main}"

# UI files that change what the two captured surfaces render. Only these are
# swapped; a file that does not affect the pixels would just add restore risk.
FILES=(
  "apps/web/src/app/notifications/settings/page.tsx"
  "apps/web/src/components/pwa/install-prompt.tsx"
)

BACKUP="$(mktemp -d)"
restore() {
  for f in "${FILES[@]}"; do
    if [[ -f "$BACKUP/$(basename "$f")" ]]; then
      cp "$BACKUP/$(basename "$f")" "$ROOT_DIR/$f"
    fi
  done
  rm -rf "$BACKUP"
}
trap restore EXIT

for f in "${FILES[@]}"; do
  cp "$ROOT_DIR/$f" "$BACKUP/$(basename "$f")"
done

mkdir -p "$OUT"
cd "$WEB_DIR"

PNPM_CMD=()
if command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD=(pnpm)
else
  PNPM_CMD=(corepack pnpm)
fi

run() {
  local label="$1"
  echo "==> capturing $label"
  PWA_SHOTS_DIR="$OUT" BA_LABEL="$label" \
    "${PNPM_CMD[@]}" exec playwright test \
    -c playwright.beforeafter.config.ts \
    --project=chromium --workers=1
}

run after

# Swap the surfaces to their base-branch versions for the "before" pair.
for f in "${FILES[@]}"; do
  git -C "$ROOT_DIR" show "$BASE_REF:$f" > "$ROOT_DIR/$f"
done
run before

echo "done — ${OUT}/<surface>-{before,after}.png"
