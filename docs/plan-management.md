# Plan Management System

---

## Problem Statement

Plans were created inconsistently, lived in the wrong places, and fell out of sync with reality. The auto-generated files in `~/.claude/plans/` are Claude Code's internal scratch pad — not a durable record of what was designed or built. Large architectural plans were sometimes copied to repos, sometimes not. TODO.md entries drifted from their backing plans. When a session ended mid-feature, the next session had no clean way to resume.

This plan replaces the patchwork of existing rules with a unified protocol for:
1. **Making a plan** — research-first discovery, structured drafting, and a two-gate review before execution
2. **Maintaining plans** — keeping plans in the right place, in sync with execution, and resumable across sessions

The existing rules in `~/.claude/rules/plan-docs.md`, `~/.claude/rules/filesystem/efficiency.md`, and parts of `~/.claude/rules/workflow-phases.md` will be rewritten as deliverables from this plan. What was good in them is carried forward; nothing is preserved just because it exists.

---

## Part 1: Making a Plan

### 1.1 — Research First, Then Ask

The order matters: **research first, then ask targeted questions** — not the reverse.

A good prompt from the user contains intent but rarely all the context needed to write a sound plan. Before surfacing questions, Claude should gather what it can from the repo so that questions are precise and don't ask the user to explain things Claude could find itself.

**Step 1 — Orient from existing artifacts:**
- If `/infra-init` has been run: read `CODEBASE.md` first. It gives repo type, entry points, and key modules in a few dozen lines. This is the orientation read — do not skip it.
- Read any existing plan docs in `plans/` that relate to the current work — they contain resolved decisions and file paths that don't need to be re-derived.

**Step 2 — Use the codebase graph for navigation:**
The graph is the efficient path to structural facts. Use Tool Search to find the right query tool, then query it. The graph answers what exists, where it lives, and what connects to what — without reading implementation:
- "Does a utility for this already exist?" → `search_graph`
- "What will break if I change this function?" → `query_graph` (CALLS)
- "What env vars does this module consume?" → Read `.claude-init/enrichments.json`

Only read actual source code when you need to understand **how** something works, not just **what** it is or **where** it lives. The graph gives you file:line — that's enough to write accurate plan references without reading the full implementation.

**Step 3 — Dispatch the `researcher` agent for factual lookups:**
When a question requires a specific value from a live system (ARN, SSM parameter, DynamoDB table name) or finding a specific symbol across the repo, dispatch `researcher` rather than consuming main context on retrieval. Dispatch multiple researcher instances in parallel when questions are independent.

**Step 4 — Ask the user only what research couldn't answer:**
After research, surface remaining unknowns as a batched set of questions — not a trickle of one at a time. Questions should be specific: not "what should this do?" but "the existing `dispatch` function in `notification.py:45` handles X — should the new handler reuse it or replace it?"

### 1.2 — Efficiency Rules for Planning

The goal is to get structural facts cheaply and reserve context for reasoning. The codebase graph changes the calculus from the old file-read-first approach:

**Use the graph for:**
- Symbol location (file:line)
- Caller/callee relationships
- Env var definitions and consumers
- Entry points and triggers
- Whether something already exists

**Read source code only when:**
- You need to understand implementation logic (not just structure)
- The graph doesn't have the repo indexed yet (no `CODEBASE.md`)
- A specific section is needed that the graph doesn't cover (e.g., error handling patterns)

**When reading source:**
- Read only the relevant lines — use `offset` and `limit` on the Read tool. A function is typically 20–40 lines; don't dump the whole file to find it.
- Never glob without a `path` scope
- Plan-doc-first: if a plan doc references a file and line already, use that reference rather than re-finding it

**Researcher vs. main context:**
- Researcher: "where does X live?", "what is the ARN of Y?", "what does Z return?" — lookup, not reasoning
- Main context: anything that requires synthesizing what was found into a design decision

### 1.3 — Drafting the Plan

Drafting begins when research has resolved the critical unknowns. The threshold: **can I write every implementation step as a concrete action against a real file, function, or system — without placeholders?** If yes, draft. If a gap remains, surface it to the user first.

**Sizing** is based on token estimates, not file counts. A change that touches one file but rewires a major feature is not small.

