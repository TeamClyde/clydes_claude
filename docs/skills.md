# Skills System

---

## Purpose

This plan is the catalog and design spec for every skill in `~/.claude/skills/`. When a plan references a skill, it is deferring the skill design here. This plan is the authoritative source for what each skill does.

---

## SKILL.md File Format

Every skill lives in its own directory under `~/.claude/skills/`. The entry point is always `SKILL.md`.

```
~/.claude/skills/<skill-name>/
├── SKILL.md          ← required
├── agents/           ← optional: agent prompt files (e.g. infra-init uses this)
│   └── <phase>.md
└── template.md       ← optional: output templates for Claude to fill in
```

Required frontmatter at the top of every `SKILL.md`:

```yaml
---
name: skill-name          # kebab-case, max 64 chars — becomes the /slash-command
description: >            # max 1024 chars — the only field Claude reads at startup
  [Third-person. What this skill does and when to invoke it.]
argument-hint: optional   # shown in autocomplete; describes expected args
---
```

The `description` is the primary discovery mechanism. Claude reads only `name` and `description` at startup; the full `SKILL.md` body loads only when Claude determines the skill is relevant. Write the description as if it is the only thing that will be read when deciding whether to invoke this skill.

---

## Skill Registry

All skills invoked via: `Skill { skill: "<name>", args: "..." }`

### Orchestration

| Skill | Responsibility | Hands off to |
|-------|----------------|-------------|
| `brainstorming` | Design-first exploration for M/L work; proposes approaches with trade-offs | `writing-plans` |
| `writing-plans` | Produces plan doc: concrete file paths, task breakdown, architecture blueprint | `plan-gate` (auto) |
| `plan-gate` | Gates plan through architect → test-strategy → test-builder → execution handoff | `executing-plans` or `subagent-driven-development` |
| `executing-plans` | Task-by-task execution with test-runner per task; manages Jira transitions | `finishing-a-development-branch` |
| `subagent-driven-development` | Dispatches fresh subagent per task with two-stage review; orchestrator runs test-runner | `finishing-a-development-branch` |
| `finishing-a-development-branch` | Presents merge/PR/keep/discard options after all tasks complete | User decision |

### Component Creation

| Skill | Responsibility | Invoked via |
|-------|----------------|-------------|
| `creating-tools` | Entry point for all component creation; routes by artifact type | Direct |
| `writing-skills` | TDD methodology for skill creation; baseline test required first | `creating-tools` only |
| `writing-agents` | TDD methodology for agent creation; baseline invocation test required first | `creating-tools` only |
| `writing-rules` | Rule-vs-skill decision, scope selection, observational testing guidance | `creating-tools` only |

### Infrastructure & Quality

| Skill | Responsibility |
|-------|----------------|
| `infra-init` | Codebase graph: 3-phase orchestration (structure → batch-index → graph-build) |
| `e2e-init` | Per-repo testing backbone: produces `testing-plan.md`, `e2e-plan.md`, `run-tests.sh` |
| `project-setup` | New-repo onboarding wizard; generates `project.json`; configures Jira and workflow preferences; Phase 4 (Tooling Setup) detects stacks and drives the install-vetting funnel for the stack's tooling |
| `adherence-audit` | Semantic consistency checker: dead references, mismatches, orphaned components |
| `pulser` | Structural quality check for new skills/agents against Anthropic's 7 principles |

### Git / Plan / Jira

| Skill | Responsibility |
|-------|----------------|
| `git-manager` | All git operations: commits, branching, push, PR, worktrees — never Bash git directly |
| `git-manager-workspace` | Variant of `git-manager` for multi-worktree contexts |
| `plan-management` | TODO.md maintenance and plan doc status tracking after Jira ticket transitions |

### Thinking & Debugging

| Skill | Responsibility |
|-------|----------------|
| `different-viewpoint` | Full CIA Phoenix Checklist sweep — surfaces frame shifts and hypothesis flaws |
| `different-viewpoints-lite` | 5-question adversarial challenge; faster than full sweep |
| `dispatching-parallel-agents` | Coordinates 2+ independent tasks as parallel agent dispatches |
| `verification-before-completion` | Pre-completion gate: verifies tests pass and no regressions before claiming done |
| `systematic-debugging` | Structured root-cause diagnosis before any fix; mandatory after test-runner FAILURE |
| `test-driven-development` | TDD cycle helper for feature/bugfix: write failing test → implement → verify |
| `feedback` | Captures workflow friction mid-session to `docs/workflow-feedback.md` |
| `review-workflow` | Deep workflow audit: Explore scan + Phoenix analysis + proposals |

