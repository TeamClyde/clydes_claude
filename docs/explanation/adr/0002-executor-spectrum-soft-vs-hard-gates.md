# ADR-0002: Executor spectrum — markdown vs code (soft vs hard gates)

## Status

Accepted (2026-06-19, at the phase-1b-docs sub-plan close).

## Related

Parent: docs/explanation/features/orchestration-gating.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

Every workflow component is "instructions," but two different executors run them: the **LLM** reads markdown (rules, skills, agents) and follows it with judgment, while a **deterministic runtime** executes code (hooks, and JS workflows). The two executors have opposite failure modes — markdown is flexible and language-aware but non-deterministic (a gate can be misread, skipped, or rationalized away), whereas code gives exact sequencing and fan-out but is rigid and subject to ordinary programming bugs. As the workflow grew, we needed a principled, repeatable rule for deciding **where each control edge (gate) belongs** rather than placing gates ad hoc.

## Decision

Adopt the **executor-spectrum** principle: **put cognition in markdown, put control flow in code.** Gates that require judgment live as **soft gates** in rules/skills/agents (LLM-interpreted); gates that require guaranteed sequencing, fan-out, or unconditional blocking live as **hard gates** in hooks/workflows (runtime-executed). A *workflow* is the hybrid — a deterministic code skeleton whose steps each delegate back to the LLM via `agent()` calls. An edge is **hardened from prose to code only as it matures and its stakes rise**; hardening trades "the model might skip it" for "the code might deadlock," moving risk from *compliance* to *engineering*, so it is reserved for mature, high-stakes edges.

## Alternatives Considered

- **All-hard (encode every gate in hooks/workflow code)** — rejected: loses the LLM's language-aware judgment, multiplies engineering surface and deadlock risk, and over-constrains edges that are still evolving.
- **All-soft (keep every gate in markdown)** — rejected: non-deterministic; load-bearing gates get skipped or rationalized away under context pressure, with no runtime backstop.
- **Harden everything eagerly the moment a gate exists** — rejected: prematurely converts compliance risk into engineering risk before an edge is well understood. The deep-research harness's verification barrier — which over-fanned its votes and deadlocked — is the cautionary case for hardening before maturity.

## Consequences

- **Gained:** a single, repeatable placement heuristic for every new gate; a maturity-gated hardening path (soft first, harden only proven high-stakes edges); clearer reasoning about each gate's failure mode (compliance vs engineering).
- **Gave up:** uniformity — there are two substrates to reason about, and contributors must judge which a given gate belongs in.
- **Follow-up:** each candidate hardening (soft → code) is evaluated case-by-case against edge maturity and stakes; the `orchestration-gating` feature doc is the narrative home for that judgment.
