---
name: plan-gate
description: Runs automatically after writing-plans. Gates the plan through architect review, test-strategy, test-builder, Jira ticket creation, and TODO.md registration before execution begins. Can also be invoked manually against any plan doc at plans/<slug>/PLAN.md.
---

# Plan Gate

## Overview

Bridge between planning and execution. Automatically invoked at the end of writing-plans. Runs the plan through a mandatory gate sequence before any implementation begins.

**Trigger:** Automatically invoked after writing-plans saves a plan doc. Can also be invoked manually.

**Input:** Path to a completed plan doc at `plans/<slug>/PLAN.md`.

**Announce at start:** "I'm using the plan-gate skill to gate this plan before execution."

## Gate Sequence

### Step 1 — Architect Review

Dispatch the `architect` agent with `plan_doc_path` pointing to the plan doc.

**On NEEDS REVISION:**
- BLOCKING items that require user judgment → surface them verbatim to the user, wait for response, update plan doc, re-invoke architect
- BLOCKING items resolvable from available context → fix inline, re-invoke architect
- Maximum 3 rounds. If BLOCKING items remain after round 3, surface them to the user and stop — do not proceed to Step 2.

**On APPROVED → proceed to Step 2.**

---

### Step 2 — Test Strategy

Dispatch the `test-strategy` agent with the plan doc path.

The agent appends a `## Testing Plan` section to the plan doc. No output is needed back to the main context — the agent writes directly to the plan doc.

Proceed to Step 3 when the agent completes.

---

### Step 3 — Test Builder

Dispatch the `test-builder` agent with the plan doc path.

The agent reads the `## Testing Plan` section and writes failing tests to disk. Tests exist on disk before any implementation begins.

Proceed to Step 4 when the agent completes.

---

### Step 4 — Jira Ticket Creation

Invoke the `jira-workflow-manager` agent to create the Epic and Tasks from the Task Reference table in the plan doc.

Pass the agent:
- The plan doc path
- The Task Reference table rows (task names, sizes, scope)

The agent assigns Jira keys and writes them back into the Task Reference table rows in the plan doc. The Epic key goes into the plan doc header.

---

### Step 5 — TODO.md Registration

Invoke the `plan-management` skill:
- `path`: `plans/<slug>/PLAN.md`
- `jira-key`: the Epic key assigned in Step 4
- `status`: `created`

---

## Handoff

After all 5 steps complete successfully:

> "Plan gated and ready. Invoke executing-plans with `plans/<slug>/PLAN.md` to begin."

---

## Error Handling

| Condition | Action |
|---|---|
| Architect returns NEEDS REVISION (rounds 1–2) | Fix/surface issues, re-invoke architect |
| Architect returns NEEDS REVISION after round 3 | Surface to user, stop |
| Any agent fails or is unavailable | Surface the failure, stop — do not skip a gate step |
| Plan doc missing required sections | Surface what is missing, stop |

Never skip a gate step. If an agent is unavailable, surface the blocker to the user.

---

## Integration

**Called by:**
- `writing-plans` — automatically at end of skill

**Calls:**
- `architect` agent (subagent_type: architect)
- `test-strategy` agent (subagent_type: test-strategy)
- `test-builder` agent (subagent_type: test-builder)
- `jira-workflow-manager` agent (subagent_type: jira-workflow-manager)
- `plan-management` skill

**Followed by:**
- `executing-plans` skill
