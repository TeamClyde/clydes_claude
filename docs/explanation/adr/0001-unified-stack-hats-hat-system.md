# ADR-0001: Unified stack-hats hat system

## Status

Proposed

<!-- DRAFT for review — surfaced at the stack-hats tree close (2026-06-16), not yet committed.
     Promote to "Accepted" when PR #65 (stack-hats Phase 2 = 2a + 2b) merges to main. -->

## Related

Parent: docs/workflow-map.md

## Supersedes

_(none)_

## Superseded by

_(none)_

## Context

Per-stack engineering knowledge was scattered and partly manual: the architect agent already carried an ad-hoc "domain hat" notion, best-practice + tooling guidance for a stack lived nowhere reusable, deciding whether a tool was safe to install was unsystematic, and wiring a repo's stack (the `project.json` `stacks` array) plus installing that stack's tooling was hand-done. We needed one coherent system — a single source of per-stack truth, consumed everywhere it matters, with safe installs and automated setup — rather than three loosely related features.

## Decision

Adopt a **single unified hat system** built across three phases off **one source** (`project.json` `stacks` → `~/.claude/stacks/<tech>.md`):

- **Phase 1 — catalog + consumption.** A global, composable per-stack catalog `stacks/<tech>.md` with two required sections, `## Tooling` and `## Hat` (a section ends at the next `## `). It is consumed at three points off the one source: a SessionStart hook (`stack-hat-directive.mjs`) injects `## Hat`; `executing-plans` / `subagent-driven-development` resolve active hats during code generation; the `architect` agent adherence-checks against active hats. The architect's pre-existing "domain hat" is unified into this — same concept, one mechanism.
- **Phase 2a — install vetting.** An **advisory, never-blocking** 3-gate funnel (`vet-reputation` → `vet-capability-fit` → `vet-security`) orchestrated by `vet-install`, plus an advisory `PreToolUse` hook. It informs and always asks; it never auto-installs and never denies. Contract: `rules/install-vetting.md`.
- **Phase 2b — setup automation.** A **verification-first** `Phase 3.5 — Stack Setup` in the `project-setup` skill: a deterministic marker→stack detector (`detect-stacks.mjs`) → propose-then-confirm of `project.json` `stacks` → per-stack catalog-coverage verification that **escapes** (skips, never auto-authors) when a stack lacks a catalogued `~/.claude/stacks/<s>.md` `## Tooling` → drives the Phase-2a funnel per catalog tool (prompt-first) → records installs + the three gate verdicts in a per-repo `docs/reference/stack-setup.md`.

The defining invariants: **one source** (`project.json` `stacks`); **advisory end-to-end** (the user decides every install); and **verification-first** (the system consumes and verifies the catalog but never silently authors it — catalog growth is a deliberate upstream act).

## Alternatives Considered

- **Keep the architect's "domain hat" and a new "stack hat" as separate concepts** — rejected; they are the same idea, so unifying them avoids two drifting mechanisms (the load-bearing reason subagents resolve hats deterministically off the one source rather than relying on ambient injection).
- **Path-scoped rules instead of a SessionStart hook for `## Hat` injection** — rejected; the hook gives size control (budget + degrade-to-pointer) that static rule loading does not.
- **A blocking / hard-gating install vetting step** — rejected; advisory-only is load-bearing — the funnel informs and recommends, the user always decides; no gate result (not even RED) blocks.
- **A standalone `stack-setup` skill** — rejected for v1; one caller (onboarding) → a phase inside `project-setup` (Phase 3.5). Extract later only if a second caller emerges.
- **Auto-author a catalog entry when a detected stack is uncatalogued** — rejected; Phase 2b is verification-first and *escapes* (surfaces + skips) instead. Auto-drafting opinionated `## Hat` content mid-install would undermine the catalog as a deliberate, reviewed source of truth.

## Consequences

- **Gained:** one coherent, single-source hat system; reusable per-stack best-practice + tooling guidance applied at session start, code-gen, and review; advisory supply-chain safety before any workflow-initiated install; and automated, prompt-first stack setup with a per-repo provenance/audit trail.
- **Gave up:** a detected-but-uncatalogued stack cannot be set up until its catalog entry is authored upstream (the detector advertises python/node/rust/go/flutter but only `python.md` ships — others escape by design); and the funnel re-vets catalog-curated tools at install time (intentional — it catches drift and produces the recorded verdict, at some redundancy).
- **Follow-up required:**
  - Promote this ADR to **Accepted** when PR #65 (stack-hats Phase 2) merges to `main`.
  - This repo has no ADR-zero / Diátaxis ADR scaffolding yet (normally seeded by `project-setup` Phase 1.5); this is the first ADR (`0001`). Scaffold `0000-record-architecture-decisions.md` + the ADR README if the repo adopts the full layout.
  - Author additional `stacks/<tech>.md` catalog entries (node, rust, go, flutter, …) as those stacks are needed, so Phase 3.5 stops escaping them.
