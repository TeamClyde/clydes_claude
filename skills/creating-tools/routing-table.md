# Routing Table — Artifact Types to Skills

Reference table for `creating-tools` orchestration. Each row defines the complete routing for one artifact type.

| Artifact type | Process skill | Structure skill | Eval / Test mechanism | Notes |
|---|---|---|---|---|
| skill | `writing-skills` | `creating-tools/frontmatter-reference.md` + bundled `anthropic-best-practices.md` | Pulser CLI: static lint + eval.yaml + conflict detection | Full TDD cycle (RED-GREEN-REFACTOR) then Phase 3 Pulser eval |
| agent | `writing-agents` | `creating-tools/frontmatter-reference.md` (owned locally) | Subagent pressure scenarios via `testing-agents-with-subagents.md` | Baseline dispatch required before system prompt |
| rule | `writing-rules` | (no structural delegate — rules have minimal structure) | Observational (live sessions, 2–3 runs) | No eval loop; ship when unambiguous |
| hook | — | `plugin-dev:hook-development` | Manual execution test | Direct delegation; no process wrapper |
| command | — | `plugin-dev:command-development` | Manual invocation test | Direct delegation; no process wrapper |
| full plugin | — | `plugin-dev:create-plugin` | Per-plugin type | 8-phase guided workflow covers all sub-types |

## Plugin State Reference

These plugins are the targets of delegated routes. Their state determines how they are invoked.

| Plugin | State | Invocation |
|---|---|---|
| `plugin-dev` | Integrated | Route through `creating-tools` — never invoke plugin-dev skills directly |
| `skill-creator` | Active | May be invoked directly for experimentation; not part of orchestration layer |

See `plugins/registry.md` for full plugin lifecycle details.

## Routing Boundaries

**Do not route to `skill-creator` from `creating-tools`.** skill-creator is Active (not Integrated). It may be used directly by the user for CSO benchmarking and experimentation. The orchestration layer does not wrap it.

**`writing-skills` is the full-cycle entry point for skills.** It includes the Pulser eval phase (Phase 3). Do not route to `plugin-dev:skill-development` — `rules/plugin-lifecycle.md` forbids invoking it, and `writing-skills` does not depend on it. Structural conventions are owned locally in `creating-tools/frontmatter-reference.md`.

**`writing-agents` is the full-cycle entry point for agents.** Structural guidance is owned locally in `creating-tools/frontmatter-reference.md`, not delegated — `rules/plugin-lifecycle.md` forbids invoking `plugin-dev:agent-development`, so a skill that depends on it leaves authors with no reachable reference. The reference covers agents and skills side by side, because the differences between the two surfaces are what authors get wrong.
