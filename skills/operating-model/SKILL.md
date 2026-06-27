---
name: operating-model
description: Use when deciding whether to fan out work at all, which executor surface to use (inline / single subagent / parallel batch / Agent Teams / Dynamic Workflow), or how to size a fan-out — the whether/when/which-executor decision layer. For how to run one fan-out once the decision is made, use dispatching-parallel-agents.
allowed-tools: Read, Agent, Skill
---

# Operating Model

## Overview

**Single-threaded usually wins.** Fan-out is exceptional and must earn its cost.

Align with current Anthropic guidance: "start simple, add complexity only when it improves outcomes." Multi-agent work adds coordination overhead, token cost, and failure surface. Reach for it only when the simpler path is genuinely insufficient.

**Routing cue — two skills, different layers:**

| Skill | Question it answers |
|---|---|
| `operating-model` (this skill) | *Whether* to fan out, *when* the cost is justified, *which* executor surface to use |
| `dispatching-parallel-agents` | *How* to run one fan-out — shapes, DispatchPolicy, quorum, retries, token-budget gating |

Decide here first. Dispatch there once the choice is made.

---

## Decision Ladder

```
Can inline reasoning handle this?
  YES → do it inline.
  NO  → Does the task need context isolation or independent delegation?
    YES → dispatch a SINGLE subagent.
    NO  → Is the next step still a single coherent unit?
      YES → stay single-threaded.
      NO  → Are N tasks genuinely independent (no shared state, no shared files)?
        NO  → sequential chain (Shape C in dispatching-parallel-agents)
        YES → parallel fan-out (Shape B / Shape A)
                ↓
          Volume > Agent-tool batch capacity, or need background execution?
            YES → Dynamic Workflow (Workflow tool)
            NO  → Agent-tool parallel batch is sufficient
```

Agent Teams (experimental, peer-to-peer) sit off this ladder. Consider only for genuine peer-to-peer collaboration — not for ordinary orchestrator-worker fan-out.

---

## Executor Map Summary

Five surfaces in escalating cost and complexity. Full platform figures (limits, nesting depth, token multipliers) in [`references/executor-map.md`](references/executor-map.md).

> _(Platform figures as of 2026-06 — verify against current docs.)_

| Surface | Topology | When to use |
|---|---|---|
| Inline reasoning | No executor | Task fits in one pass; no isolation needed |
| Single subagent | Orchestrator → 1 worker | Context isolation; report-back output |
| Parallel batch | Orchestrator → N workers | N independent tasks; throughput / fault tolerance |
| Agent Teams | Peer-to-peer (experimental) | Genuine collaborative peer work; ≤ 25 teammates |
| Dynamic Workflow | Code skeleton + `agent()` fan-out | Large volume; background; code-expressible orchestration |

**Determinate vs. indeterminate:** keep skeleton logic (branching, loops, unit generation) in deterministic code; push only genuine language-model judgment into `agent()` calls. Maximizes reproducibility and minimizes cost.

---

## Circuit-Reasoning Frame

When evaluating a topology, reason about it like a circuit — but know where the metaphor stops.

**Series (sequential) topology:**
- Cost and latency **add** across steps.
- Bottlenecked by the slowest step.
- Single-point-of-failure: one ABANDONED step halts the chain.

**Parallel topology:**
- Throughput (conductance) **adds** — more branches, more simultaneous work.
- **Latency = the MAX, not the sum** — switch the lens by metric: *throughput* sums across branches (like parallel conductance), but *latency* is the slowest single branch, not the sum. Same topology, different measure. Parallelism removes latency from the cost column but does NOT make it zero; it makes it the longest-branch latency.
- The real reason to parallelize is **fault tolerance**: branch independence means a quorum can proceed on survivors even when some branches fail.

**Where the metaphor stops:** it ends at R. There is no useful inductor or capacitor analog for discrete agent work — no frequency domain, no impedance, no resonance applies. Do not force an L/C analogy. Series/parallel resistance is the entire useful import.

