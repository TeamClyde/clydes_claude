---
name: plan-gate
description: Triggers on writing-plans completion. Gates the plan through architect review, test-strategy, test-builder, Jira ticket creation, and TODO.md registration before execution begins. Can also be invoked manually against any plan doc at plans/<slug>/<slug>-plan.md.
allowed-tools: Agent, Read, Skill
---

# Plan Gate

## Overview

Bridge between planning and execution. Automatically invoked at the end of writing-plans. Runs the plan through a mandatory gate sequence before any implementation begins.

**Trigger:** Automatically invoked after writing-plans saves a plan doc. Can also be invoked manually.

**Input:** Path to a completed plan doc at `plans/<slug>/<slug>-plan.md`.

**Announce at start:** "I'm using the plan-gate skill to gate this plan before execution."

## Project Config Check

Before running the gate sequence, read `project.json` at the repo root if it exists:

```bash
cat "$(git rev-parse --show-toplevel)/project.json" 2>/dev/null
```

The `git rev-parse` anchor ensures the read works regardless of the orchestrator's current working directory. If the command returns nothing (file absent or not in a git repo), all flags default to enabled.

Apply these overrides:

| Field | Value | Effect |
|-------|-------|--------|
| `workflow.architect-review` | `false` | Skip Step 1 (Architect Review) entirely — proceed directly to Step 2 |
| `workflow.plan-gate` | `false` | Skip the entire gate sequence — hand off directly to executing-plans |
| `workflow.tdd` | `false` | Skip Step 3 (Test Builder) — proceed directly to Step 4 after checkpoint |
| `jira.enabled` | `false` | Skip Step 4 (Jira Ticket Creation) — proceed directly to Step 5 |
| absent / true | — | Run full gate sequence as defined |

---

## Gate Sequence

### Step 1 — Architect Review + Adherence Audit (parallel)

Dispatch **both** of the following in a single message (parallel tool calls):

**1a. Architect agent** — `subagent_type: architect`, `plan_doc_path` pointing to the plan doc.

**1b. Adherence-audit skill** — `Skill { skill: "adherence-audit" }` against the same plan doc.

Both must complete before proceeding to Step 2.

#### Architect findings

**On NEEDS REVISION:**
- BLOCKING items requiring user judgment → surface verbatim, wait, update plan doc, re-invoke architect
- BLOCKING items resolvable from context → fix inline, re-invoke architect
- Maximum 3 rounds. If BLOCKING items remain after round 3, surface to the user and stop.

**On APPROVED** → architect gate is clear.

#### Adherence-audit findings

The skill returns findings grouped by severity:

- **BLOCKING** — must be resolved before proceeding. Either fix inline (if resolvable from context) or surface to the user and wait. Re-run adherence-audit after fixes. **Do not re-run architect** unless the fixes also touched content the architect reviewed.
- **WARNING** — surface to the user for awareness. Do not block progression. Surface them in the Step 2 checkpoint message (after the Testing Plan review prompt) rather than as a separate interruption between Step 1 and Step 2 — bundling them with the existing checkpoint avoids creating a new user-interaction loop.
- **INFO** — note in the plan journal (via `plan-management:divergence` with tag `[decision]`). Do not block.

If no findings: adherence-audit gate is clear.

**Proceed to Step 2 only when both gates are clear.**

---

### Step 2 — Test Strategy

Dispatch the `test-strategy` agent with the plan doc path.

The agent appends a `## Testing Plan` section to the plan doc. No output is needed back to the main context — the agent writes directly to the plan doc.

---

### Checkpoint — Human Approval Required

After Step 2 completes, surface the Testing Plan to the user:

> "Test strategy is complete. Review the `## Testing Plan` section in `plans/<slug>/<slug>-plan.md` before I proceed with test builder, Jira ticket creation, and TODO.md registration. Reply 'proceed' to continue."
>
> **If adherence-audit returned WARNING items at Step 1**, append: "Adherence-audit also surfaced the following WARNING items for your awareness (not blocking): \[list each warning with its location and message]."