| Size | Token Estimate | Meaning | Plan artifact |
|------|---------------|---------|---------------|
| S | ~1–5k | Small, targeted change. Minimal cross-cutting concern. | No local plan doc. Plan mode output only. |
| M | ~5–15k | Moderate change. Some cross-cutting. Touches multiple systems or subsystems. | No local plan doc. Plan mode output only. |
| L | ~15k+ | Large change. Many steps, significant refactor, new system, or major feature. | **Local plan doc required.** Write to `plans/<slug>/PLAN.md` before ExitPlanMode. |

The token estimates are rough — use them to calibrate scope, not to count precisely. When in doubt, size up.

### 1.4 — Required Sections of a Plan Doc

Every L-sized plan doc must be self-contained: a model with an empty context window should be able to read it and execute. This requires:

**Header block:**
```markdown
**Parent Plan:** [link to parent if this is a sub-plan]
**Status:** Planning | Designing | Executing | Complete
**Priority:** N
**Repo:** <git repo name and/or path>
**Jira Project:** <project key, e.g. CLAUDE>
```

**Problem Statement** — what is broken or missing, and why it matters. Factual, not aspirational.

**Context** — why this change is being made now. Links to tickets, prior sessions, or dependencies that motivated this work.

**Architecture Blueprint** — the factual, graph-derived record of what exists and what will change:
- File paths and line numbers for all affected symbols (from codebase graph queries, not guesses)
- Function/method signatures before and after (if signatures change)
- Env vars consumed, and where they're defined
- External resources touched (DynamoDB tables, SQS queues, SES templates, etc.) with their actual names from the infrastructure source
- Entry points and triggers involved

**Epic Goal** *(only when the plan will produce a Jira Epic)* — 1–2 sentence outcome statement framed by what is delivered, not what is implemented. This maps directly to the Epic ticket's `## Goal` field.
- ✅ "Enable device offline push notifications for all connected users"
- ❌ "Implement device_offline_consumer Lambda and wire EventBridge trigger"

