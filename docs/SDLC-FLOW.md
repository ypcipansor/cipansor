# SDLC automation flow

The pipeline that carries a change from a filed issue to production, split
across two lanes that each do the part they are good at:

- **Cloud automation** (`app.all-hands.dev`) — an LLM agent that reads context
  and makes a judgement: triage, labelling, review, writing a fix. It never
  merges, and leaves the draft/ready decision to a human or the review gate.
- **GitHub Actions** — fixed consequences that must fire reliably and must not
  cost tokens: the CI-result bridge that dispatches the gate, the duplicate
  sweep, the label-mismatch check, the deploys. The rules live in
  `.github/scripts/` so they run by hand.

Cloud cron schedules are in **Asia/Jakarta (WIB)**; GHA schedules are **UTC**.
Every comment trigger carries the footer guard
`!icontains(comment.body, 'This comment was created by an AI agent')`, because an
automation posts through the same account as the reporter and would otherwise
re-trigger itself (incident #680). SDLC 08 (mentioned below) instead sets
`destination: continue_conversation`, so every mention about one PR/issue shares a
single conversation and a burst cannot exhaust the sandbox pool.

## End to end

```mermaid
flowchart TB
  classDef cloud fill:#e8f0fe,stroke:#4285f4,color:#111;
  classDef gh fill:#fff4e5,stroke:#f59e0b,color:#111;
  classDef human fill:#e9f7ef,stroke:#27ae60,color:#111;

  subgraph ISSUE["1 · Issue"]
    I([Issue opened]) --> C1["SDLC 01 · Triase bug"]:::cloud
    I --> C2["SDLC 02 · Estimasi usaha"]:::cloud
    I --> C3["SDLC 19 · Pelabel issue"]:::cloud
    C3 --> D{"Clear enough?"}
    D -- yes --> R(["ready"])
    D -- no --> NI(["needs-info"])
    NI --> C20["SDLC 20 · Penjernih issue"]:::cloud --> D
    PM(["pending-maintainer"]) --> C26["SDLC 26 · Diskusi"]:::cloud --> D
    I -. "label bug" .-> C6["SDLC 06 · Reproduksi bug"]:::cloud
    C6 --> BUG(["failing test + draft PR"])
  end

  subgraph PRL["2 · Pull request"]
    R --> C7["SDLC 07 · Tiket jadi PR"]:::cloud --> DPR([Draft PR])
    MENT(["comment @openhands"]):::human -. "trusted author" .-> C8["SDLC 08 · Bot sebutan"]:::cloud
    C8 --> DPR
    DPR --> C21["SDLC 21 · Pelabel PR"]:::cloud
    DPR --> C9["SDLC 09 · Peninjau kode"]:::cloud
    DPR --> C5["SDLC 05 · Peninjau arsitektur"]:::cloud
    DPR --> RDY(["Ready for review"]):::human
    RDY --> C11["SDLC 11 · Otomasi QA"]:::cloud
    RDY -. "wait for green" .-> C22["SDLC 22 · Gerbang tinjau PR"]:::cloud
    RDY --> GAE["Actions · E2E Tests"]:::gh
    GAC["Actions · CI"]:::gh --> LC{"pr-lifecycle.sh (workflow_run)"}:::gh
    GAE --> LC
    LC -- "red" --> RQ(["quiet"]):::gh
    LC -- "green + ready" --> DISP["dispatch gate (bridge)"]:::gh --> C22
    C22 --> DEC{"every check completed?"}
    DEC -- "running / red" --> NO["do nothing"]:::cloud
    DEC -- green --> AP(["approve or request changes + suggestion"]):::cloud
  end

  subgraph REL["3 · Release & operations"]
    DPR -. merge .-> MG([Merge to main])
    MG --> C4["SDLC 04 · Peta basis kode"]:::cloud
    MG --> C15["SDLC 15 · Pengelola dokumentasi"]:::cloud
    MG --> STG["deploy-staging.yml (build + push image)"]:::gh
    STG --> PROD["deploy-production.yml (manual · sha)"]:::human
    C14["SDLC 14 · Pembuat catatan rilis (cron Fri 22:00 WIB)"]:::cloud
    C14 -. "cuts a -rc prerelease (notes in the Release body, no in-repo changelog)" .-> REL2(["GitHub Release (prerelease)"])
  end
```

## Issue lifecycle

```mermaid
flowchart TD
  classDef cloud fill:#e8f0fe,stroke:#4285f4,color:#111;
  classDef human fill:#e9f7ef,stroke:#27ae60,color:#111;

  I([Issue opened]) --> C19["SDLC 19 · Pelabel issue"]:::cloud
  C19 --> D{"Enough detail to implement?"}
  D -- yes --> R(["ready"])
  D -- no --> Q(["question"])
  D -- no --> NI(["needs-info"])

  NI --> C20["SDLC 20 · Penjernih issue"]:::cloud
  C20 -- "reporter answers" --> D

  I -. "label bug" .-> C6["SDLC 06 · Reproduksi bug"]:::cloud
  C6 --> BUG["draft PR (failing test) + evidence on the issue"]:::cloud
  C6 -. "behaviour is intended" .-> INV(["invalid / duplicate"])

  PM(["pending-maintainer"]) --> C26["SDLC 26 · Diskusi"]:::cloud
  C26 -- "go-ahead" --> R
  C26 -- "reject" --> WF(["wontfix → closed"])

  R --> C7["SDLC 07 · Tiket jadi PR"]:::cloud --> DPR([Draft PR])

  C25["SDLC 25 · Penjaga issue (cron 01:30 WIB)"]:::cloud
  C25 -. "timer" .-> NI
  C25 -. "timer" .-> Q
  C25 -- "20d / 8+7d / 90+14d" --> CL(["closed as not planned"])
```

## Pull request lifecycle — the CI gate

```mermaid
flowchart TD
  classDef cloud fill:#e8f0fe,stroke:#4285f4,color:#111;
  classDef gh fill:#fff4e5,stroke:#f59e0b,color:#111;
  classDef human fill:#e9f7ef,stroke:#27ae60,color:#111;

  DPR([Draft PR]) --> C21["SDLC 21 · Pelabel PR"]:::cloud
  DPR --> C9["SDLC 09 · Peninjau kode (inline + suggestion)"]:::cloud
  DPR --> C5["SDLC 05 · Peninjau arsitektur (if design/ADR)"]:::cloud
  DPR --> RDY(["Marked Ready for review"]):::human

  RDY --> C11["SDLC 11 · Otomasi QA"]:::cloud
  RDY -. "wait for green" .-> C22["SDLC 22 · Gerbang tinjau PR"]:::cloud
  RDY --> E2E["Actions · E2E Tests"]:::gh
  CI["Actions · CI"]:::gh --> LC

  E2E --> LC{"pr-lifecycle.sh · workflow_run"}:::gh
  LC -- red --> RQ["quiet (checks visible on the PR)"]:::gh
  LC -- "green + draft" --> GC["comment: all green"]:::gh
  LC -- "green + ready" --> DISP["dispatch gate (bridge)"]:::gh --> C22

  C22 --> DEC{"every check completed?"}
  DEC -- "running / red" --> STOP["do nothing"]:::cloud
  DEC -- green --> REV{"a defect CI cannot see?"}
  REV -- yes --> RC["request changes + suggestion block"]:::cloud
  REV -- no --> APP["approve"]:::cloud
  RC --> LC
```

## Release & operations

```mermaid
flowchart LR
  classDef cloud fill:#e8f0fe,stroke:#4285f4,color:#111;
  classDef gh fill:#fff4e5,stroke:#f59e0b,color:#111;
  classDef human fill:#e9f7ef,stroke:#27ae60,color:#111;

  MG([Merge to main]) --> C4["SDLC 04 · Peta basis kode"]:::cloud
  MG --> C15["SDLC 15 · Pengelola dokumentasi"]:::cloud
  MG --> STG["deploy-staging.yml"]:::gh
  STG --> PROD["deploy-production.yml (manual)"]:::human

  C12["SDLC 12 · Uji beban → staging (03:00 on the 1st)"]:::cloud -.-> STG
  C13["SDLC 13 · Pemantau deployment (07:00)"]:::cloud -.-> PROD
  C14["SDLC 14 · Pembuat catatan rilis (Fri 22:00) → -rc prerelease"]:::cloud -.-> PROD
  C16["SDLC 16 · Pemantau log"]:::cloud -.-> PROD
  C17["SDLC 17 · Detektor anomali"]:::cloud -.-> PROD
  C18["SDLC 18 · Penuntas galat → fix PR"]:::cloud -.-> PROD
```

## Fleet supervision

```mermaid
flowchart TD
  classDef cloud fill:#e8f0fe,stroke:#4285f4,color:#111;
  WD["SDLC 27 · Pengawas armada (daily 05:00 WIB)"]:::cloud
  WD -- "reads GET /{id}/runs of every automation" --> SCAN{"finding?"}
  SCAN -- "known & safe problem" --> FIX["open a PR labelled watchdog-repair"]
  FIX --> C28["SDLC 28 · Perbaikan otomatis pengawas"]:::cloud
  C28 -- "safe?" --> VOK(["verification comment"]):::cloud
  C28 -- "no / check fails" --> ESC(["request changes / escalate to a human"])
  SCAN -- "anything else" --> ISS(["one automation-health issue per cause per week"])
```

## Scheduled fleet (Cloud cron, WIB)

| Time | Automation | Job |
|---|---|---|
| 01:30 daily | SDLC 25 · Penjaga issue | age out stalled issues |
| 05:00 daily | SDLC 27 · Pengawas armada | health of all 29 automations |
| 07:00 daily | SDLC 13 · Pemantau deployment | failed/stuck deploy → issue |
| 07:15 daily | SDLC 16 · Pemantau log | log patterns → issue |
| 07:30 daily | SDLC 17 · Detektor anomali | metric anomalies → ticket |
| 07:45 daily | SDLC 18 · Penuntas galat | production error → fix PR |
| 09:00 daily | SDLC 23 · Pemburu bug | proven bug → issue + draft PR |
| 06:00 Mon | SDLC 24 · Pemindai standar | standards divergence → `pending-maintainer` |
| 08:00 Mon | SDLC 03 · Serapan umpan balik | feedback clusters → issue |
| 08:15 Mon | SDLC 10 · Pemindai celah uji | one high-risk test gap → issue |
| 22:00 Fri | SDLC 14 · Pembuat catatan rilis | cut the next `-rc` prerelease → notes in the Release body |
| 03:00 1st | SDLC 12 · Uji beban | k6 vs staging → regression |
| 08:30 1st | SDLC 29 · Audit kematangan | rate the 18 items → one issue |

Scheduled Actions: `duplicate-sweep` (daily 01:30 UTC = 08:30 WIB, closes a duplicate issue or
PR 7 days after the warning). There is **no** `load-tests.yml` in
`.github/workflows/` — SDLC 12 (Cloud cron) is the only load runner today; the
only changelog comes from SDLC 14's Release body, not a workflow.

## Identity — who acts as whom

Two GitHub accounts carry the fleet, and the split is deliberate: the account
that *writes* an artifact is never the account that *approves* it.

| Account | Role | Automations |
|---|---|---|
| `adminypc` | Author — creates issues and pull requests | 03, 04, 06, 07, 08, 10, 13, 15, 16, 17, 18, 23, 24, 27 |
| `cipansor-bot` | Communicator — comments, labels, reviews, approves | 01, 02, 05, 09, 11, 12, 14, 19, 20, 21, 22, 25, 26, 28, Audit |

- A pull request must be attributed to a writer, so an automation that opens one
  keeps `GITHUB_TOKEN` (`adminypc`). Everything else posts through
  `GITHUB_BOT_TOKEN` (`cipansor-bot`).
- `SDLC 22 · Gerbang tinjau PR` is the only automation that may `APPROVE`. It
  runs as `cipansor-bot`, a different identity from the `adminypc` author, so
  GitHub accepts the approval; a bot that approved a PR it wrote itself would be
  a self-review and is rejected.
- Each automation is a custom runner with a secret allowlist: `GITHUB_TOKEN` is
  always present, `GITHUB_BOT_TOKEN` only for the communicators. The preset
  runner forwards every secret and is not used.

## Why it is shaped this way

- **There is no CI event in the OpenHands webhook.** The GitHub integration
  knows `pull_request`, `issues`, `issue_comment`, `push`, `release` and
  `pull_request_review` — not `check_run` or `workflow_run`. So SDLC 22 cannot
  be *waited* on until CI is green; it acts when triggered and checks the check
  runs itself, doing nothing while any is still running. The bridge makes the
  green gate precise: `pr-lifecycle.yml` (on `workflow_run`) dispatches SDLC 22
  the moment every required check passes, so the gate never races a fresh CI
  run. It needs an `OPENHANDS_API_KEY` repo secret.
- **Deterministic consequences belong to Actions.** The CI-result bridge, the
  7-day duplicate close and the label-mismatch check are scripts, not agents:
  they must fire on time and cost no tokens.
- **A red CI or a changes-requested review never reverts the PR to draft.** The
  PR stays open and the failing checks are visible on it; the gate posts the
  request-changes review and branch protection holds the merge. Reverting to
  draft was tried and removed — it hides work in progress and a human can mark
  it ready again without the lifecycle guard's help.
- **Release notes live in the GitHub Release, not in a file.** SDLC 14 runs weekly,
  cuts the next `-rc` prerelease and writes the notes into the Release body from
  the conventional commits since the last official release; it never writes
  `CHANGELOG.md` into the repository and never opens a changelog PR. The official
  (non-`rc`) release is a maintainer's manual act.
- **The fleet is the framework plus its plumbing.** SDLC 01–18 map one-to-one to
  the 18 Agentic SDLC items; SDLC 19–28 add the label/lifecycle pipelines, the
  proactive hunter and the watchdog. SDLC 29 is a monthly audit that rates the
  same 18 items and names the weakest, so the fleet can be steered deliberately.
- **Warnings never block.** `pr-description-checks.yml` only comments; it cannot
  fail a build or a release.
- **Rollback is manual.** SDLC 13 reports a bad deploy; it never rolls back.
- **Review proposes the fix.** SDLC 05/09/22 post GitHub `suggestion` blocks so a
  fix applies in one click.
- **Self-comment guard is mandatory.** Every comment-triggered automation keeps
  the `This comment was created by an AI agent` footer check (#680).
