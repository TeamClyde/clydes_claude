# ADR-0005: Repo-wide orchestration-regulation standard

## Status

Accepted (2026-06-23, at the Orchestration & Regulation Campaign close — Wave 4).

## Related

Parent: docs/explanation/features/orchestration-gating.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

The workflow grew a set of independently-invented multi-agent patterns: each fan-out-capable skill rolled its own dispatch loop, each reviewer invented its own severity words, and "enforcement" conflated two unrelated questions (is a gate code or prose? is a gate invoked by an explicit edge or only referenced in prose?). The Orchestration & Regulation Campaign (a four-wave Epic following the closed `orchestration-layer-foundation`) was scoped to replace that ad-hoc surface with one regulated standard.

Two building blocks already had their own ADRs:

- [ADR-0002](0002-executor-spectrum-soft-vs-hard-gates.md) — the executor spectrum (markdown read by the LLM = soft gates; code run by the runtime = hard gates).
- [ADR-0004](0004-fail-successfully-fanout-primitive.md) — the hand-rolled per-unit-FSM `fail-successfully` primitive (watchdog + `runUnit` + `quorumBarrier`) that delivers a deterministic liveness guarantee out of non-deterministic agents.

ADR-0004's own Consequences flagged the open gap this ADR closes: *"the gate-map's 'hard/soft' labels conflate enforcement-hardness with invocation-explicitness — the regulation layer must define one unambiguous enforcement taxonomy."* The campaign needed a single decision record that ties the front-door, the taxonomy, the decision layer, and the hardening policy into one repo-wide standard.

## Decision

Adopt a **repo-wide orchestration-regulation standard** with four parts, all anchored in `docs/explanation/features/orchestration-gating.md`:

1. **One fan-out front-door.** Every regulated multi-agent fan-out routes through the `dispatching-parallel-agents` skill (three shapes — parallel fan-out, sequential chain, dimensional review — over `scripts/lib/dispatch.mjs`). Every dispatch is `fail-successfully`-wrapped (ADR-0004), model-pinned (Haiku scan / Sonnet judgment, never inherit Opus), and token-budget-gated. Consumers do not re-implement dispatch.

2. **One severity/verdict/enforcement taxonomy.** Three concepts at two granularities: **severity** per finding (`error` / `warning` / `note`, industry-verbatim); **verdict** per gate (`RED` / `GREEN`, computed — `RED` iff ≥1 `error`); **enforcement-hardness** per gate (`hard` = hook / `soft` = markdown, ADR-0002's axis). The explicit-invocation-vs-prose question is a separate, orthogonal axis. Producers (`architect`, `adherence-audit`) and consumers (`plan-gate`, `rules/planning.md`) all use this one vocabulary; `docs-status` keeps its doc-domain surface labels (per `rules/doc-tools.md`) mapped to the canonical tiers.

3. **One decision layer.** The `operating-model` skill is the whether/when/which-executor layer above the front-door: single-threaded is the default, fan-out is the exception that must earn its cost; it carries the 2026 executor map, the circuit-reasoning frame, and the fan-out sizing model. It delegates all dispatch mechanics to the front-door.

4. **Surgical hook-hardening as a compliance safety-net.** Harden only matured × high-stakes × tool-observable edges into `PreToolUse` hooks (the `git-prohibitions` flag guard is the first). This is a safety-net against the assistant's own drift, **not** a security boundary; most control edges are not tool-observable and stay soft by design, recorded in the gating doc's hook-hardening status.

## Alternatives Considered

- **Leave fan-out ad-hoc per component** — rejected: that is the drift this campaign exists to remove (reimplementation, inconsistent reliability, the all-or-nothing barrier deadlock class ADR-0004 documents).
- **Keep per-component severity vocabularies** — rejected: the BLOCKING/MINOR/LOOKS-GOOD vs BLOCKING/WARNING/INFO vs ERRORS/WARNINGS/SUGGESTIONS divergence is exactly the confusion the one taxonomy resolves. The rename is safe because every consumer is in-repo markdown updated atomically (not an external parser — the GCC-`-Werror` enum-rename breakage class does not apply).
- **Hook-harden every matured edge** — rejected: most "matured" edges (architect-before-Done, test-FAILURE→systematic-debugging) are not tool-observable — there is no tool-call signature to intercept — so hardening them is impossible, not merely deferred. Command-string interception is also trivially evadable, so it is the wrong layer for security; the hook is scoped to the honest-mistake (compliance) case only.
- **Retain the fixed "≤20 concurrent" cap** — rejected: it mistook a cost problem for a concurrency problem. Replaced by runtime-ceiling concurrency (`min(16, cores−2)` / platform max 25) + token-budget-gated volume, with model-pinning + batched-verify as the real spend controls.

## Consequences

- **Gained:** one front-door, one taxonomy, one decision layer, and one compliance safety-net — a drift-resistant, DRY regulation layer where every indeterminate dispatch is regulated and every reviewer speaks the same severity language. The taxonomy gap ADR-0004 flagged is closed.
- **Gave up:** the fixed ≤20 cap (superseded by runtime-ceiling + budget gating); full label uniformity (`docs-status` deliberately keeps its doc-domain surface labels per the priority of `rules/doc-tools.md`); and preemption remains unavailable (ADR-0004's standing constraint — fan-out stays ≤ the concurrency cap until the runtime ships abortable subagents).
- **Follow-up:** deploy the new `operating-model` skill + the `git-prohibitions` hook via `setup.sh` (symlink + hook wiring at campaign close); future hook-hardening candidates (`mcp-governance` no-direct-MCP edges) become viable when those edges mature and the relevant integrations are enabled.
