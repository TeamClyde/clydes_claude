---
**Feature:** Stack Hats
**C4 Layer:** C3 Component
**Status:** Active
**Owner:** solo
**Last updated:** 2026-06-18
**Related plans:** plans/orchestration-layer-foundation/ (Phase 1B docs)
**Related ADRs:**
  - [ADR-0001](../adr/0001-unified-stack-hats-hat-system.md) — Unified stack-hats hat system (Accepted)
**Key files:**
  - `rules/stack-hats.md` — the per-stack best-practice layer + resolution algorithm
  - `~/.claude/stacks/<stack>.md` — per-technology catalog (the `## Hat` section)
  - `.claude/hooks/sessionStart/stack-hat-directive.mjs` — session-start hat injection
---

# Stack Hats

## Context & Scope

Stack Hats is the per-technology best-practice layer for this workflow. A **stack hat** is specialist guidance — preferred patterns, mandatory tooling conventions, and quality constraints — for a specific technology (Python, React, C/C++, and so on). It layers on top of SE-fundamentals and never replaces them.

The key properties of the system:

- **Composable.** A repo that uses multiple technologies wears multiple hats simultaneously. A Python+React repo applies both the Python hat and the React hat; neither overrides the other and SE-fundamentals remain the floor.
- **Opt-in per repo.** A repo joins the system by declaring `"stacks": ["python", "react"]` in its `project.json`. Repos without a `stacks` field receive no hat guidance, with no error.
- **Global catalog, per-repo opt-in.** The hat definitions live in `~/.claude/stacks/<stack>.md` — once authored there, they are available across every repo. The repo's `project.json` controls which catalog entries apply to it. This is the load-bearing design choice: a globally catalogued hat carries cross-repo tool awareness (a tool vetted for one repo is known-vetted when a second repo onboards), which a repo-local copy would not.
- **Advisory end-to-end.** Hats inform and constrain code generation and review. They do not gate or block.

What this feature does NOT cover: install vetting (the 3-gate `vet-install` funnel), automated stack setup (`project-setup` Phase 4 — Tooling Setup), or the `## Tooling` section of catalog files. Those are governed by the same ADR (ADR-0001) but are separate operational concerns. This explainer covers the hat system only: catalog structure, resolution, and the three leverage moments.

## Building Block View

### The catalog

Each technology's guidance lives in a single file at `~/.claude/stacks/<stack>.md`. The filename is the stack identifier and must match the string in `project.json` `stacks` exactly (case-sensitive, alphanumeric plus hyphens and underscores only).

Each catalog file has two required top-level sections:

- `## Tooling` — declares the tools the workflow installs for this stack. Consumed by `project-setup` Phase 4.
- `## Hat` — the best-practice and constraint body consumed by the hat system. A section ends at the next `## ` heading.

The `## Hat` section is the unit of currency for everything described in this document. It is a free-form markdown block that should contain: preferred patterns, things to avoid, linting/formatting conventions, security constraints, and any stack-specific invariants that generated code must satisfy.

The catalog is `~/.claude/stacks/` — a **global** directory, not per-repo. Authoring a new entry is a deliberate upstream act. The system never auto-drafts or auto-commits a catalog entry. When `project-setup` Phase 4 encounters a declared stack with no readable catalog file, it surfaces the gap and skips (escapes) rather than writing a placeholder.

### The opt-in signal

`project.json` at the repo root is the sole opt-in mechanism. The `stacks` array lists zero or more stack identifiers:

```json
{
  "stacks": ["python", "react"]
}
```

The array may be hand-edited at any time, or populated by `project-setup` Phase 4 via propose-then-confirm (never silently written). An absent `stacks` field, an empty array, or a stack name with no matching catalog file are all treated identically: no hat for that stack, no error.

### Resolution algorithm

The resolution algorithm is deterministic and has exactly two steps:

1. Read `project.json` at the repo root and extract the `stacks` array.
2. For each name in the array, read `~/.claude/stacks/<name>.md` and extract the body of the `## Hat` section (from the line after `## Hat` to the next `## ` heading, exclusive).

Hats that resolve successfully are composed — concatenated in array order — and applied together. A missing file or a missing `## Hat` section for a given stack name produces a "no hat" outcome for that stack; the remaining stacks are unaffected.

**Subagents resolve hats themselves.** This is a hard requirement from ADR-0001. The architect agent, the implementer subagent, and the reviewer subagent each run in their own context window and cannot assume the SessionStart injection reached them. Every subagent that needs hat guidance must re-run the two-step resolution against `project.json` and the catalog files directly. Do not pass hats through inter-agent messaging as a substitute.

## Runtime View

The hat system has three leverage moments. At each moment a different actor runs the two-step resolution and uses the result in a specific way.

### 1. Session start — ambient injection