**Wait for explicit user approval before proceeding to Step 3.** Do not proceed automatically.

---

### Step 3 — Test Builder

**TDD-disabled check:** if `project.json` has `workflow.tdd: false`, skip this step entirely and proceed directly to Step 4. No warning, no error.

Otherwise: dispatch the `test-builder` agent with the plan doc path.

The agent reads the `## Testing Plan` section and writes failing tests to disk. Tests exist on disk before any implementation begins.

Proceed to Step 4 when the agent completes.

---

### Step 4 — Jira Ticket Creation

**Jira-disabled check:** if `project.json` has `jira.enabled: false` (or the file is absent), skip this step entirely and proceed directly to Step 5. No warning, no error. The Task Reference table's "Jira Key" column remains blank.

Otherwise: invoke the `jira-workflow-manager` agent to create the Epic and Tasks from the Task Reference table in the plan doc.

Pass the agent:
- The plan doc path
- The Task Reference table rows (task names, sizes, scope)

The agent assigns Jira keys and writes them back into the Task Reference table rows in the plan doc. The Epic key goes into the plan doc header.

---

### Step 5 — TODO.md Registration

Invoke the `plan-management` skill:
- `plan-doc`: `plans/<slug>/<slug>-plan.md`
- `status`: `created`
- `jira-key`: the Epic key assigned in Step 4 — **omit this argument entirely if Jira is disabled**

---

## Handoff

After all 5 steps complete successfully:

> "Plan gated and ready. Invoke executing-plans with `plans/<slug>/<slug>-plan.md` to begin."

---

## Error Handling

| Condition | Action |
|---|---|
| Architect returns NEEDS REVISION (rounds 1–2) | Fix/surface issues, re-invoke architect |
| Architect returns NEEDS REVISION after round 3 | Surface to user, stop |
| Adherence-audit returns BLOCKING | Fix inline or surface to user; re-run adherence-audit only |
| Adherence-audit returns WARNING | Surface for awareness; do not block |
| Adherence-audit returns INFO | Note in journal via `plan-management:divergence [decision]`; do not block |
| Any agent fails or is unavailable | Surface the failure, stop — do not skip a gate step |
| Plan doc missing required sections | Surface what is missing, stop |

Never skip a gate step (unless explicitly disabled via `project.json`). If an agent is unavailable, surface the blocker to the user.

---

## Integration

**Called by:**
- `writing-plans` — automatically at end of skill

**Calls:**
- `architect` agent (subagent_type: architect) — Step 1a, parallel with adherence-audit
- `adherence-audit` skill — Step 1b, parallel with architect
- `test-strategy` agent (subagent_type: test-strategy) — Step 2
- `test-builder` agent (subagent_type: test-builder) — Step 3 (skipped if tdd: false)
- `jira-workflow-manager` agent (subagent_type: jira-workflow-manager) — Step 4 (skipped if jira.enabled: false)
- `plan-management` skill — Step 5

**Followed by:**
- `executing-plans` skill

## Gotchas

1. This skill fires automatically after `writing-plans` — do not invoke it manually in Case A.
2. If architect returns NEEDS REVISION, update the plan doc and re-invoke architect — do not proceed to test-strategy until APPROVED.
3. Maximum 3 architect iterations — surface remaining BLOCKING issues to the user after the third pass.
4. Architect and adherence-audit run in parallel (Step 1) — dispatch both in a single message, wait for both to complete before acting on either.
5. When re-running a gate after fixes, re-run ONLY the gate that found issues unless the fixes also touched the surface the other gate audited.
6. `jira.enabled: false` and `workflow.tdd: false` are silent skips — no user-facing warning or confirmation prompt.
7. On the Jira-disabled path, omit `jira-key` from the `plan-management:created` call entirely — do not pass an empty string.
