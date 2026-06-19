# ADR-0004: Hand-rolled per-unit-FSM fail-successfully primitive for agent fan-outs

## Status

Accepted (2026-06-19, at the phase-2-audit sub-plan close).

## Related

Parent: docs/explanation/orchestration-regulation-layer.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

Multi-agent fan-outs deadlock when a single hung or straggler agent holds a barrier that waits for all results — the `deep-research` harness froze exactly this way (friction issue #76), and the Phase 2 orchestration audit is the same shape. The Claude Code runtime offers no public per-agent timeout/abort API, a shared-`AbortController` regression can cascade one sibling's failure to the rest, and a script cannot preempt (kill) a hung agent's concurrency slot. Heavy durable-execution frameworks (Temporal, Inngest) solve *persistence/resume* but not the *active* timeout/quorum problem — adopting one would not have fixed #76, because the hang was never a durability problem. We needed a small, reusable mechanism that delivers a deterministic liveness guarantee out of non-deterministic agents.

## Decision

Adopt a **minimal hand-rolled fail-successfully primitive** (`scripts/lib/fail-successfully.mjs`) as the repo standard for agent fan-outs:

- **`withWatchdog(workFn, ms)`** — races work against a `setTimeout` deadline, resolving a discriminated result (never rejects); a timeout is a value, not an exception.
- **`runUnit(spec)`** — a per-unit lifecycle FSM `PENDING → RUNNING → VALIDATING → {SUCCEEDED | RETRYING(repair) | TIMED_OUT | FAILED} → ABANDONED`, where **validation failure is a control signal** fed back as repair context (validation-as-feedback), reaching `ABANDONED` only after the retry budget. `runUnit` always reaches a terminal state — never hangs, never rejects.
- **`quorumBarrier(units, threshold)`** — proceeds on a **quorum of terminal states**, not all-`SUCCEEDED`; a straggler bounded to `ABANDONED` can never hold the barrier, and captured `SUCCEEDED` values make abandoning non-lossy.

Use **step-memoization** (inherited from the Workflow runtime's `resumeFromRunId`) rather than deterministic-replay, and keep each fan-out wave **≤ the concurrency cap** so a timed-out-but-still-running unit cannot starve a slot. Pin leaf agents to cheap models (`haiku`/`sonnet`); do not inherit the session model for high-count fan-outs.

## Alternatives Considered

- **Adopt Temporal / Inngest (durable-execution framework)** — rejected: durability ≠ regulation. A framework gives the *passive* half (persistence/resume) for free; the *active* half (timeout, barrier, retry, abandon) must be built regardless, and adopting one would not have fixed #76. Overkill for short, cheap-to-rerun Claude Code runs.
- **Bare timeout / slack alone** — rejected: gives liveness but is **lossy**. `Promise.race` frees the *await* but not the concurrency slot, so orphaned timed-out agents starve the rest (observed in the deep-research experiment, dossier §7 run 1).
- **All-or-nothing barrier (`Promise.all` over raw `agent()`)** — rejected: this *is* the #76 deadlock — one hung agent freezes the run.
- **Schema-validation-only gating** — rejected: catches malformed output, not wrong-but-plausible output; ~75% of multi-agent failures are silent semantic errors a shape check certifies as fine. Hence validation-as-feedback with semantic (adversarial/judge) checks, not just schema.

## Consequences

- **Gained:** a reusable, `node`-tested (10 fault-injection tests) primitive guaranteeing liveness + non-lossiness, **validated on a live target** — when a mid-run session-token limit killed ~200 of the Phase 2 audit's 290 agents, the run **degraded to partial results instead of deadlocking**. This is the regulation layer's first proven building block.
- **Gave up:** preemption — a script cannot kill a hung agent's slot, so fan-out must stay ≤ the concurrency cap (a standing constraint until the runtime ships abortable subagents). The validator carries a non-zero false-negative floor and an over-retry risk that need tuning.
- **Follow-up:** the regulation-layer build (`orchestration-regulation-layer.md` §9) extends this primitive with a durable harness-owned store, supervisor/observability, and LLM-judge tuning, and refactors the `deep-research` harness as the next, higher-stakes target. The Phase 2 audit also surfaced that the gate-map's "hard/soft" labels conflate enforcement-hardness with invocation-explicitness — the regulation layer must define one unambiguous enforcement taxonomy.
