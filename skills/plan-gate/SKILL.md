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

## Gate Chain — Watchdog Wrapper

The gate chain (Steps 1 → 2 → Checkpoint → 3 → 4 → 5 → 6) runs as a **Shape C — Sequential chain** (per `dispatching-parallel-agents` §"Dispatching in prose" Shape C — Sequential chain). The chain halts on the first ABANDONED step.

**Per-step watchdog rule:** Every Agent/Skill dispatch in the gate chain carries a bounded per-step expectation. If a step does not complete within that bound it is declared **ABANDONED**: halt the chain immediately and surface the partial gate state to the user (which steps completed, which step timed out). Do not skip ahead. Do not silently drop the hang.

**What each step's watchdog surfaces:**
- Which gate steps completed (✅) before the hang.
- Which step timed out (ABANDONED) and its label.
- The partial plan doc state so the user can decide whether to retry or intervene.

**Preserved by this wrapper:**
- Step order is unchanged.
- The human checkpoint (after Step 2) is unchanged — it is a deliberate pause, not a watchdog event.
- Re-entrancy/idempotency is unchanged — resuming after a hang re-runs only the ABANDONED step onward; already-completed steps are skipped per their existing idempotency checks.

---

## Gate Sequence

### Step 1 — Architect Review

**If `workflow.architect-review: false`:** skip this step and proceed directly to Step 2.

**Watchdog:** if the architect panel (or its tiered-verify call) does not complete within the stated bound, declare it ABANDONED — halt the chain and surface partial gate state to the user. Do not silently retry or skip to Step 2.

Step 1 dispatches a **7-criterion architect panel** (Shape A — Dimensional-review panel, per `dispatching-parallel-agents` §"Dispatching in prose") — one `subagent_type: architect` agent per criterion, all in parallel (each passed the plan doc path, a single-criterion `instructions` field, and the `executor_profile`). See `references/architect-panel.md` for the full dispatch detail: example Agent block, per-criterion enumeration, the 5 dispatch rules, and the tiered-verify step.

**Tiered verify — required hard gate:** after collecting all panel findings, run ONE tiered adversarial verify (`skills/dispatching-parallel-agents/references/verify-protocol.md`, `plan-review` profile) over the collected `error` findings before producing the round verdict. This step is **not optional** — a round verdict produced without running the tiered verify is **invalid** and must not be used to advance the gate. If the tiered-verify call is skipped or fails, declare this step ABANDONED and surface to the user; do not proceed to Step 2.

**Synthesis:** after the tiered verify completes, produce the SINGLE `APPROVED` / `NEEDS REVISION` verdict for this round.

**Hard-gate:** on `error` findings, fix or surface, then re-dispatch the full panel. Two stop conditions (whichever comes first):
- **3-round cap** — after round 3 with `error` findings remaining, surface to user and stop.
- **Value exhaustion** — if a completed round yields no new **genuine blocker** (i.e., every `error` in that round is either a duplicate of a prior-round finding or was already addressed in the plan update), stop iterating even if fewer than 3 rounds have run. Document this as "value-exhausted after round N" in the gate record. Do not run another round purely to produce a finding-free sweep.

`warning` / `Strengths` findings are informational only; plan-gate proceeds.

**On APPROVED** → proceed to Step 2.

---

### Step 2 — Test Strategy

**Watchdog:** if `test-strategy` does not complete within the stated bound, declare it ABANDONED — halt the chain and surface partial gate state to the user.

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

**Watchdog:** if `test-builder` does not complete within the stated bound, declare it ABANDONED — halt the chain and surface partial gate state to the user.

Otherwise: dispatch the `test-builder` agent with the plan doc path.

The agent reads the `## Testing Plan` section and writes failing tests to disk. Tests exist on disk before any implementation begins.

Proceed to Step 4 when the agent completes.

---

### Step 4 — Jira Ticket Creation

**Jira-disabled check:** if `project.json` has `jira.enabled: false` (or the file is absent), skip this step entirely and proceed directly to Step 5. No warning, no error. The Task Reference table's "Jira Key" column remains blank.

**Watchdog:** if `jira-workflow-manager` does not complete within the stated bound, declare it ABANDONED — halt the chain and surface partial gate state to the user.

Otherwise: invoke the `jira-workflow-manager` agent to create the Epic and Tasks from the Task Reference table in the plan doc.

Pass the agent:
- The plan doc path
- The Task Reference table rows (task names, sizes, scope)

The agent assigns Jira keys and writes them back into the Task Reference table rows in the plan doc. The Epic key goes into the plan doc header.