### Code Review

| Skill | Responsibility |
|-------|----------------|
| `requesting-code-review` | Prepares and opens PR with structured review request |
| `receiving-code-review` | Processes and implements reviewer feedback systematically |

### Support

| Skill | Responsibility |
|-------|----------------|
| `using-git-worktrees` | Creates and manages git worktrees for feature isolation |
| `using-superpowers` | Conversation-start orientation: skill discovery, instruction priority, Orientation Protocol |

### Install Vetting

| Skill | Responsibility |
|-------|----------------|
| `vet-install` | Entry point for the 3-gate install-vetting funnel; runs gates in order, consolidates one report, always asks user before any install — never auto-installs |
| `vet-reputation` | Gate 1 — assesses whether a tool is reputable, well-maintained, and trustworthy before installing |
| `vet-capability-fit` | Gate 2 — determines whether a candidate tool covers the stated need and which component provides that capability |
| `vet-security` | Gate 3 — two-layer: OSV (CVE + `MAL-` malware) + Cisco mcp-scanner + `ai-tool-security-reviewer` semantic pass for agentic surfaces; advisory |

---

## Orchestration Skill Designs

The six orchestration skills form the primary workflow chain from user request to committed code. They are the spine of the system — all other skills are invoked from within this chain or in support of it.

---

### 1. `brainstorming` — Design-First Exploration

**Purpose:** Turn a vague feature idea or refactor goal into a fully formed design before any planning begins. Asks clarifying questions one at a time, proposes 2–3 approaches with trade-offs, gets design approval, and documents the outcome.

**When to invoke:** M/L work where the right implementation isn't obvious and options need surfacing before code is touched. Do not skip when requirements feel clear — brainstorming surfaces assumptions.

**Output:** Design doc at `plans/<slug>/<slug>-design.md`. Committed before handing off.

**Hands off to:** `writing-plans` automatically after design is approved.

---

### 2. `writing-plans` — Implementation Plan Author

**Purpose:** Produce a self-contained plan doc from a spec or design doc. Every task has exact file paths, complete code, exact commands with expected output. Assumes zero codebase knowledge in the executor.

**When to invoke:** After brainstorming completes, or directly for S/M work with a clear approach.

**Output:** `plans/<slug>/<slug>-plan.md`

**Hands off to:** `plan-gate` automatically after saving the plan doc.

**Plan doc required sections:** Goal, Architecture, Tech Stack, Task Reference table, task steps with checkboxes.

---

### 3. `plan-gate` — Pre-Execution Gate

**Purpose:** Bridge between planning and execution. Ensures no plan starts implementation without passing all mandatory gates.

**Gate sequence:**
1. `architect` agent review → APPROVED or NEEDS REVISION (up to 3 iterations)
2. `test-strategy` agent → appends `## Testing` section to plan doc
3. Checkpoint: human reviews and approves test strategy
4. `test-builder` agent → writes failing tests to disk (in parallel with implementation start)
5. Jira ticket creation (if enabled)
6. TODO.md registration via `plan-management`

**When to invoke:** Auto-fires after `writing-plans`. Can be invoked manually against any plan doc at `plans/<slug>/<slug>-plan.md`.

**Hands off to:** `executing-plans` or `subagent-driven-development`.

---

### 4. `executing-plans` — Sequential Task Executor

**Purpose:** Load a plan, review it critically, and execute tasks one at a time with verification at each step.

**Per-task loop:**
1. Read the task from the plan doc
2. Implement (or dispatch implementer)
3. Invoke `test-runner` (if `.claude/testing-plan.md` exists)
4. On PASS: invoke `verification-before-completion` → `git-manager` commit → Jira transition
5. On FAILURE: mandatory `systematic-debugging` before any fix attempt
6. Update plan doc row (✅) and TODO.md via `plan-management`