`.claude/hooks/sessionStart/stack-hat-directive.mjs` runs automatically at the beginning of every Claude Code session where a `project.json` with a non-empty `stacks` array is present in the working directory.

The hook:
1. Reads `project.json` and extracts `stacks`.
2. For each declared stack, reads the corresponding catalog file and extracts the `## Hat` section.
3. Composes the collected hat bodies.
4. Applies a size budget:
   - **Under budget:** emits the full hat content as `additionalContext` under the key `Stack hats active for this repo`.
   - **Over budget:** emits a pointer-per-hat directive (`read ~/.claude/stacks/<name>.md §Hat`) instead of inline content. The session then reads individual catalog files on demand.
5. If any declared stack has no catalog file or no `## Hat` section, appends a note listing the uncatalogued names. This is informational; it does not block session start.
6. If no stacks are declared or all declared stacks are uncatalogued, exits silently (exit 0, no output).

The hook never blocks session start. All code paths exit 0. The `CLAUDE_DISABLE_WORKFLOW_HOOKS` environment variable bypasses the hook entirely for testing or emergency recovery.

The session-start injection is ambient: it places the active hats into the main session's context as a reminder. It is not authoritative for subagents — see the resolution requirement above.

### 2. Code generation — executing-plans and subagent-driven-development

When generating code, the `executing-plans` and `subagent-driven-development` skills resolve the active hats and apply them to the code they produce. Generated code must satisfy the constraints and follow the patterns declared in the active hats. A hat violation in generated code is a quality failure, not merely advisory.

This is the enforcement moment. SE-fundamentals are the floor; active hats add technology-specific constraints above the floor. Both apply simultaneously.

### 3. Review — the architect agent

The `architect` agent resolves active hats as one criterion of its review (stack-hat adherence). The agent:

1. Reads `project.json` `stacks` from the repo root.
2. For each stack, reads `~/.claude/stacks/<stack>.md` and extracts `## Hat`.
3. Checks the plan's approach and proposed implementation against each active hat.
4. A plan step that contradicts an active hat's best-practice is at minimum a MINOR finding; BLOCKING if following the plan as written would produce incorrect or unsafe behavior for that stack.

The architect agent's "active domain hat" concept and the stack hat system are **the same mechanism** (ADR-0001 unified them). Prior to unification, the architect carried an ad-hoc domain hat concept that drifted from session to session; unifying it into the `stacks` → `~/.claude/stacks/<name>.md` source eliminated two diverging mechanisms and made hat application reproducible.

If no `stacks` are declared, the architect notes "no active hats" and skips the criterion. If a declared stack has no readable catalog file or no `## Hat` section, the architect notes "no readable hat for `<name>`" and skips that specific stack — it never stalls on an uncatalogued stack.

### No-op behavior

At every leverage moment, the absence of a hat is handled gracefully:

| Condition | Behavior |
|---|---|
| No `stacks` field in `project.json` | No hat applies; proceed on SE-fundamentals |
| `stacks` is an empty array | No hat applies; proceed on SE-fundamentals |
| Stack name in `stacks` but no `~/.claude/stacks/<name>.md` | No hat for that stack; others unaffected |
| Catalog file exists but has no `## Hat` section | No hat for that stack; others unaffected |

None of these conditions produce an error or block any workflow step.

## Dependencies

- **`project.json` (per-repo)** — the opt-in signal. Must exist at repo root and contain a `stacks` array for any hat to activate.
- **`~/.claude/stacks/<stack>.md` (global catalog)** — the source of hat content. One file per technology. Managed outside of any individual repo; shared across all repos.
- **`.claude/hooks/sessionStart/stack-hat-directive.mjs` (this repo)** — the SessionStart hook. Installed globally by `scripts/setup.sh` as part of the workflow bootstrap.
- **`rules/stack-hats.md` (this repo)** — the canonical rule file. Governs resolution algorithm and leverage moment obligations. Loaded by subagents as a rule, not as ambient context.
- **`agents/architect.md`** — the architect agent system prompt. The stack-hat-adherence criterion runs the two-step resolution directly and applies it to plan evaluation.
- **`skills/executing-plans/` and `skills/subagent-driven-development/`** — the code-generation skills that apply hat constraints during implementation.
- **`project-setup` skill (Phase 4 — Tooling Setup)** — the automated stack-setup phase that populates `project.json` `stacks` via propose-then-confirm and verifies catalog coverage. Dependency is one-directional: Phase 4 writes to `project.json`; the hat system reads from it.

## Decisions

Backlinks to ADRs that govern this feature (status inline).

- [ADR-0001](../adr/0001-unified-stack-hats-hat-system.md) — Unified stack-hats hat system (Accepted)

## Known Issues & Gotchas

- **Subagents must resolve hats themselves.** The SessionStart injection reaches only the main session. Any subagent that omits the two-step resolution and assumes hats were passed to it will apply no hat guidance silently — there is no error. This is the most common misuse pattern to watch for when authoring new subagents.