**Task Reference table** (columns: #, Task, Size, Scope, Jira Key):
- Sizes use the token estimate scale above
- Jira keys left blank during planning; filled in at execution start
- Rows marked ✅ as tasks complete

**Task Notes** *(optional — add only when a task has a non-obvious implementation decision or acceptance criteria that differ from the plan-level Testing section)*:

> **Task N:** \<what "done" looks like for this specific task, and any decision that applies only here\>

If every task's acceptance criteria are obvious from the Task Reference table and Testing section, omit this block entirely.

**Testing** — appended by the `test-strategy` agent after architect approval. Named exactly `## Testing` so the jira-workflow-manager can locate and copy it into ticket descriptions:
- What existing tests cover this change
- What new tests are needed and where they live
- Manual verification steps if automated coverage isn't sufficient

**Dependencies** — other plans, tickets, or systems this plan depends on or that depend on it.

**Open Questions** — unresolved decisions, with date raised. Closed questions are struck through and answered inline.

**Completion block** (added when all tasks are ✅):
```markdown
**Completed:** YYYY-MM-DD
**Summary:** 1–2 sentences on what was built and any notable deviations from the original design.
```

**What must be factual:**
Every file path, function name, line number, env var name, ARN, and resource name in the plan must come from a real lookup — codebase graph, researcher output, or direct read. If a value is uncertain, it is an Open Question, not a placeholder.

### 1.5 — Example: Minimal Complete Plan Doc

```markdown
# Email Offline Notification — Plan

**Parent Plan:** [plans/notifications/PLAN.md](../PLAN.md)
**Status:** Designing
**Repo:** my-backend-api
**Jira Project:** CLAUDE

## Problem Statement
Users receive no notification when a connected device goes offline. The offline event is already published to EventBridge but nothing consumes it.

## Context
Discovered during prior ticket review. EventBridge rule fires on device offline, but the consumer is missing.

## Epic Goal
Enable device offline push notifications so users are alerted when a connected device drops.

## Architecture Blueprint
- Entry point: new Lambda handler `src/function/device_offline_consumer.py` (to be created)
- Trigger: EventBridge rule defined in `serverless.yml:88`
- Reuses: `NotificationService.dispatch` at `src/services/notification.py:8`
- Reuses: `get_cognito_user` at `src/utils/cognito.py:14`
- Env vars consumed: `COGNITO_SECRET_NAME` (defined `serverless.yml:109`), `PUSHER_PARAMETER_NAME` (defined `serverless.yml:114`)
- New serverless.yml function block needed (follows pattern at `serverless.yml:60–85`)

## Task Reference

| # | Task | Size | Scope | Jira Key |
|---|------|------|-------|----------|
| 1 | Create device_offline_consumer.py Lambda handler | S | src/function/device_offline_consumer.py | — |
| 2 | Wire EventBridge trigger in serverless.yml | S | serverless.yml | — |
| 3 | Add unit tests for offline consumer | S | tests/function/test_device_offline_consumer.py | — |

## Task Notes
> **Task 2:** Direct EventBridge invoke — no SQS queue. Follow the function block pattern at `serverless.yml:60–85`. Done when `serverless deploy` succeeds in dev with no errors and the rule appears in the AWS console.

## Testing
*(appended by test-strategy agent)*
- Existing: `test_notification_service.py` covers `NotificationService.dispatch` — no new tests needed there
- New: unit tests for `device_offline_consumer.py` — mock EventBridge event, assert `dispatch` is called with correct args
- Manual: deploy to dev, trigger a device offline event, confirm notification received

## Dependencies
- Notification backend ticket — provides `NotificationService` and `get_cognito_user`
- Testing system — test-strategy output feeds Testing section

## Open Questions
- ~~Should offline events use a separate SQS queue or invoke Lambda directly from EventBridge?~~
  **Resolved 2026-03-20:** Direct EventBridge invoke — no queue needed for this event volume.
```

### 1.6 — Architect Review Gate

Once a plan doc is complete (all sections filled, all Open Questions either resolved or explicitly deferred), invoke the `architect` agent.

**What happens:**
1. Main context invokes `architect` with the plan doc path and responsibility mode `plan`
2. Architect returns BLOCKING / MINOR / LOOKS GOOD / VERDICT
3. **If architect surfaces questions:** main context does **not** answer them with assumptions. Surface the questions to the user verbatim. Wait for user response. Then update the plan with the answers and re-invoke architect.
4. If BLOCKING issues are design flaws (not questions), main context resolves them from existing context and re-submits (max 3 rounds total across both question rounds and design rounds)
5. After APPROVED verdict, proceed to test strategy gate

**Maximum 3 review rounds.** If BLOCKING issues remain after the third pass, escalate to the user — do not attempt a fourth round.

### 1.7 — Test Strategy Gate

After architect approval, invoke `test-strategy` with the plan doc path and the repo testing plan (`.claude/testing-plan.md` if it exists from `/e2e-init`). The agent appends a `## Testing` section to the plan doc. This section is the source the `jira-workflow-manager` copies into ticket descriptions — the name must be exactly `## Testing`.

**When to skip:** S-sized changes where the `## Testing` section can be written inline with a single statement: "Existing tests in `<file>` cover this change — no new tests required." Write that statement directly in the plan doc rather than invoking the agent.

### 1.8 — Plan Ready for Execution

A plan is ready when:
- All sections are present and factual
- All Open Questions are resolved or explicitly deferred with a reason
- Architect verdict is APPROVED
- `## Testing` section is present

Follow Phase 1 Path B of `~/.claude/rules/workflow-phases.md` to create Jira tickets and fill in the Task Reference table with keys. Register the plan in TODO.md as a pointer entry (plan doc path + Epic key) — TODO.md tracks which plans are active, not their task detail.

---

## Part 2: Maintaining Plans

### 2.1 — Where Plans Live

| Plan type | Where it lives |
|-----------|---------------|
| S/M — session scratch | `~/.claude/plans/` only (auto-generated, not manually managed) |
| L — architectural work | `plans/<slug>/PLAN.md` in the repo |
| Sub-plan (significant, standalone) | `plans/<parent-slug>/<child-slug>/PLAN.md` |
| Sub-plan (small addition or correction to existing plan) | Appended section in the parent plan doc |

**Why repo-local:** Plans in `~/.claude/plans/` are session-scoped ephemera. Plans in the repo travel with the code, survive session boundaries, and can be read by any future session. They are also the source of truth for Jira ticket creation — they need to exist where the workflow that uses them runs.

### 2.2 — Sub-Plan Detection

Before drafting any new plan, check whether the work is a child of something already in progress:

1. Read `plans/` directory for related existing plans
2. Check `TODO.md` Active Plans section
3. If related: decide nesting vs. append:
   - **New sub-plan file** (`plans/<parent>/<child>/PLAN.md`): when the child is a significant standalone effort — multi-task, its own Epic, or the parent plan is already large enough that appending would bury it
   - **Append to parent**: when the work is a small addition, a correction to something that didn't work, or a scope tweak. In this case, add a clearly dated and titled section at the bottom of the parent plan.
4. If genuinely independent: create a new top-level plan

**Documenting changes:** If work changes because something didn't work as planned, document it in the plan: what was tried, what happened, and what changed. Do not silently overwrite the original design. Plans are a record, not just a specification.

### 2.3 — Keeping Plans in Sync During Execution

The plan doc is the single source of truth. Jira is seeded from it at ticket-creation time; updates flow into Jira as comments. TODO.md holds a pointer to the plan — it does not duplicate task rows.

**After each task completes:**
- Prepend ✅ to the row in the Task Reference table
- Update any Open Questions that were resolved during execution
- No manual synchronization to other systems is required — the ✅ in the plan doc is the authoritative record

**If scope changes:**
- Update the plan doc to reflect reality, not the original intent
- Note the change inline with a date: `> **Revised 2026-03-21:** Changed because X`
- Adjust downstream task rows if sequencing or scope shifts

**Session handoff:**
When a session ends mid-plan, verify the plan doc reflects:
- What is done (✅ rows)
- What is in progress (noted explicitly if different from the next unchecked row)
- What remains (unchanged rows)

The next session reads the plan doc first — not the codebase.

### 2.4 — Resuming in a New Session

1. Read the plan doc (plan-doc-first rule — do not scan the codebase first)
2. Read `CODEBASE.md` if the graph exists (orient to repo structure)
3. Check Task Reference table for ✅ markers
4. Resume from the first non-✅ row
5. Do not re-derive file paths or resource names already in the Architecture Blueprint

TODO.md is not a required resume step — it is a pointer to the plan doc, not an independent source of task state.

### 2.5 — Completing and Archiving Plans

A plan is complete when all Task Reference rows are ✅ and all Jira tickets are Done.

1. Add the Completion block at the top of the plan doc (see §1.4)
2. Update the TODO.md pointer entry: move it to History with a one-line summary. The plan doc remains the full record; TODO.md just clears the active pointer.
3. Leave the plan doc in `plans/` — completed plans are reference material, not garbage to delete

---

## Deliverables

| # | Deliverable | Location | Notes |
|---|-------------|----------|-------|
| 1 | Rewrite `plan-docs.md` | `~/.claude/rules/plan-docs.md` | Full rewrite incorporating Part 1 and Part 2 of this plan |
| 2 | Rewrite `filesystem/efficiency.md` | `~/.claude/rules/filesystem/efficiency.md` | Rescoped to codebase graph as primary navigation; source reads as fallback |
| 3 | Add cold-start / session handoff section to `workflow-phases.md` | `~/.claude/rules/workflow-phases.md` | §2.4 of this plan → rules |
| 4 | Update `todo-manager` skill workflow | `~/.claude/skills/todo-manager/` (see Plan 08) | Pointer-entry management: register, update, archive TODO.md entries pointing to plan docs. Implementation details owned by Plan 05/08. |

---

## Cross-Plan Dependencies

All dependencies below are co-deliverables — part of the same system being built in this repo. They do not exist yet; this plan is designed to ship alongside them. Interfaces have been verified to align.

| Dependency | Plan | Interface verified |
|------------|------|--------------------|
| `architect` agent | Plan 05 | Question-surfacing behavior in Plan 05 §1 matches the gate protocol in §1.6 of this plan |
| `test-strategy` agent | Plan 03 | Invoked after architect, before ExitPlanMode; reads plan doc + `.claude/testing-plan.md`; appends `## Testing` — matches §1.7 of this plan (Plan 03, Pillar 3) |
| `researcher` agent | Plan 05 | Inputs: `question` + optional `scope`; output: direct factual answer — matches dispatch pattern in §1.1 Step 3 (Plan 05 §2) |
| Codebase graph tools | Plan 01 | Tool names `search_graph`, `query_graph`, `get_architecture` from codebase-memory-mcp — match the names used in §1.1 and §1.2 of this plan |