**When to invoke:** After plan-gate completes, or when resuming work in a new session with an existing plan doc.

**Hands off to:** `finishing-a-development-branch` when all tasks complete.

---

### 5. `subagent-driven-development` — Parallel Subagent Executor

**Purpose:** Execute a plan by dispatching a fresh subagent per task. Preserves orchestrator context for coordination work; gives each implementer an isolated context window.

**Per-task loop:**
1. Dispatch implementer subagent with task content + full plan as context
2. Receive implementation back
3. Run two-stage review: spec compliance → code quality
4. Orchestrator invokes `test-runner` (caller must have Skill tool access; subagents never invoke test-runner directly)
5. On PASS: `git-manager` commit → Jira transition → `plan-management` update
6. On FAILURE: mandatory `systematic-debugging` in orchestrator context

**When to use over `executing-plans`:** When tasks are mostly independent and you are staying in the same session (executing-plans is better for multi-session plans).

**Hands off to:** `finishing-a-development-branch` when all tasks complete.

---

### 6. `finishing-a-development-branch` — Branch Completion

**Purpose:** Wrap up a development branch cleanly after all tasks complete.

**What it does:**
1. Verifies tests pass (final sanity check)
2. Determines target base branch
3. Presents 4 options: (1) merge locally, (2) push and create PR, (3) keep branch as-is, (4) discard work
4. Executes the chosen path via `git-manager`

**When to invoke:** After all tasks in a plan are complete and verified passing.

---

## Skill Designs

---

### 1. `git-manager` — Git Workflow

**Purpose:** Handle all git operations for any repo. Invoked by the main context after task completion, at Epic start, at Epic close, and whenever a git operation is needed. All git work routes through this skill — no ad-hoc Bash git commands.

**Frontmatter:**
```yaml
---
name: git-manager
description: >
  Handles all git operations: branch creation, commits, push, PR creation, and
  worktree management. Invoke for any git operation — committing after a task,
  creating a feature branch for a new Epic, opening a squash-merge PR at Epic
  completion, or setting up/cleaning up worktrees. Never use ad-hoc Bash git
  commands; always route through this skill. Accepts: files to stage, commit
  type, description, and optional Jira key.
argument-hint: "commit files:[...] type:feat|fix|chore description:'...' jira-key:PROJ-N"
---
```

**Inputs:**
- `files` — explicit list of files to stage
- `type` — conventional commit type: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `ci`
- `description` — commit subject line
- `jira-key` — optional Jira issue key (e.g. `PROJ-42`)

**Procedures:**

**Standards (commit format, branching, merge strategy):**

| Concern | Standard |
|---------|----------|
| Branch naming | `feature/PROJ-N-slug`, `fix/PROJ-N-slug`, `chore/slug`, `docs/slug` |
| Commit format | `type(scope): subject` / blank line / body (why) / blank line / `[PROJ-N]` / `Co-Authored-By:` |
| Commit types | `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf` |
| Subject line | Imperative mood, max 72 chars, no Jira key |
| Body | Required for non-trivial changes — explain why, not what |
| Atomic commits | One logical, complete change per commit — never mix types |
| Merge strategy | All PRs squash-merged into `main`; squash commit = PR title as conventional commit |

**Existing repo conventions:** Before starting work, run `git log --oneline -20` and `git branch -a`. If the repo has its own conventions, follow those instead of the defaults above.

---

**Workflows:**

*`start-work` — begin a new task:*
1. `git fetch origin`
2. `git checkout main && git pull origin main`
3. `git checkout -b <branch-name>`
4. `git push -u origin <branch-name>`

*`commit` — stage and commit:*
1. `git status` + `git diff` — review what has changed
2. Stage specified files only (`git add <file>` per file)
3. `git diff --staged` — verify exactly what will be committed; stop if unexpected files, debug code, or secrets appear
4. Validate message format (conventional commits, key in footer, subject ≤72 chars)
5. `git commit`; surface hook output if rejected — stop, do not retry with `--no-verify`
6. Report commit hash