- **Stack identifier is case-sensitive and filename-matched.** `"Python"` in `project.json` does not resolve `python.md`. The catalog file must be named exactly `<identifier>.md` with matching case. Errors of this kind are silent (the hook notes the stack as uncatalogued and continues).

- **Budget threshold controls inline vs pointer mode at session start.** If composed hat content exceeds the size budget, the hook switches to pointer-per-hat mode. In pointer mode the session must read individual catalog files on demand. Keep individual `## Hat` sections focused — verbose hats that exceed the budget are harder for the session to consume inline.

- **Uncatalogued stacks escape silently in Phase 4.** `project-setup` Phase 4 will note and skip a stack that lacks a `~/.claude/stacks/<name>.md` with a `## Tooling` section rather than blocking or auto-authoring. This is intentional (verification-first), but it means a repo declared as using `node` gets no automated tooling setup until `node.md` is authored and merged into the catalog. The shipped catalog currently contains `python.md`; `node`, `rust`, `go`, `flutter`, and others are acknowledged gaps (see ADR-0001 Consequences).

- **`stacks` array is never written silently.** Phase 4 proposes and confirms before writing `project.json`. If Phase 4 is skipped or aborted mid-run, `project.json` may be missing the `stacks` field entirely, and no hat will activate until it is added manually or Phase 4 is re-run.

- **Repo-local overrides are not supported in v1.** All hat content lives in the global catalog. There is no mechanism to override a global hat's guidance for a specific repo. A local-override hybrid was considered and deferred (ADR-0001 Alternatives Considered). If a repo needs genuinely different behavior from a catalog hat, the current path is to fork the catalog entry under a distinct identifier or wait for v2.

## Observability

- **SessionStart hook output.** At session start, when hats are active, the hook emits a `Stack hats active for this repo` block (inline) or a pointer list (over budget) as `additionalContext`. Absence of this block at session start, for a repo with a `stacks` array, indicates the hook did not run — check that `setup.sh` has been run in this environment and that `CLAUDE_DISABLE_WORKFLOW_HOOKS` is not set.

- **`project.json` `stacks` array.** The canonical record of which hats the repo has opted into. Inspect this file directly to determine which hats should be active.

- **Catalog files at `~/.claude/stacks/`**. List the directory to see which stacks are catalogued globally. Cross-reference with `project.json` to identify any declared-but-uncatalogued gaps.

- **`docs/reference/stack-setup.md` (per-repo, generated by Phase 4).** When `project-setup` Phase 4 has run, this file records the detected stacks, the proposed-and-confirmed `project.json` update, the per-stack catalog coverage outcome, and the gate verdicts for each tool installed. It is the per-repo provenance and audit trail for stack onboarding. It does not exist until Phase 4 has run at least once.

- **Architect review output.** The architect agent's review output includes the stack-hat adherence criterion explicitly. A verdict of "no active hats" or "no readable hat for `<name>`" in the architect output is a diagnostic signal for catalog coverage gaps.

## Glossary

| Term | Definition |
|---|---|
| **Stack hat** | Specialist best-practice and tooling guidance for a specific technology, expressed as the `## Hat` section of a catalog file. Layers on top of SE-fundamentals; never replaces them. |
| **Hat composition** | The combination of multiple active hats when a repo declares more than one stack. Hats are applied simultaneously; no hat overrides another. |
| **Global catalog** | The set of files at `~/.claude/stacks/<stack>.md`. Shared across all repos; authored once and consumed everywhere. Distinct from per-repo opt-in. |
| **Opt-in signal** | The `"stacks"` array in a repo's `project.json`. Controls which catalog entries apply to this repo. |
| **Resolution algorithm** | The two-step deterministic process: (1) read `project.json` `stacks`; (2) for each name, read `~/.claude/stacks/<name>.md` and extract the `## Hat` section body. |
| **Session-start injection** | The ambient delivery of composed hat content to the main session via `stack-hat-directive.mjs`. Informational for the main session; not authoritative for subagents. |
| **Budget / pointer mode** | When composed hat content exceeds the size budget, the SessionStart hook switches from inline delivery to a pointer-per-hat directive, and the session reads catalog files on demand. |
| **SE-fundamentals** | General software engineering best practices that apply regardless of technology. The floor on which hats are layered. |
| **Uncatalogued stack** | A stack name declared in `project.json` `stacks` that has no matching `~/.claude/stacks/<name>.md` or whose file lacks a `## Hat` section. Treated as no-op at all leverage moments. |
| **Leverage moment** | One of the three points in the workflow where hat resolution runs and hat content is applied: session start, code generation, and plan/implementation review. |
| **Active domain hat** | The architect agent's pre-existing concept, unified into the stack hat system by ADR-0001. Same mechanism, same source, one implementation. |
