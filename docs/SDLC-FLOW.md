# SDLC automation flow

The pipeline that carries a change from a filed issue to production, split
across two lanes that each do the part they are good at:

- **Cloud automation** (`app.all-hands.dev`) — an LLM agent that reads context
  and makes a judgement: triage, labelling, review, writing a fix. It never
  merges, and leaves the draft/ready decision to a human or the review gate.
- **GitHub Actions** — fixed consequences that must fire reliably and must not
  cost tokens: the red-CI draft revert, the duplicate sweep, the label-mismatch
  check, the deploys. The rules live in `.github/scripts/` so they run by hand.

Cloud cron schedules are in **Asia/Jakarta (WIB)**; GHA schedules are **UTC**.
Every comment trigger carries a footer guard, because an automation posts
through the same account as the reporter and would otherwise re-trigger itself
(incident #680).

## End to end

```mermaid
flowchart TB
  classDef cloud fill:#e8f0fe,stroke:#4285f4,color:#111;
  classDef gh fill:#fff4e5,stroke:#f59e0b,color:#111;
  classDef human fill:#e9f7ef,stroke:#27ae60,color:#111;

  subgraph ISSUE["1 · Issue"]
    I([Issue opened]) --> C1["SDLC 01 · Bug triage"]:::cloud
    I --> C2["SDLC 02 · Effort estimator"]:::cloud
    I --> C3["SDLC 19 · Issue labeller"]:::cloud
    C3 --> D{"Clear enough?"}
    D -- yes --> R(["ready"])
    D -- no --> NI(["needs-info"])
    NI --> C20["SDLC 20 · Issue clarifier"]:::cloud --> D
    PM(["pending-maintainer"]) --> C26["SDLC 26 · Discussion"]:::cloud --> D
    I -. "label bug" .-> C6["SDLC 06 · Bug reproducer"]:::cloud
    C6 --> BUG(["failing test + draft PR"])
  end

  subgraph PRL["2 · Pull request"]
    R --> C7["SDLC 07 · Ticket to PR"]:::cloud --> DPR([Draft PR])
    DPR --> C21["SDLC 21 · PR labeller"]:::cloud
    DPR --> C9["SDLC 09 · Code reviewer"]:::cloud
    DPR --> C5["SDLC 05 · Architecture reviewer"]:::cloud
    DPR --> RDY(["Ready for review"]):::human
    RDY --> C11["SDLC 11 · QA automator"]:::cloud
    RDY --> C22["SDLC 22 · PR review gate"]:::cloud
    RDY --> GAE["Actions · E2E Tests"]:::gh
    GAC["Actions · CI"]:::gh --> LC{"pr-lifecycle.sh (workflow_run)"}:::gh
    GAE --> LC
    LC -- "red / changes requested" --> DR(["draft + comment"]):::gh
    LC -- "green + ready" --> OK(["quiet · approval left to SDLC 22"]):::gh
    C22 --> DEC{"every check completed?"}
    DEC -- "running / red" --> NO["do nothing"]:::cloud
    DEC -- green --> AP(["approve or request changes + suggestion"]):::cloud
  end

  subgraph REL["3 · Release & operations"]
    DPR -. merge .-> MG([Merge to main])
    MG --> C4["SDLC 04 · Codebase mapper"]:::cloud
    MG --> C15["SDLC 15 · Documentation manager"]:::cloud
    MG --> STG["deploy-staging.yml (build + push image)"]:::gh
    STG --> PROD["deploy-production.yml (manual · sha)"]:::human
    PROD --> REL2(["release published"])
    REL2 --> C14["SDLC 14 · Release notes"]:::cloud
  end
```

## Issue lifecycle

```mermaid
flowchart TD
  classDef cloud fill:#e8f0fe,stroke:#4285f4,color:#111;
  classDef human fill:#e9f7ef,stroke:#27ae60,color:#111;

  I([Issue opened]) --> C19["SDLC 19 · Issue labeller"]:::cloud
  C19 --> D{"Enough detail to implement?"}
  D -- yes --> R(["ready"])
  D -- no --> Q(["question"])
  D -- no --> NI(["needs-info"])

  NI --> C20["SDLC 20 · Issue clarifier"]:::cloud
  C20 -- "reporter answers" --> D

  I -. "label bug" .-> C6["SDLC 06 · Bug reproducer"]:::cloud
  C6 --> BUG["draft PR (failing test) + evidence on the issue"]:::cloud
  C6 -. "behaviour is intended" .-> INV(["invalid / duplicate"])

  PM(["pending-maintainer"]) --> C26["SDLC 26 · Discussion"]:::cloud
  C26 -- "go-ahead" --> R
  C26 -- "reject" --> WF(["wontfix → closed"])

  R --> C7["SDLC 07 · Ticket to PR"]:::cloud --> DPR([Draft PR])

  C25["SDLC 25 · Issue steward (cron 01:30 WIB)"]:::cloud
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

  DPR([Draft PR]) --> C21["SDLC 21 · PR labeller"]:::cloud
  DPR --> C9["SDLC 09 · Code reviewer (inline + suggestion)"]:::cloud
  DPR --> C5["SDLC 05 · Architecture reviewer (if design/ADR)"]:::cloud
  DPR --> RDY(["Marked Ready for review"]):::human

  RDY --> C11["SDLC 11 · QA automator"]:::cloud
  RDY --> C22["SDLC 22 · PR review gate"]:::cloud
  RDY --> E2E["Actions · E2E Tests"]:::gh
  CI["Actions · CI"]:::gh --> LC

  E2E --> LC{"pr-lifecycle.sh · workflow_run"}:::gh
  LC -- red --> DR["→ draft + failing-check comment"]:::gh
  LC -- "changes requested" --> DR2["→ draft + comment"]:::gh
  LC -- "green + draft" --> GC["comment: all green"]:::gh
  LC -- "green + ready" --> QUIET["quiet (approval = SDLC 22)"]:::gh

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

  MG([Merge to main]) --> C4["SDLC 04 · Codebase mapper"]:::cloud
  MG --> C15["SDLC 15 · Documentation manager"]:::cloud
  MG --> STG["deploy-staging.yml"]:::gh
  STG --> PROD["deploy-production.yml (manual)"]:::human
  PROD --> REL(["release published"])
  REL --> C14["SDLC 14 · Release notes"]:::cloud

  C12["SDLC 12 · Load tester → staging (monthly)"]:::cloud -.-> STG
  C13["SDLC 13 · Deployment monitor (07:00)"]:::cloud -.-> PROD
  C16["SDLC 16 · Log monitor"]:::cloud -.-> PROD
  C17["SDLC 17 · Anomaly detector"]:::cloud -.-> PROD
  C18["SDLC 18 · Error resolver → fix PR"]:::cloud -.-> PROD
```

## Fleet supervision

```mermaid
flowchart TD
  classDef cloud fill:#e8f0fe,stroke:#4285f4,color:#111;
  WD["SDLC 27 · Fleet watchdog (daily 05:00 WIB)"]:::cloud
  WD -- "reads GET /{id}/runs of every automation" --> SCAN{"finding?"}
  SCAN -- "known & safe problem" --> FIX["open a PR labelled watchdog-repair"]
  FIX --> C28["SDLC 28 · Watchdog auto-repair"]:::cloud
  C28 -- "safe?" --> VOK(["verification comment"]):::cloud
  C28 -- "no / check fails" --> ESC(["request changes / escalate to a human"])
  SCAN -- "anything else" --> ISS(["one automation-health issue per cause per week"])
```

## Scheduled fleet (Cloud cron, WIB)

| Time | Automation | Job |
|---|---|---|
| 01:30 daily | SDLC 25 · Issue steward | age out stalled issues |
| 05:00 daily | SDLC 27 · Fleet watchdog | health of all 28 automations |
| 07:00 daily | SDLC 13 · Deployment monitor | failed/stuck deploy → issue |
| 07:15 daily | SDLC 16 · Log monitor | log patterns → issue |
| 07:30 daily | SDLC 17 · Anomaly detector | metric anomalies → ticket |
| 07:45 daily | SDLC 18 · Error resolver | production error → fix PR |
| 09:00 daily | SDLC 23 · Bug hunter | proven bug → issue + draft PR |
| 06:00 Mon | SDLC 24 · Standard scout | standards divergence → `pending-maintainer` |
| 08:00 Mon | SDLC 03 · Feedback ingestion | feedback clusters → issue |
| 08:15 Mon | SDLC 10 · Coverage expander | test gaps → PR |
| 03:00 1st | SDLC 12 · Load tester | k6 vs staging → regression |

Scheduled Actions: `duplicate-sweep` (daily, closes a duplicate 7 days after the
warning) and `load-tests.yml` (daily 18:00 UTC = 01:00 WIB).

## Why it is shaped this way

- **There is no CI event in the OpenHands webhook.** The GitHub integration
  knows `pull_request`, `issues`, `issue_comment`, `push`, `release` and
  `pull_request_review` — not `check_run` or `workflow_run`. So SDLC 22 cannot
  be *waited* on until CI is green; it acts when triggered and checks the check
  runs itself, doing nothing while any is still running. A precise green gate
  needs the bridge: `pr-lifecycle.yml` (already on `workflow_run`) calling
  `POST /api/automation/v1/{id}/dispatch` — that needs an `OPENHANDS_API_KEY`
  repo secret.
- **Deterministic consequences belong to Actions.** The red-CI draft revert, the
  changes-requested revert, the 7-day duplicate close and the label-mismatch
  check are scripts, not agents: they must fire on time and cost no tokens.
- **Warnings never block.** `pr-description-checks.yml` only comments; it cannot
  fail a build or a release.
- **Rollback is manual.** SDLC 13 reports a bad deploy; it never rolls back.
- **Review proposes the fix.** SDLC 05/09/22 post GitHub `suggestion` blocks so a
  fix applies in one click.
- **Self-comment guard is mandatory.** Every comment-triggered automation keeps
  the `This comment was created by an AI agent` footer check (#680).