*`publish` — push to remote:*
1. Preflight: current branch, remote reachability, no uncommitted changes
2. Block if on `main`/`master`/`develop`/`release` — stop and ask
3. Check if a PR is open for this branch:
   - No PR → `git pull --rebase origin main` (maintain linear history)
   - PR open → `git pull --merge origin main` (reviewers are tracking commits)
4. Conflicts during pull → return file list, stop, do not auto-resolve
5. `git log --oneline main..HEAD` — flag any WIP/debug/fix-typo commits before pushing
6. `git push origin <branch>` — report commit range and whether CI config was found

*`sync` — bring branch up to date with main:*
1. Check if PR is open (determines rebase vs. merge strategy, same as `publish` step 3)
2. `git fetch origin` then pull with the appropriate strategy
3. Return conflict list if any — stop, do not auto-resolve

*`finish` — clean up after merge:*
1. `git checkout main && git pull origin main`
2. `git branch -d <branch-name>` (safe delete — fails if unmerged)
3. `git push origin --delete <branch-name>`
4. `git remote prune origin`

---

**Blocking conditions (stop and surface to user):**
- Push to `main`/`master`/`develop`/`release` without explicit instruction
- `git add .` or `git add -A` — never; stage specific files only
- Force push (`--force`) — use `--force-with-lease` on feature branches only, with explicit instruction
- Pre-commit hook rejection — surface output, do not bypass
- Secrets or credentials detected in staged content
- Uncommitted changes when switching branches — stash first or stop
- Merge conflicts — return file list, wait for user
- MCP authentication failure — report remote, stop, do not retry

**Warnings (note but do not stop):**
- Staged diff >50 files or >5k lines — surface before committing
- WIP/debug/fix-typo messages in commit log before push — flag
- Branch open >5 days without a PR — note it
- Branch behind `main` by >10 commits before pushing — recommend sync first

**What it does NOT do:**
- Call Jira — delegate to `jira-workflow-manager`
- Read or analyze source code
- Make decisions about what to commit — callers specify files explicitly

---

### 2. `infra-init` — Codebase Graph Generation

**Purpose:** Generate the codebase knowledge graph for a repo. Orchestrates a 3-phase workflow — spawning and coordinating `infra-init-structure`, `infra-init-batch-indexer`, and `infra-init-graph-builder` agents in sequence and in parallel. Run once per repo during setup, then re-run when the codebase grows significantly.

**Frontmatter:**
```yaml
---
name: infra-init
description: >
  Indexes the codebase into codebase-memory-mcp and generates a human-readable
  summary. Orchestrates a 3-phase process: structure detection, parallel batch
  indexing via codebase-memory-mcp, and CODEBASE.md generation. Produces
  .claude-init/CODEBASE.md and .claude-init/enrichments.json. Run once per repo
  during initial setup (step 2 of new-repo-setup checklist), then re-run when
  the codebase grows significantly. Handles resume automatically if a prior run
  was interrupted.
---
```

**Inputs:** None. Reads from the current repo's directory structure and `CLAUDE.md`.

**Outputs:**

| File | Location | Contents |
|------|----------|---------|
| `CODEBASE.md` | `.claude-init/` | 5-category structured index (Entry Points, Domain Handlers, External Services, Use Cases, Repositories — names vary by repo type) |
| `enrichments.json` | `.claude-init/` | Env var reads and serverless trigger metadata — queried by agents for domain-level context |
| `structure.json` | `.claude-init/` | Repo metadata from Phase 1 — consumed by skill to build batch assignments |
| `progress.json` | `.claude-init/` | Batch manifest — persists state for resume on interruption |

The symbol graph itself is managed globally by the codebase-memory-mcp binary (SQLite-backed). There is no per-repo `codebase-graph.json`.

#### Phase 1 — Structure Detection

Spawn `infra-init-structure` (Haiku). Provide: repo root path.

Returns `structure.json` (repo type, key dirs) and `progress.json` (all source files assigned to batches, ~80K token budget per batch).

If `progress.json` already exists: read it and offer the user two options — resume from the last complete batch, or start over.

#### Phase 2 — Parallel Batch Indexing

Spawn `infra-init-batch-indexer` agents (Haiku), up to 5 in parallel per wave. Each agent receives its pre-assigned batch ID.

