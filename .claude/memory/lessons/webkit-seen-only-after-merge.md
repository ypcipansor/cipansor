# WebKit is seen only after the merge — and its timeout holds back staging

Measured 2026-10-03, PR #626 (PWA + Web Push) and its fix #650.

## What happened

#626 added a Content-Security-Policy with `upgrade-insecure-requests`. Every
check on the PR was green, the full Chromium e2e passed locally and in CI, and
the PR merged. On `main`, the WebKit job then failed almost every test in
about 9 seconds each ("element not found"): WebKit, unlike Chromium and
Firefox, applies `upgrade-insecure-requests` to `http://localhost` too (WebKit
bugs 171934, 250776). CI serves the production build over plain http, so the
page loaded its own `/_next` chunks from `https://localhost` and never
hydrated. The real site is https and was never affected.

Then the second trap: the WebKit job is informational (`continue-on-error`),
but with three attempts per failing test it ran past `timeout-minutes: 45`. A
timed-out job ends the whole workflow run **cancelled**, not failed, and
*Deploy staging* runs only on a successful E2E run. The merge never reached
staging, and nothing said so except the run's grey icon.

## Why nobody saw it before the merge

- The Firefox/WebKit job runs **only on `main`** (push) and on
  `workflow_dispatch` — never on a pull request.
- Local rigs carry Chromium only (the Playwright MCP image has no WebKit).
- An audit that renders every screen in Chromium proves nothing about Safari,
  and iPhone users are Safari users.

## What to do

- **A change to headers, CSP, the service worker, cookies or anything
  engine-sensitive:** dispatch the E2E workflow on the branch before merging
  (`gh workflow run "E2E Tests" --ref <branch>`), which runs Firefox and
  WebKit, and read the WebKit job.
- **After any merge, check that staging moved.** Compare `/healthz`'s commit
  with the merge SHA; a cancelled E2E run is the usual reason it did not.
- **Informational jobs must fail fast.** The cross-browser step now runs with
  `--max-failures=30`, so a broken engine is a red job, not a cancelled run.
- **A CSP directive is justified per browser.** `upgrade-insecure-requests`
  adds nothing on an all-https site with HSTS; on an http deployment WebKit
  breaks. Prefer no directive to one whose effect differs by engine.