---

## Fan-Out Sizing

**No fixed spawn cap.** The old "≤20 units" ceiling has been dropped.

| Control | Rule |
|---|---|
| Concurrency ceiling | `min(16, cores−2)` per batch; platform max 25 for Workflow / Agent Teams. Use `maxInFlight` only as an optional override for a genuine reason (local model, constrained machine). |
| Total volume | Token-budget-gated, not spawn-count-capped. Pass `getRemainingBudget: () => budget.remaining()` inside a Workflow. |
| Model pinning | Haiku for scanning/trivial; Sonnet for judgment. **Never inherit Opus for leaf agents** — token cost is 10–50× higher. |
| Batched verify | ONE verifier agent per ~10 findings. Never a per-finding verification loop. |
| Watchdog + quorum | Make "run to the ceiling" safe — watchdog ABANDONS timed-out units; quorum lets survivors proceed. |

These controls replace a fixed cap. Apply them consistently and the runtime ceiling naturally bounds blast radius.

For `DispatchPolicy` schema, per-shape return contracts, and non-preemption details: see `dispatching-parallel-agents` → `references/dispatch-policy.md`.

---

## Anti-Patterns

**Over-decomposition:** Splitting a coherent task into N agents when one agent — or inline reasoning — would handle it cleanly. Coordination overhead exceeds the gain.

**Premature parallelization:** Reaching for fan-out before confirming tasks are genuinely independent. Shared-file writes from parallel agents cause merge conflicts.

**Coordination overhead exceeding gains:** If synthesizing N agent outputs costs more (time, tokens) than the N agents saved, the topology lost money.

**Same-file parallel writes:** Two agents writing the same file concurrently will conflict. Serialize same-file work or partition the file first.

**Unattended runs without quorum:** Launching large fan-outs without watchdog + quorum bounds means one hung agent can block the whole batch indefinitely.

**Opus for leaf agents:** Leaf agents doing scanning or single-lens review do not need Opus reasoning. Pin to Haiku or Sonnet; never let the orchestrator's model silently propagate.

**Per-finding verification loops:** Running a verifier per finding re-introduces the exact token blowout that batched verify was designed to prevent. One verifier over all findings is the design.

---

## Integration

This skill sits above the dispatch front-door:

```
operating-model (this skill)
    ↓ decision: whether / when / which executor
dispatching-parallel-agents (front-door)
    ↓ mechanics: shapes, policy, quorum, retries
scripts/lib/dispatch.mjs (engine)
```

For full executor platform figures: [`references/executor-map.md`](references/executor-map.md).  
For dispatch mechanics, shapes, and DispatchPolicy: `dispatching-parallel-agents`.  
For design rationale: `docs/explanation/orchestration-regulation-layer.md`.

---

## Gotchas

1. **Defaulting to fan-out.** The most common mistake is reaching for parallelism first. Inline/single-threaded is the default; fan-out is the exception that must earn its cost. If you cannot name the specific gain (independent work, fault tolerance, scale beyond one context), do not fan out.
2. **Estimating parallel wall-clock with the throughput formula.** Throughput adds across branches; *latency does not*. Parallel wall-clock is the slowest branch (the MAX), not a sum or an average. Sizing a fan-out on a throughput intuition over-promises speed.
3. **Pushing the circuit metaphor past R.** Series/parallel resistance is the whole useful import. There is no inductor/capacitor analog for discrete agent work — do not invent a frequency-domain story.
4. **Invoking the wrong layer.** This skill decides *whether / when / which executor*. It does not run a fan-out — that is `dispatching-parallel-agents`. If you already know you are fanning out and just need the mechanics, you are one layer too high here.
5. **Treating the platform figures as evergreen.** The executor-map limits (concurrency caps, token multipliers, nesting depth) are date-stamped and drift with the product. Re-verify against current docs before relying on a specific number.