Orchestration loop:
1. Read `progress.json` — select next wave of `pending` batches (up to 5)
2. Spawn one agent per batch in parallel
3. Wait for all agents in the wave to complete
4. Any `needs_continuation` batches: re-spawn with same batch ID plus the agent's handoff doc
5. Repeat until all batches are `complete`

If an agent fails without writing a result: mark batch as `failed`, continue remaining batches, report failures after all other batches finish.

#### Phase 3 — CODEBASE.md Generation

Spawn `infra-init-graph-builder` (Sonnet). Provide: paths to `.claude-init/progress.json`, `.claude-init/structure.json`, and `.claude-init/enrichments.json`.

Queries codebase-memory-mcp and writes `.claude-init/CODEBASE.md`.

**Post-completion:**
- Update `CLAUDE.md`: add/update the codebase graph section with artifact paths and generation date
- Report: files indexed, repo type, any failed batches, artifact paths

**Re-run behavior:**
- If `CODEBASE.md` already exists: confirm with user before overwriting. Default is full refresh.
- If `progress.json` is incomplete: offer resume or restart.

**What it does NOT do:**
- Read or analyze individual source files directly (that is the batch indexer's job)
- Write any application code
- Make decisions about what the codebase should look like — discovery only

---

### 3. `e2e-init` — Testing Backbone Setup

**Purpose:** Initialize the testing backbone for a repo. Reads the repo's project type, existing test frameworks, and CI pipeline configuration, then produces two documents — a repo testing plan and an E2E plan — that all subsequent testing work builds on. Re-runnable: re-running diffs and updates the existing documents rather than replacing them.

**Frontmatter:**
```yaml
---
name: e2e-init
description: >
  One-time repo testing backbone setup. Reads the repo structure, inventories
  existing test frameworks, maps service boundaries, and produces two documents:
  .claude/testing-plan.md (the lightweight foundation consulted by the Test
  Strategy Agent on every plan) and plans/e2e-plan.md (E2E scenario inventory
  and tooling gaps). Re-runnable — re-running diffs and updates existing documents.
  Run during new repo onboarding after /infra-init, before writing any new code.
---
```

**Inputs:** None. Re-runnable with no arguments.

**Outputs:**

| File | Location | Contents |
|------|----------|---------|
| `testing-plan.md` | `.claude/` | Repo testing strategy — read by Test Strategy Agent on every plan |
| `e2e-plan.md` | `plans/` | E2E scenario inventory, tooling gaps, instrumentation notes |

**Steps:**

#### 1 — Repo orientation

Read in order:
1. `.claude-init/CODEBASE.md` if it exists — repo type, entry points, key modules
2. Existing test directories and test runner configs (not individual test files)
3. CI/CD pipeline config (`.github/workflows/`, `buildspec.yml`, etc.)
4. Package manifests — identify test frameworks already installed

If `.claude/testing-plan.md` already exists: this is a re-run. Read the existing document and note what has changed.

#### 2 — Project type classification

| Type | Examples | E2E Approach |
|------|---------|--------------|
| Backend | Lambda, APIs, data pipelines | Invoke → verify side effects (DynamoDB, SQS, SES) |
| UI/Client | Mobile apps, web apps | Playwright/Detox — full user flows |
| Firmware | Embedded device software | HIL test sequences or simulation |
| Mixed | Repos spanning multiple types | One section per type |

#### 3 — Test inventory

- List existing test files and their apparent coverage
- Identify what is currently tested (happy path, edge cases, integration)
- Identify gaps: business logic with no tests, integration paths not covered
- Determine whether CI runs tests and gates merge on test passage

#### 4 — Service boundary mapping

Map source directories to services for targeted pre-commit scoping:
```
src/auth/          → auth-handler
src/notifications/ → notification-handler
src/utils/         → ALL (shared — triggers full suite)
```
Identify the "full suite trigger" paths (shared utilities, models, etc. that affect everything).

#### 5 — Pre-commit hook check

If `scripts/run-tests.sh` does not exist: generate it, scoped to the service boundaries from Step 4. Do not install or configure tooling without user confirmation.

#### 6 — Write output documents

`.claude/testing-plan.md` template:
```markdown
## Repo Testing Plan
Generated: [date]

### Project Type
[Backend / UI/Client / Hardware / Mixed]

### Test Frameworks
- [framework, version, config file]
- Run command: [command]

### Coverage Scope
[What level of coverage is expected for this repo]

### Service Boundaries
- [dir] → [service]
- Full suite trigger: [dirs that affect multiple services]

### Pre-Commit Hook
- Script: scripts/run-tests.sh
- Scope: [change-aware / full suite]

### CI Pipeline
- System: [GitHub Actions / Bitbucket / etc.]
- Stages: [lint, test, build, deploy]
- Merge gate: [what blocks a merge]

### E2E Plan
[Path to plans/e2e-plan.md, or PLANNED GAP]

### Log Map
| System | Log Location | What's Logged | Level |
|--------|-------------|---------------|-------|
```

`plans/e2e-plan.md` template:
```markdown
# E2E Plan — [Repo Name]
Generated: [date]

## E2E Approach
[Invoke pattern, side effects to verify, tooling]

## Existing E2E Tests
[List — or "none"]

## Known Gaps
[Paths not covered by E2E]

## Instrumentation
[Sentry, CloudWatch log groups, alert thresholds]

## First E2E Test to Write
[Specific inputs and expected outputs for the most valuable first test]
```

**Post-completion:**
- Update `CLAUDE.md`: add testing section with document paths and generation date
- Ask user to review before any new code is written: "Review `.claude/testing-plan.md` — does this match your understanding? Correct anything before we begin."

**Re-run behavior:**
- Compare new findings against existing documents
- Show a diff of proposed changes to both files before writing
- Do not overwrite without user confirmation

**What it does NOT do:**
- Write tests (that is the test-builder agent's job)
- Install test tooling without user confirmation
- Read individual test file contents — only test runner configs and directory structure

---

### 4. `plan-management` — TODO.md and Plan Status Tracking

**Purpose:** Keep TODO.md current as a high-level local view of all work. This skill absorbs the `todo-manager` agent (Plan 05) — that agent was converted here because it is invoked at high frequency, performs pure structural edits on a markdown file, and requires no reasoning. Sequential execution in the main context via a skill workflow is the correct pattern; agent-spawn overhead is not justified.

**Frontmatter:**
```yaml
---
name: plan-management
description: >
  Maintains TODO.md as a high-level local view of all in-flight and planned
  work. Invoke after Jira ticket transitions (created, in_progress, completed),
  when capturing backlog items, or when a full reconcile is needed. Tracks
  work at feature granularity — one TODO entry per meaningful scope item, not
  per ticket. Also used to promote Backlog items to Up Next when a plan is
  created for them.
argument-hint: "status:created|in_progress|completed|backlog|reconcile ticket-key:PROJ-N plan-doc:plans/... summary:'...'"
---
```

**Inputs:**
- `status` — one of: `created`, `in_progress`, `completed`, `backlog`, `reconcile`
- `ticket-key` — Jira key (e.g. `PROJ-42`); required for all statuses except `backlog`
- `plan-doc` — path to the relevant plan doc; required for plan-backed items
- `summary` — 1–2 sentence description of what was done; required for `completed`

**TODO.md sections:** `In Progress` / `Up Next` / `Backlog` / `History` — fixed order, never renamed.

**Item types:**
- *Plan-backed* — checkboxes with sub-tasks, Jira key(s), plan doc reference. Used in In Progress and Up Next.
- *Backlog* — plain bullet notes describing what is known. No plan or Jira ticket required. Annotated with plan reference when one is created, then promoted to Up Next.

**Workflows:**

*`created` — plan finalized, tickets created:*
1. Check whether the work already exists as a Backlog item (plan-to-backlog matching)
   - If match found: annotate the backlog item with plan doc path and Jira key(s); promote to Up Next
   - If no match: add a new plan-backed Up Next entry with Jira key(s) and plan doc reference
2. Check for duplicates before adding — never create a second entry for overlapping scope

*`in_progress` — execution begins:*
1. Move the matching Up Next item to In Progress
2. Check In Progress count — if it would exceed 3, surface the conflict to the caller before proceeding

*`completed` — task or feature group done:*
1. Mark the relevant sub-tasks complete (check the boxes)
2. If all sub-tasks under an item are complete: move the entire item to History with date and summary
3. If partially complete (item maps to multiple tickets, not all done): update sub-task state only; leave item in place

*`backlog` — ad-hoc future scope capture:*
1. Check for duplicates
2. Add a plain bullet to Backlog with context note explaining why the work is needed and any known dependencies or blockers
3. Apply optional tag if relevant: `[scope]`, `[blocked]`, or `[debt]`

*`reconcile` — full sync:*
1. Read TODO.md current state
2. For each plan-backed item: verify Jira ticket status matches TODO position (may query `jira-workflow-manager` for a status read)
3. Surface any items that are out of sync — do not auto-move without confirmation

**Item quality rules:**
- Descriptions must be specific and actionable — "Implement auth" not "fix auth stuff"
- Every plan-backed item links to a Jira ticket and a plan doc — no orphaned entries
- Backlog items include context notes explaining *why* the work is needed
- Items are temporary by design — they move through sections and get archived; TODO.md is not a graveyard

**Constraints:**
- Keep In Progress ≤3 items — surface to caller if exceeded
- Never restructure sections not touched by the current operation
- When History exceeds ~15 entries, note it to the caller (archive signal)

**Relationship to `jira-workflow-manager`:** Independent tracking layers — not triggered in lockstep. Not every Jira ticket warrants a TODO update; only large tickets or logical groupings that together represent a meaningful unit of work. During `reconcile`, this skill may invoke `jira-workflow-manager` for a status read.

**What it does NOT do:**
- Decide what work to do next
- Create or transition Jira tickets — delegate to `jira-workflow-manager`
- Git operations — delegate to `git-manager`

**Full spec:** See Plan 06 for the complete TODO.md format and lifecycle rules.

---

## Cross-Plan Ripple Effects

| Decision | Plans Affected | Notes |
|----------|---------------|-------|
| Commit format and git standards | Plan 04 | `git-manager` is the single owner of these; Plan 04 defines the standards that the skill implements. `git-manager` routes ALL git operations — not just complex ones — to maintain consistent cadence and good git practice |
| Artifact path `.claude-init/` | Plan 01, Plan 07 (`infra-init-protocol.md`) | All three must agree on this path |
| Testing plan path `.claude/testing-plan.md` | Plan 03, Plan 07 | All plans referencing the testing plan must use the same path |
| `e2e-plan.md` schema | Plan 03 | Templates here must match Plan 03 spec exactly |
| TODO.md format and status transition rules | Plan 06 | `plan-management` implements what Plan 06 defines; both must stay in sync |
| `todo-manager` → `plan-management` migration | Plan 05, Plan 06 | `todo-manager` was a standalone agent; it is now a skill workflow here. Plan 05 registry updated; Plan 06 acknowledges the change |

---

## Deliverables

| # | Skill | File | Plan |
|---|-------|------|------|
| 1 | `git-manager` | `~/.claude/skills/git-manager/SKILL.md` | 04 / 08 |
| 2 | `infra-init` | `~/.claude/skills/infra-init/SKILL.md` | 01 / 08 |
| 3 | `e2e-init` | `~/.claude/skills/e2e-init/SKILL.md` | 03 / 08 |
| 4 | `plan-management` | `~/.claude/skills/plan-management/SKILL.md` | 06 / 08 |

---

## Cross-Plan Dependencies

| Plan | Relationship | Notes |
|------|-------------|-------|
| Plan 01 — Codebase Knowledge | `infra-init` artifact schemas and agent designs | Skill cannot be finalized until Phase 1–3 agent specs are locked |
| Plan 03 — Testing System | `e2e-init` document schemas and pre-commit hook spec | testing-plan.md and e2e-plan.md templates must match Plan 03 definitions |
| Plan 04 — Git Workflow | `git-manager` commit format and branching standards | Plan 04 defines the standards; this plan implements them in the skill |
| Plan 06 — Plan Management | `infra-init` agent names; `plan-management` skill spec | `infra-init` orchestrates agents defined in Plan 06; `plan-management` skill implements the TODO.md lifecycle rules defined in Plan 06 |
| Plan 07 — Rules System | Artifact and document paths | `infra-init-protocol.md` and `testing-protocol.md` paths must match what the skills produce |