---

### Step 5 — TODO.md Registration

**Watchdog:** if `plan-management` (TODO.md registration) does not complete within the stated bound, declare it ABANDONED — halt the chain and surface partial gate state to the user.

Invoke the `plan-management` skill:
- `plan-doc`: `plans/<slug>/<slug>-plan.md`
- `status`: `created`
- `jira-key`: the Epic key assigned in Step 4 — **omit this argument entirely if Jira is disabled**

---

### Step 6 — Gate-Complete Divergence Record

**Watchdog:** if `plan-management:divergence` does not complete within the stated bound, declare it ABANDONED — surface to the user that all prior gate steps completed but the final record was not written. The plan doc remains in its pre-gate state; re-running plan-gate is idempotent.

After Step 5 completes, invoke `plan-management:divergence` to atomically tick the plan doc's gate-checkbox section, append a `[gate-complete]` journal entry, and refresh the handoff:

```
Skill {
  skill: "plan-management",
  args: "status: divergence plan-doc: plans/<slug>/<slug>-plan.md summary: 'Plan-gate complete: architect APPROVED (round N), test-strategy appended, test-builder ran' tag: [gate-complete] plan-section: Phase -1 Gate"
}
```

Fill in the actual round number from Step 1. If architect review was skipped (`workflow.architect-review: false`), write `architect skipped` in place of `architect APPROVED (round N)`. If TDD was skipped (`workflow.tdd: false`), write `test-builder skipped`.

**Placement rationale:** This call fires after Step 5 (TODO.md registration) so it represents the true end of plan-gate's work. The gate checkboxes and journal entry are only written once everything else has succeeded.

**Failure mode — mid-gate failure:** If plan-gate fails before reaching Step 6 (e.g., architect `error` findings persist after 3 rounds), the `:divergence` call is not invoked. The plan doc gate-checkbox section and journal remain in their pre-gate state. Resuming or re-running plan-gate from the beginning is fully idempotent — when it eventually succeeds it fires `:divergence` once with the final stage outcomes.

**Idempotency — re-running plan-gate after success:** The `:divergence` mode performs three independent idempotency checks before writing: (1) journal — skips append if a dated entry with matching summary already exists; (2) plan section — skips edit if the section already reflects the new state; (3) handoff — skips refresh if `Last Updated` is already today and the divergence is already reflected. Re-running plan-gate on an already-gated plan is therefore safe: all three writes are no-ops.

---

## Sub-Plan Mode

When plan-gate is invoked on a **Form-A sub-plan**, a reduced gate runs: the parent plan already owns ticketing, registration, and the Testing Plan, so the sub-plan gate exists only to keep the sub-plan's design sound and drift-free.

**Detection:** the target plan doc lives at `plans/<parent>/<child>/<child>-plan.md`. Apply the `plan-management` walk-up algorithm — walk up one directory from the plan's folder; if that parent directory contains a `*-plan.md`, this is a sub-plan. (Otherwise it is a top-level plan and the standard Gate Sequence above applies.)

**Sequence in sub-plan mode:**

| Step | Standard mode | Sub-plan mode |
|------|---------------|---------------|
| 1 — Architect | run | **run** — hard-gate on `error` findings, 3-round cap (identical to standard) |
| Adherence soft-gate | — | **run** — after architect APPROVED, dispatch `Skill { skill: "adherence-audit", args: "plan-doc: plans/<parent>/<child>/<child>-plan.md" }`. Its Phase 9 surfaces drift the sub-plan would introduce. `[Plan-Introduced]` `error` findings are surfaced and resolved before execution; `warning`/`note` are informational. **Soft-gate — never deadlocks the gate.** |
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
- `architect` agent (subagent_type: architect) — Step 1: 7-criterion parallel dimension panel + 1 tiered verify (skipped if architect-review: false)
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
3. Maximum 3 architect iterations — surface remaining `error`-severity issues to the user after the third pass.
4. `jira.enabled: false` and `workflow.tdd: false` are silent skips — no user-facing warning or confirmation prompt.
5. On the Jira-disabled path, omit `jira-key` from the `plan-management:created` call entirely — do not pass an empty string.
6. Step 6 (`:divergence` call) fires exactly once at the end of the successful path — never per-stage. Mid-gate failures leave the plan doc in its pre-gate state; re-running plan-gate is idempotent.
7. The `plan-section` value for the Step 6 `:divergence` call is always `Phase -1 Gate` — this is the gate-checkbox block at the top of the plan doc.
