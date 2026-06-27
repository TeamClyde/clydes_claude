# Executor Map — Full Reference

Supporting reference for `skills/operating-model/SKILL.md`.

> _(Platform figures as of 2026-06 — verify against current docs before relying on limits.)_

---

## The Five Execution Surfaces

### 1. Inline reasoning (no executor)

The main context reasons through the task without spawning any agent. Cheapest — no dispatch overhead, no context serialization, no inter-agent latency. Always try this first.

**Use when:** the task fits in one reasoning pass and is not independently parallelizable.

---

### 2. Single subagent (Agent tool — context isolation)

One delegated unit with isolated context. Preserves the orchestrator's context window for coordination; gives the subagent an uncluttered view of only what it needs.

**Use when:** a task needs context isolation, or its output will be judged/synthesized by the orchestrator.

**Platform facts:**
- Nesting: up to 5 levels deep (sub-sub-sub-sub-agent).
- Context is NOT inherited — orchestrator constructs exactly what the subagent needs.
- Report-back only: no peer-to-peer mailbox.

---

### 3. Parallel subagent batch (fan-out via `dispatching-parallel-agents`)

N independent subagents dispatched concurrently. This is the fan-out pattern. For dispatch mechanics, shapes, quorum, and token-budget gating, see `dispatching-parallel-agents`.

**Use when:** N tasks are genuinely independent (no shared state), and parallelism buys throughput or fault tolerance.

**Concurrency ceiling:** `min(16, cores−2)` per batch; total volume is token-budget-gated, not spawn-count-capped. See Fan-Out Sizing in the main SKILL.md.

---

### 4. Agent Teams (experimental peer-to-peer)

Enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Each teammate is a full Claude Code session; teammates share a self-claim task list and communicate via a peer-to-peer mailbox — no single orchestrator owns the queue.

**Platform limits:**
- Max 25 concurrent teammates.
- No nesting (teammates cannot spawn teams).
- ~7× token consumption in plan mode vs. a single session.
- Docs recommend 3–5 teammates; Sonnet for teammate model.

**Use when:** the work is genuinely collaborative peer-to-peer rather than orchestrator-worker. Rarely justified — the 7× cost and experimental status make this a last resort. The lack of nesting also limits composability.

**Do NOT use for:** ordinary parallel fan-out (use Shape B instead), or when a clear orchestrator→worker topology fits the work.

---

### 5. Dynamic Workflows / agent-view (Workflow tool)

"Orchestrate work across tens to hundreds of agents in the background." This IS the Workflow tool — a deterministic skeleton (JavaScript/TypeScript) with `agent()` fan-out inside. The skeleton is deterministic code; only the `agent()` calls are indeterminate (LLM judgment).

**Use when:** fan-out volume exceeds what Agent-tool batches can sustain, background execution is needed, or the orchestration logic benefits from being expressed as code (branching, loops, dynamic unit generation).

**Key properties:**
- Concurrency managed by `maxInFlight` in `DispatchPolicy` (default cap: `min(16, cores−2)`; platform max 25).
- Token-budget gating via `getRemainingBudget: () => budget.remaining()`.
- All fan-out through `parallelFanout`, `sequentialChain`, or `dimensionalReview` helpers — see `dispatching-parallel-agents` and `scripts/lib/dispatch.mjs`.

---

### (API) Managed Agents multi-agent sessions

> Not reachable from a Claude Code CLI session — included for completeness when building API-driven product features. It is NOT a sixth option on the CLI decision ladder above.

Available through the Anthropic API (not Claude Code CLI). Coordinator-worker topology with the API managing session state.

**Platform limits:**
- ≤ 25 concurrent threads.
- 1-level delegation only (coordinator → workers; no deeper nesting).
- ≤ 20 unique agents per session.

**Use when:** building API-driven product features that need multi-agent orchestration without a local CLI session.

---

## Determinate vs. Indeterminate Routing

| Segment | Routing |
|---|---|
| Skeleton logic (branching, loops, unit generation) | Determinate — code |
| Per-unit reasoning / judgment | Indeterminate — LLM (`agent()` call) |

Keep determinate logic in code; push only the parts that genuinely require language-model judgment into `agent()` calls. This maximizes reproducibility and minimizes token cost.

---

## Escalation Ladder

```
inline → single subagent → parallel batch → Dynamic Workflow
       ↑                                         ↑
       cheapest                             highest volume
```

Agent Teams sit off the main ladder — they're a peer-to-peer alternative to the orchestrator-worker model, not a higher rung of it.

Move up the ladder only when the current rung is insufficient. Justify each step.
