# Architect Panel — Dispatch Detail

Supporting reference for `skills/plan-gate/SKILL.md` § Step 1.

---

## Panel Shape

Shape A — Dimensional-review panel (per `dispatching-parallel-agents` §"Dispatching in prose").

One `subagent_type: architect` agent per criterion, all dispatched in parallel. The 7 criteria come from `agents/architect.md`:

| # | Criterion |
|---|-----------|
| 1 | Design soundness |
| 2 | Logic completeness |
| 3 | Contradictions |
| 4 | Foreseeable issues |
| 5 | Self-containment |
| 6 | Stack-hat adherence |
| 7 | Systemic/strategic |

---

## Example Dispatch

Repeat the following for each of the 7 criteria (substituting the criterion number, name, and guiding question):

```
Agent {
  subagent_type: "architect",
  model: "claude-sonnet-4-6",
  prompt: "plan\n\nPlan doc: plans/<slug>/<slug>-plan.md",
  instructions: "Review criterion 1 only: design soundness — do the design decisions make sense given the stated goal? Is the approach coherent? Narrow your error/warning/Strengths findings to this criterion.",
  executor_profile: "executor = subagent-driven-development with file access + TDD"
}
```

---

## Five Dispatch Rules

1. **Model-pin** each agent to Sonnet — architect is a judgment role; do not use Haiku or Opus.
2. **Cap concurrency** at ≤ min(16, cores−2) — 7 agents is well within bounds.
3. **Per-agent watchdog:** if a dimension agent exceeds its timeout, abandon it and record its criterion as unreviewed; surface to user — do not silently drop.
4. **ONE tiered adversarial verify** over the collected `error` findings (per `dispatching-parallel-agents` → `skills/dispatching-parallel-agents/references/verify-protocol.md`, `plan-review` profile): a batched triage pass, then escalate ONLY the contested tail to a minority-veto 3-voter consensus — not per-finding voting on every finding.
5. **Cite the front-door:** dispatching-parallel-agents §"Dispatching in prose" Shape A.

---

## Post-Collection: Tiered Verify

Run ONE tiered adversarial verify over the collected `error` findings (`skills/dispatching-parallel-agents/references/verify-protocol.md`, `plan-review` profile): batched triage → clustered re-check → escalate only the contested tail to a minority-veto 3-voter consensus; merge surviving + contested; synthesize the round verdict (`NEEDS REVISION` iff ≥1 surviving `error`).

---

## Synthesis

Synthesize the full (verified) finding set into the **single** `APPROVED` / `NEEDS REVISION` verdict for this round.

- `APPROVED` → proceed to Step 2.
- `NEEDS REVISION` (rounds 1–2) → fix / surface issues, re-dispatch the full 7-agent panel.
- `NEEDS REVISION` after round 3 → surface to user and stop (3-round hard cap).
- **Value-exhausted** (a round yields no new genuine blocker — every surviving `error` is a prior-round duplicate or already addressed) → stop early, even before round 3; record "value-exhausted after round N". Do not run another round just to produce a finding-free sweep.

**`warning` / `Strengths` findings:** informational only — plan-gate proceeds regardless.
