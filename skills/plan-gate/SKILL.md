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
| `workflow.architect-review` | `false` | Skip Step 1 entirely — proceed directly to Step 2 |
| `workflow.plan-gate` | `false` | Skip the entire gate sequence — hand off directly to executing-plans |
| `workflow.tdd` | `false` | Skip Step 3 (Test Builder) — proceed directly to Step 4 after checkpoint |
| `jira.enabled` | `false` | Skip Step 4 (Jira Ticket Creation) — proceed directly to Step 5 |
| absent / true | — | Run full gate sequence as defined |

---

## Gate Sequence

### Step 1 — Architect Review

**If `workflow.architect-review: false`:** skip this step and proceed directly to Step 2.

Step 1 dispatches a **6-criterion architect panel** (Shape A — Dimensional-review panel, per `dispatching-parallel-agents` §"Dispatching in prose") — one `subagent_type: architect` agent per criterion, all in parallel. See `references/architect-panel.md` for the full dispatch detail: example Agent block, per-criterion enumeration, the 5 dispatch rules, and the batched-verify step.

**Synthesis:** after the batched verify, produce the SINGLE `APPROVED` / `NEEDS REVISION` verdict for this round.

**Hard-gate:** on BLOCKING findings, fix or surface, then re-dispatch the full panel. 3-round cap — after round 3 with BLOCKING remaining, surface to user and stop. MINOR / LOOKS-GOOD findings are informational only; plan-gate proceeds.

**On APPROVED** → proceed to Step 2.

---

### Step 2 — Test Strategy

Dispatch the `test-strategy` agent with the plan doc path.

The agent appends a `## Testing Plan` section to the plan doc. No output is needed back to the main context — the agent writes directly to the plan doc.

---

### Checkpoint — Human Approval Required

After Step 2 completes, surface the Testing Plan to the user:

> "Test strategy is complete. Review the `## Testing Plan` section in `plans/<slug>/<slug>-plan.md` before I proceed with test builder, Jira ticket creation, and TODO.md registration. Reply 'proceed' to continue."

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

### Step 6 — Gate-Complete Divergence Record

After Step 5 completes, invoke `plan-management:divergence` to atomically tick the plan doc's gate-checkbox section, append a `[gate-complete]` journal entry, and refresh the handoff:

```
Skill {
  skill: "plan-management",
  args: "status: divergence plan-doc: plans/<slug>/<slug>-plan.md summary: 'Plan-gate complete: architect APPROVED (round N), test-strategy appended, test-builder ran' tag: [gate-complete] plan-section: Phase -1 Gate"
}
```

Fill in the actual round number from Step 1. If architect review was skipped (`workflow.architect-review: false`), write `architect skipped` in place of `architect APPROVED (round N)`. If TDD was skipped (`workflow.tdd: false`), write `test-builder skipped`.

**Placement rationale:** This call fires after Step 5 (TODO.md registration) so it represents the true end of plan-gate's work. The gate checkboxes and journal entry are only written once everything else has succeeded.

**Failure mode — mid-gate failure:** If plan-gate fails before reaching Step 6 (e.g., architect BLOCKING persists after 3 rounds), the `:divergence` call is not invoked. The plan doc gate-checkbox section and journal remain in their pre-gate state. Resuming or re-running plan-gate from the beginning is fully idempotent — when it eventually succeeds it fires `:divergence` once with the final stage outcomes.

**Idempotency — re-running plan-gate after success:** The `:divergence` mode performs three independent idempotency checks before writing: (1) journal — skips append if a dated entry with matching summary already exists; (2) plan section — skips edit if the section already reflects the new state; (3) handoff — skips refresh if `Last Updated` is already today and the divergence is already reflected. Re-running plan-gate on an already-gated plan is therefore safe: all three writes are no-ops.

---

## Sub-Plan Mode

When plan-gate is invoked on a **Form-A sub-plan**, a reduced gate runs: the parent plan already owns ticketing, registration, and the Testing Plan, so the sub-plan gate exists only to keep the sub-plan's design sound and drift-free.

