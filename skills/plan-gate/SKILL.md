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
| `workflow.architect-review` | `false` | Skip Step 1 entirely (both architect AND adherence-audit) — proceed directly to Step 2 |
| `workflow.plan-gate` | `false` | Skip the entire gate sequence — hand off directly to executing-plans |
| `workflow.tdd` | `false` | Skip Step 3 (Test Builder) — proceed directly to Step 4 after checkpoint |
| `jira.enabled` | `false` | Skip Step 4 (Jira Ticket Creation) — proceed directly to Step 5 |
| absent / true | — | Run full gate sequence as defined |

---

## Gate Sequence

### Step 1 — Architect Review + Adherence Audit (parallel)

**If `workflow.architect-review: false`:** skip this entire step (both reviewers) and proceed directly to Step 2.

Dispatch both reviewers simultaneously and wait for both to complete before proceeding:

- **Architect agent** — `subagent_type: architect`, pass the plan doc path (existing prompt).
- **Adherence-audit skill** — pass the plan doc path as the `plan-doc` parameter. This runs the standard 7-check audit AND the plan-introduced drift check (Phase 9).

Do not proceed to severity merge until both have returned results.

#### Severity Merge

Combine findings into a single unified list using this ordering and gate semantics:

| Position | Source | Severity | Gate type |
|----------|--------|----------|-----------|
| 1st | Architect | BLOCKING | **Hard-gate** — plan must revise before proceeding |
| 2nd | Adherence-audit | BLOCKING | **Soft-gate** — surface verbatim; user decides: (a) acknowledge and proceed, or (b) address findings first |
| 3rd | Architect | MINOR / WARNING | Informational |
| 4th | Adherence-audit | WARNING | Informational |
| 5th | Either | INFO | Informational |

**Hard-gate behavior (architect BLOCKING):** same as before — fix or surface, re-invoke architect, max 3 rounds.

**Soft-gate behavior (adherence-audit BLOCKING):**

Surface the findings verbatim to the user:

> "The adherence audit found the following concerns about this plan (soft-gate — your call to proceed or address):
> [findings]
> Reply 'proceed' to continue past these findings, or address them and I'll re-run the audit."

Wait for explicit user response. If the user replies 'proceed', continue to Step 2. If the user addresses findings, re-run adherence-audit (see Iteration below) before presenting again.

**Adherence WARNING / INFO:** present in the unified output but require no user action — plan-gate continues.

**Edge cases:**
- Adherence-audit finds no plan-introduced drift (plan doesn't touch skills/agents/rules, or proposed changes are conventional): findings are empty or INFO-only → plan-gate proceeds without a soft-gate prompt.
- Both reviewers must complete before severity merge runs — do not proceed on partial results.

#### Iteration

- **Architect:** re-dispatch on each architect-BLOCKING revision (existing behavior). 3-round cap. After round 3 with BLOCKING remaining, surface to user and stop.
- **Adherence-audit:** re-run only when a revision changes components relevant to its prior findings (e.g., a proposed skill name, invocation pattern, or file path the audit flagged). If the revision only addresses architect findings that don't overlap with audit findings, do not re-run the audit.

**On APPROVED (architect) + soft-gate resolved (user acknowledged or addressed)** → proceed to Step 2.

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
  args: "status: divergence plan-doc: plans/<slug>/<slug>-plan.md summary: 'Plan-gate complete: architect APPROVED (round N), adherence-audit APPROVED (round N), test-strategy appended, test-builder ran' tag: [gate-complete] plan-section: Phase -1 Gate"
}
```

Fill in the actual round numbers from Step 1. If architect review was skipped (`workflow.architect-review: false`), write `architect skipped` in place of `architect APPROVED (round N)`. If TDD was skipped (`workflow.tdd: false`), write `test-builder skipped`.

**Placement rationale:** This call fires after Step 5 (TODO.md registration) so it represents the true end of plan-gate's work. The gate checkboxes and journal entry are only written once everything else has succeeded.

**Failure mode — mid-gate failure:** If plan-gate fails before reaching Step 6 (e.g., adherence-audit returns BLOCKING and the user does not issue 'proceed', or architect BLOCKING persists after 3 rounds), the `:divergence` call is not invoked. The plan doc gate-checkbox section and journal remain in their pre-gate state. Resuming or re-running plan-gate from the beginning is fully idempotent — when it eventually succeeds it fires `:divergence` once with the final stage outcomes.

**Idempotency — re-running plan-gate after success:** The `:divergence` mode performs three independent idempotency checks before writing: (1) journal — skips append if a dated entry with matching summary already exists; (2) plan section — skips edit if the section already reflects the new state; (3) handoff — skips refresh if `Last Updated` is already today and the divergence is already reflected. Re-running plan-gate on an already-gated plan is therefore safe: all three writes are no-ops.

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
| Adherence-audit returns BLOCKING (soft-gate) | Surface to user verbatim; wait for 'proceed' or revision |
| Adherence-audit or architect fails / unavailable | Surface the failure, stop — do not skip a gate step |
| Plan doc missing required sections | Surface what is missing, stop |
| One reviewer returns before the other | Wait — do not run severity merge on partial results |

Never skip a gate step (unless explicitly disabled via `project.json`). If an agent is unavailable, surface the blocker to the user.

---

## Integration

**Called by:**
- `writing-plans` — automatically at end of skill

**Calls:**
- `architect` agent (subagent_type: architect) — Step 1, parallel with adherence-audit (skipped if architect-review: false)
- `adherence-audit` skill — Step 1, parallel with architect, plan-doc path passed as `plan-doc` parameter (skipped if architect-review: false)
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
6. Adherence-audit BLOCKING is a soft-gate — it requires a user decision, not an automatic block. Do not treat it the same as architect BLOCKING.
7. `workflow.architect-review: false` skips BOTH reviewers — adherence-audit is not run independently when architect review is disabled.
8. Do not re-run adherence-audit on every architect revision — only re-run when the revision touches components that overlap with the audit's prior findings.
9. Both reviewers must return before severity merge runs — do not proceed on partial results if one completes significantly before the other.
10. Step 6 (`:divergence` call) fires exactly once at the end of the successful path — never per-stage. Mid-gate failures leave the plan doc in its pre-gate state; re-running plan-gate is idempotent.
11. The `plan-section` value for the Step 6 `:divergence` call is always `Phase -1 Gate` — this is the gate-checkbox block at the top of the plan doc.
