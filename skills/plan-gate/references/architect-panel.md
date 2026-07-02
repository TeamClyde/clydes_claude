# Architect Panel — Dispatch Detail

Supporting reference for `skills/plan-gate/SKILL.md` § Step 1.

---

## Panel Shape

Shape A — Dimensional-review panel (per `dispatching-parallel-agents` §"Dispatching in prose").

One `subagent_type: architect` agent per lens, all dispatched in parallel. The 4 lenses come from `agents/architect.md` § Review Lenses:

| Lens | Finding class | Guiding question |
|------|---------------|------------------|
| L1 | Correctness & coherence | Does the design hold together and will it actually work? |
| L2 | Grounding & self-containment (owns both sweeps) | Is every claim grounded and is the plan executable from an empty context? |
| L3 | Systemic & standards | Does the approach hold up at scale and across consumers, and meet standards? |
| L4 | Simplicity / over-engineering | Could a smaller change achieve the same outcome? |

---

## Example Dispatch

Repeat the following for each of the 4 lenses (substituting the lens number, finding class, and guiding question):

```
Agent {
  subagent_type: "architect",
  model: "claude-sonnet-4-6",
  prompt: "plan\n\nPlan doc: plans/<slug>/<slug>-plan.md",
  instructions: "Review lens L1 only: correctness & coherence — does the design hold together and will it actually work? Report only this lens's finding class (error/warning/note/Strengths).",
  executor_profile: "executor = subagent-driven-development with file access + TDD"
}
```

---

## Five Dispatch Rules

1. **Model-pin** each agent to Sonnet — architect is a judgment role; do not use Haiku or Opus.
2. **Cap concurrency** at ≤ min(16, cores−2) — 4 agents is well within bounds.
3. **Per-agent watchdog:** if a lens agent exceeds its timeout, abandon it and record its lens as unreviewed; surface to user — do not silently drop.
4. **ONE convergence pass** over the collected findings (see § Post-Collection), then ONE tiered adversarial verify over the surviving `error` tail (per `dispatching-parallel-agents` → `skills/dispatching-parallel-agents/references/verify-protocol.md`, `plan-review` profile): a batched triage pass, then escalate ONLY the contested tail to a minority-veto 3-voter consensus — not per-finding voting on every finding.
5. **Cite the front-door:** dispatching-parallel-agents §"Dispatching in prose" Shape A.

**L2 runs the two sweeps once.** The Symbol-Verification & Callers Sweep and the Framework & External-Behavior Assumption Sweep belong to lens L2 and execute ONCE, under L2 — not once per lens.

---

## Post-Collection: Challenge + Dedup Convergence Pass

The four lens agents run in isolation and cannot debate peer-to-peer, so the synthesizer plays referee. After collecting the four lenses' findings, run ONE referee pass that:

(a) **Dedup** — collapses overlapping findings across lenses into a single candidate (two lenses flagging the same root issue become one finding).

(b) **One shared severity bar** — re-classify each candidate `error` against the strict blocker definition (would fail the plan, or cause an incorrect or irreversible outcome). Demote any non-blocker to `warning`. A lens raising an `error` does not make it a blocker — the shared bar decides.

(c) **Disclosed-risk rule** — a risk the plan itself discloses and accepts is NOT re-raised as `error`. Note it as informational; do not gate on it.

Optional: a single simulated-debate challenge round — feed the deduped blocker set back to the four lenses for one adversarial re-check.

Then run the existing tiered/minority-veto adversarial verification over the SURVIVING `error` tail (`skills/dispatching-parallel-agents/references/verify-protocol.md`, `plan-review` profile): batched triage → clustered re-check → escalate only the contested tail to a minority-veto 3-voter consensus; merge surviving + contested; synthesize the round verdict (`NEEDS REVISION` iff ≥1 surviving `error`).

---

## Synthesis

Synthesize the full (verified) finding set into the **single** `APPROVED` / `NEEDS REVISION` verdict for this round.

- `APPROVED` (a round yields ZERO surviving blockers) → proceed to Step 2.
- `NEEDS REVISION` (rounds 1–2) → fix / surface issues, re-dispatch the 4-lens panel while blockers remain.
- `NEEDS REVISION` after round 3 → surface to user as a CHECKPOINT and pause: report the remaining blockers and offer **continue** (run another round) / **intervene** (user resolves a blocker directly) / **accept** (proceed despite remaining findings). The user decides — the loop pauses rather than terminating on its own (3-round pause).

**`warning` / `Strengths` findings:** informational only — plan-gate proceeds regardless.