**Detection:** the target plan doc lives at `plans/<parent>/<child>/<child>-plan.md`. Apply the `plan-management` walk-up algorithm — walk up one directory from the plan's folder; if that parent directory contains a `*-plan.md`, this is a sub-plan. (Otherwise it is a top-level plan and the standard Gate Sequence above applies.)

**Sequence in sub-plan mode:**

| Step | Standard mode | Sub-plan mode |
|------|---------------|---------------|
| 1 — Architect | run | **run** — hard-gate on BLOCKING, 3-round cap (identical to standard) |
| Adherence soft-gate | — | **run** — after architect APPROVED, dispatch `Skill { skill: "adherence-audit", args: "plan-doc: plans/<parent>/<child>/<child>-plan.md" }`. Its Phase 9 surfaces drift the sub-plan would introduce. `[Plan-Introduced]` BLOCKING is surfaced and resolved before execution; WARNING/INFO are informational. **Soft-gate — never deadlocks the gate.** |
| 2 — Test strategy | run | **skip** — the parent plan owns the `## Testing Plan` |
| 3 — Test builder | run | **skip** |
| 4 — Jira | run | **skip** — the parent Epic owns tickets |
| 5 — TODO.md registration | run | **skip** — the parent is already registered |
| 6 — Gate-complete record | run | **fold into the sub-plan close** (`plan-management:close-subplan`) rather than a separate `[gate-complete]` entry, to avoid top-level-journal noise |

**`mode: minimal`** (for trivial sub-plan refinements): run **architect only** — skip the adherence-audit soft-gate as well.

**Boundary:** the adherence-audit dispatch here is a plain sequential soft-gate (one `Skill` call, scoped to the plan doc). Re-architecting adherence-audit into a parallel dimension-reviewer fan-out is a separate, later concern — it does not live in this section.

---

## Handoff

After all steps complete successfully:

> "Plan gated and ready. Invoke executing-plans with `plans/<slug>/<slug>-plan.md` to begin."

---

## Error Handling

| Condition | Action |
|---|---|
| Architect returns NEEDS REVISION (rounds 1–2) | Fix/surface issues, re-invoke architect |
| Architect returns NEEDS REVISION after round 3 | Surface to user, stop |
| Architect fails / unavailable | Surface the failure, stop — do not skip a gate step |
| Plan doc missing required sections | Surface what is missing, stop |

Never skip a gate step (unless explicitly disabled via `project.json`). If an agent is unavailable, surface the blocker to the user.

---

## Integration

**Called by:**
- `writing-plans` — automatically at end of skill

**Calls:**
- `architect` agent (subagent_type: architect) — Step 1: 6-criterion parallel dimension panel + 1 batched verify (skipped if architect-review: false)
- `adherence-audit` skill — Sub-Plan Mode soft-gate, sub-plan invocations only (see § Sub-Plan Mode); not in the standard top-level sequence
- `test-strategy` agent (subagent_type: test-strategy) — Step 2
- `test-builder` agent (subagent_type: test-builder) — Step 3 (skipped if tdd: false)
- `jira-workflow-manager` agent (subagent_type: jira-workflow-manager) — Step 4 (skipped if jira.enabled: false)
- `plan-management` skill — Step 5 (TODO.md registration)
- `plan-management:divergence` skill — Step 6 (gate-complete record; fires once at end of successful path)

**Followed by:**
- `executing-plans` skill

## Gotchas

1. This skill fires automatically after `writing-plans` — do not invoke it manually in Case A.
2. If architect returns NEEDS REVISION, update the plan doc and re-invoke architect — do not proceed to test-strategy until APPROVED.
3. Maximum 3 architect iterations — surface remaining BLOCKING issues to the user after the third pass.
4. `jira.enabled: false` and `workflow.tdd: false` are silent skips — no user-facing warning or confirmation prompt.
5. On the Jira-disabled path, omit `jira-key` from the `plan-management:created` call entirely — do not pass an empty string.
6. Step 6 (`:divergence` call) fires exactly once at the end of the successful path — never per-stage. Mid-gate failures leave the plan doc in its pre-gate state; re-running plan-gate is idempotent.
7. The `plan-section` value for the Step 6 `:divergence` call is always `Phase -1 Gate` — this is the gate-checkbox block at the top of the plan doc.
