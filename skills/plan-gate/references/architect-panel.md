# Architect Panel — Dispatch Detail

Supporting reference for `skills/plan-gate/SKILL.md` § Step 1.

---

## Panel Shape

Shape A — Dimensional-review panel (per `dispatching-parallel-agents` §"Dispatching in prose").

One `subagent_type: architect` agent per criterion, all dispatched in parallel. The 6 criteria come from `agents/architect.md`:

| # | Criterion |
|---|-----------|
| 1 | Design soundness |
| 2 | Logic completeness |
| 3 | Contradictions |
| 4 | Foreseeable issues |
| 5 | Self-containment |
| 6 | Stack-hat adherence |

---

## Example Dispatch

Repeat the following for each of the 6 criteria (substituting the criterion number, name, and guiding question):

```
Agent {
  subagent_type: "architect",
  model: "claude-sonnet-4-6",
  prompt: "plan\n\nPlan doc: plans/<slug>/<slug>-plan.md",
  instructions: "Review criterion 1 only: design soundness — do the design decisions make sense given the stated goal? Is the approach coherent? Narrow your BLOCKING/MINOR/LOOKS-GOOD findings to this criterion."
}
```

---

## Five Dispatch Rules

1. **Model-pin** each agent to Sonnet — architect is a judgment role; do not use Haiku or Opus.
2. **Cap concurrency** at ≤ min(16, cores−2) — 6 agents is well within bounds.
3. **Per-agent watchdog:** if a dimension agent exceeds its timeout, abandon it and record its criterion as unreviewed; surface to user — do not silently drop.
4. **ONE batched adversarial verify** over the collected BLOCKING findings — not per-finding voting.
5. **Cite the front-door:** dispatching-parallel-agents §"Dispatching in prose" Shape A.

---

## Post-Collection: Batched Verify

After all 6 agents return: collect every BLOCKING finding into a single list and run **one batched adversarial verify** — one additional `subagent_type: architect` call asking it to confirm whether each BLOCKING item is a genuine blocking concern or a false positive. Merge the verify result into the finding set.

---

## Synthesis

Synthesize the full (verified) finding set into the **single** `APPROVED` / `NEEDS REVISION` verdict for this round.

- `APPROVED` → proceed to Step 2.
- `NEEDS REVISION` (rounds 1–2) → fix / surface issues, re-dispatch the full 6-agent panel.
- `NEEDS REVISION` after round 3 → surface to user and stop.

**MINOR / LOOKS-GOOD findings:** informational only — plan-gate proceeds regardless.
