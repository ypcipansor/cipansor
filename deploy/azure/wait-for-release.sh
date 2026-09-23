#!/usr/bin/env bash
# Wait until a released commit is answering at its public address.
#
#   deploy/azure/wait-for-release.sh <base-url> <sha> [timeout-seconds]
#
# Used by the deploy workflows after pointing an app at new images. It asks the
# app itself, through Cloudflare — the path a visitor takes — rather than asking
# Azure whether containers started:
#   1. <base-url>/healthz goes nginx -> api GET /health, which reports the commit
#      the api image was built from. Polled until it equals <sha>, so the old
#      code still answering during the restart does not count, and an api that
#      never comes up (a failed migration exits the container) times out.
#   2. <base-url>/manifest.json goes nginx -> web. A 200 means the web container
#      answers too; nginx alone would return 502.
# The apps accept traffic from Cloudflare only, so this is also the only way a
# GitHub runner can reach them. On staging, Cloudflare Access must let these two
# paths through (docs/deploy-azure.md, "Cloudflare").
set -uo pipefail

base=${1%/}
sha=$2
timeout=${3:-900}
deadline=$(( $(date +%s) + timeout ))

probe() { # url -> prints the HTTP status; the body lands in /tmp/probe.body
  curl -s --max-time 15 -H 'Cache-Control: no-cache' -o /tmp/probe.body -w '%{http_code}' "$1" || true  # prints 000 when unreachable
}

commit=""
while :; do
  code=$(probe "$base/healthz?release=$sha")
  commit=$(jq -r '.commit // empty' /tmp/probe.body 2>/dev/null || true)
  echo "$(date -u +%H:%M:%S) /healthz HTTP $code commit=${commit:-none}"
  [ "$code" = 200 ] && [ "$commit" = "$sha" ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error title=Release not answering::$base did not report commit $sha within ${timeout}s (last: HTTP $code, commit=${commit:-none})"
    echo "--- last response headers and body"
    curl -s --max-time 15 -D - -o - "$base/healthz" | head -40
    echo
    echo "A 302 to cloudflareaccess.com or a 403 with cf-mitigated means Cloudflare stopped the"
    echo "runner, not the app. Otherwise read the api container's log in the Azure portal"
    echo "(App Service > Log stream) or Log Analytics (AppServiceConsoleLogs)."
    exit 1
  fi
  sleep 15
done

code=$(probe "$base/manifest.json")
echo "$(date -u +%H:%M:%S) /manifest.json HTTP $code"
if [ "$code" != 200 ]; then
  echo "::error title=Web not answering::$base/manifest.json returned HTTP $code after the api reported $sha"
  exit 1
fi
echo "Commit $sha is answering at $base (api and web)."
